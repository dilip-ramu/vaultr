// The autonomous Investment Cycle (brief §7, §19, §20) and the lighter Research
// Update, rebuilt for the correctness pass.
//
// WHAT CHANGED AND WHY
//
// The old cycle was one long request that re-read the holdings list from the top
// every time. With an analysis costing tens of seconds and a per-invocation cap
// of a handful, positions past the cap were NEVER reached — re-running did not
// help, because it started at the first position again. It also fabricated an
// execution price from cost basis when a quote was missing, and it turned an
// HTTP 429 into "insufficient evidence, hold".
//
// Now:
//   • A cycle is a DURABLE RECORD (lab_cycles) with a frozen work queue and a
//     cursor. An invocation spends its budget, saves the cursor, and returns
//     'in_progress'. The next invocation continues at the next item.
//   • Every unit of work is a CLAIMED STEP (lab_cycle_steps, unique per cycle),
//     and trades/decisions carry that step_id under a unique index — so a
//     retried request cannot execute the same trade twice.
//   • NO PRICE, NO TRADE (item 5). The intent is recorded as a deferred decision
//     with reason UNPRICED and retried in a later cycle.
//   • A RESEARCH FAILURE IS NOT A VIEW (item 9). Transport failures produce a
//     deferred step, never an investment decision.
//   • The recommendation layer receives the Lab's REAL constraints (item 6).
//   • Corporate actions are processed as part of the lifecycle (item 3).
//
// The engine is still completely decoupled from its trigger: a button, a cron or
// an event can all call runInvestmentCycle unchanged. Nothing here can reach a
// broker.

import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeSymbol, type AnalyzeResult, type AnalyzeParams, type AnalyzeOutcome } from '../analyzeCore'
import { analyzePortfolio, type PortfolioSummary } from '../portfolio'
import { researchJson } from '../claude'
import { getMarketRegime } from '../providers/macro'
import { simulateBuy, simulateSell } from './engine'
import { computeNav } from './accounting'
import { markLab, type MarkOptions, type MarkResult } from './marking'
import { syncCorporateActions, type CASyncResult, type CASyncOptions } from './corporate-sync'
import { resolveConstraints, toDecideConfig, constraintsBrief } from './config'
import { makeCachedFundamentalsLoader, readStoredRegime } from './research-cache'
import { replayPosition, latestTrade, type ReplayTrade } from './replay'
import {
  findOpenCycle, createCycle, saveCycle, claimStep, finishStep, stepKey,
} from './cycle-state'
import type {
  LabAccount, LabState, EngineResult, Exchange, RegimeState,
  LabCycle, ResolvedConstraints, DeferReason,
} from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ── Dependency seams (so the lifecycle is testable without network) ──────────

export interface CycleDeps {
  now?: () => Date
  analyze?: (params: AnalyzeParams) => Promise<AnalyzeOutcome>
  mark?: (supabase: SupabaseClient, userId: string, lab: LabAccount, opts?: MarkOptions) => Promise<MarkResult>
  syncCorporate?: (supabase: SupabaseClient, userId: string, lab: LabAccount, opts?: CASyncOptions) => Promise<CASyncResult>
  discover?: (args: { summary: PortfolioSummary; held: string[]; limit: number }) => Promise<Idea[]>
  assessRegime?: typeof getMarketRegime
  markOptions?: MarkOptions
}

export interface Idea { symbol: string; exchange?: string; company_name?: string; category?: string; thesis?: string }

async function loadAccount(supabase: SupabaseClient, userId: string, labId: string): Promise<LabAccount | null> {
  const { data } = await supabase.from('lab_accounts').select('*').eq('id', labId).eq('user_id', userId).limit(1)
  const row = data?.[0]
  return row ? (row as LabAccount) : null
}

function summaryPortfolio(state: LabState): PortfolioSummary {
  return analyzePortfolio(state.positions.map(p => ({
    symbol: p.symbol, exchange: p.exchange, quantity: p.quantity,
    avg_cost: p.quantity > 0 ? p.cost_basis / p.quantity : 0,
    last_price: p.price, sector: p.sector, market_cap_band: p.market_cap_band,
  })))
}

async function defaultDiscover(args: { summary: PortfolioSummary; held: string[]; limit: number }): Promise<Idea[]> {
  const heavy = Object.entries(args.summary.sectorAlloc).filter(([, p]) => p >= 20).map(([s]) => s)
  const prompt = `Surface up to ${args.limit} genuinely interesting, less-obvious Indian listed (NSE/BSE) investment ideas right now. Use web search.
Already held (skip): ${args.held.join(', ') || 'none'}. Sectors already heavy: ${heavy.join(', ') || 'none'}.
Return ONLY JSON: { "ideas": [ { "symbol": string, "exchange": "NSE"|"BSE", "company_name": string, "category": string, "thesis": string } ] }. Only include ideas you can source.`
  const { data } = await researchJson<{ ideas?: Idea[] }>({
    system: 'You are a buy-side analyst scanning the Indian market for less-obvious, well-sourced ideas. Never surface an idea on one ratio alone.',
    prompt, webSearch: true, maxUses: 6, retries: 1,
  })
  return (data?.ideas ?? []).slice(0, args.limit)
}

// ── Persistence of one taken action ─────────────────────────────────────────

async function persistAction(params: {
  supabase: SupabaseClient
  lab: LabAccount
  userId: string
  cycleId: string
  stepId: string
  kind: string
  res: AnalyzeResult
  engine: EngineResult | null
  stateAfter: LabState
  nowIso: string
}): Promise<{ decisionId: string | null; tradeId: string | null }> {
  const { supabase, lab, userId, cycleId, stepId, kind, res, engine, stateAfter, nowIso } = params
  const rec = res.recommendation
  const nav = computeNav(stateAfter.cash, stateAfter.positions)
  const pos = stateAfter.positions.find(p => p.symbol === rec.symbol && p.exchange === rec.exchange)
  const weight = pos && pos.price != null && nav.totalValue > 0 ? round2((pos.price * pos.quantity / nav.totalValue) * 100) : null
  const trade = engine?.trade ?? null

  const { data: dec } = await supabase.from('lab_decisions').insert({
    lab_id: lab.id, user_id: userId, cycle_id: cycleId, step_id: stepId,
    ts: nowIso, kind,
    symbol: rec.symbol, exchange: rec.exchange, company_name: rec.company_name, action: rec.action,
    quantity: trade?.quantity ?? null, price: trade?.price ?? rec.current_price,
    capital_deployed: trade ? (trade.side === 'buy' ? round2(trade.gross_amount + trade.costs_total) : null) : null,
    portfolio_weight: weight,
    reason: rec.why_now, thesis: rec.base_case,
    bull_case: rec.bull_case, base_case: rec.base_case, bear_case: rec.bear_case,
    horizon: rec.horizon, fair_value_low: rec.fair_value_low, fair_value_high: rec.fair_value_high,
    entry_low: rec.entry_low, entry_high: rec.entry_high,
    risks: rec.risks, invalidation: rec.invalidation,
    ai_confidence: rec.ai_confidence, data_confidence: rec.data_confidence, market_regime: rec.market_regime,
    score_breakdown: rec.score_breakdown, sources: rec.sources,
    realized_pnl: trade?.realized_pnl ?? null,
    thesis_invalidated: (kind === 'exit' || kind === 'reduce') ? (res.decision.action === 'SELL' && rec.invalidation.length > 0) : null,
    snapshot: {
      price: rec.current_price, regime: rec.market_regime, total_score: rec.total_score,
      data_confidence: rec.data_confidence, ai_confidence: rec.ai_confidence,
      fundamentals_cached: res.fundamentalsCached,
      fundamentals: res.fundamentals.fundamentals, valuation: res.fundamentals.valuation,
      as_of: nowIso,
    },
    model_version: lab.model_version,
  }).select('id')

  const decisionId = dec?.[0]?.id ?? null
  let tradeId: string | null = null

  if (trade) {
    const { data: tr } = await supabase.from('lab_trades').insert({
      lab_id: lab.id, user_id: userId, cycle_id: cycleId, step_id: stepId,
      ts: nowIso, side: trade.side,
      symbol: trade.symbol, exchange: trade.exchange, quantity: trade.quantity, price: trade.price,
      gross_amount: trade.gross_amount, costs_total: trade.costs_total, costs_breakdown: trade.costs_breakdown,
      cash_after: trade.cash_after, realized_pnl: trade.realized_pnl, model_version: lab.model_version,
      decision_id: decisionId,
    }).select('id')
    tradeId = tr?.[0]?.id ?? null

    await applyPositionState(supabase, lab, userId, stateAfter, trade.symbol, trade.exchange, nowIso)
    await supabase.from('lab_accounts').update({ cash: trade.cash_after, updated_at: nowIso }).eq('id', lab.id)
    lab.cash = trade.cash_after
  }
  return { decisionId, tradeId }
}

/** Write the engine's post-trade position for one symbol. Absolute values, so
 *  re-applying after a crash is safe. */
async function applyPositionState(
  supabase: SupabaseClient, lab: LabAccount, userId: string,
  state: LabState, symbol: string, exchange: string, nowIso: string,
): Promise<void> {
  const p = state.positions.find(x => x.symbol === symbol && x.exchange === exchange)
  if (p && p.quantity > 0) {
    await supabase.from('lab_positions').upsert({
      lab_id: lab.id, user_id: userId, symbol: p.symbol, exchange: p.exchange, company_name: p.company_name,
      quantity: p.quantity, cost_basis: p.cost_basis, sector: p.sector, market_cap_band: p.market_cap_band,
      last_price: p.price, last_price_at: p.priced_at, last_price_source: p.price_source,
      updated_at: nowIso,
    }, { onConflict: 'lab_id,symbol,exchange' })
  } else {
    await supabase.from('lab_positions').delete()
      .eq('lab_id', lab.id).eq('user_id', userId).eq('symbol', symbol).eq('exchange', exchange)
  }
}

/** Record an intention we did NOT act on, and why. This is explicitly not an
 *  investment view: action stays null so nothing can mistake an outage or a
 *  missing quote for a judgement about the company. */
async function recordDeferral(params: {
  supabase: SupabaseClient
  lab: LabAccount
  userId: string
  cycleId: string
  stepId: string
  symbol: string
  exchange: string
  companyName?: string | null
  reason: DeferReason
  detail: string
  intendedAction?: string | null
  nowIso: string
}): Promise<string | null> {
  const { data } = await params.supabase.from('lab_decisions').insert({
    lab_id: params.lab.id, user_id: params.userId, cycle_id: params.cycleId, step_id: params.stepId,
    ts: params.nowIso, kind: 'deferred',
    symbol: params.symbol, exchange: params.exchange, company_name: params.companyName ?? null,
    action: null,
    reason: `Deferred (${params.reason}): ${params.detail}`,
    market_regime: null,
    model_version: params.lab.model_version,
    snapshot: {
      defer_reason: params.reason,
      detail: params.detail,
      intended_action: params.intendedAction ?? null,
      as_of: params.nowIso,
      note: 'No investment conclusion was reached. This step is retried in a later cycle.',
    },
  }).select('id')
  return data?.[0]?.id ?? null
}

/**
 * A step left 'claimed' by a dead invocation. lab_trades is the immutable truth,
 * so if the trade landed we rebuild the position from the trade log rather than
 * re-executing anything.
 */
async function reconcileStep(
  supabase: SupabaseClient, lab: LabAccount, userId: string, stepId: string, nowIso: string,
): Promise<{ recovered: boolean; note: string | null }> {
  const { data: trades } = await supabase.from('lab_trades').select('*').eq('step_id', stepId).limit(1)
  const t = trades?.[0]
  if (!t) return { recovered: false, note: null }

  const { data: allRows } = await supabase.from('lab_trades')
    .select('ts, side, symbol, exchange, quantity, gross_amount, costs_total, cash_after')
    .eq('lab_id', lab.id).eq('user_id', userId)
  const all = (allRows ?? []) as ReplayTrade[]
  const rebuilt = replayPosition(all, t.symbol, t.exchange)

  if (rebuilt.quantity > 0) {
    await supabase.from('lab_positions').upsert({
      lab_id: lab.id, user_id: userId, symbol: rebuilt.symbol, exchange: rebuilt.exchange,
      quantity: rebuilt.quantity, cost_basis: rebuilt.cost_basis, updated_at: nowIso,
    }, { onConflict: 'lab_id,symbol,exchange' })
  } else {
    await supabase.from('lab_positions').delete()
      .eq('lab_id', lab.id).eq('user_id', userId).eq('symbol', rebuilt.symbol).eq('exchange', rebuilt.exchange)
  }

  // Cash: only the most recent trade's cash_after is authoritative.
  const newest = latestTrade(all)
  if (newest && newest.cash_after != null && newest.ts === t.ts) {
    await supabase.from('lab_accounts').update({ cash: newest.cash_after, updated_at: nowIso }).eq('id', lab.id)
    lab.cash = Number(newest.cash_after)
  }
  return { recovered: true, note: `Recovered ${t.side} ${t.symbol} from the trade log after an interrupted invocation.` }
}

// ── The cycle ───────────────────────────────────────────────────────────────

export interface CycleSummary {
  cycleId: string
  status: LabCycle['status']
  phase: LabCycle['phase']
  tradingDate: string
  bought: string[]; sold: string[]; reduced: string[]; added: string[]; held: string[]
  deferred: { symbol: string; reason: string }[]
  analyses: number
  cacheHits: number
  actions: number
  invocations: number
  cashAfter: number
  remaining: number
  resumable: boolean
  navWritten: boolean
  notes: string[]
}

export async function runInvestmentCycle(
  supabase: SupabaseClient,
  userId: string,
  labId: string,
  deps: CycleDeps = {},
): Promise<CycleSummary> {
  const nowFn = deps.now ?? (() => new Date())
  const analyze = deps.analyze ?? analyzeSymbol
  const mark = deps.mark ?? markLab
  const syncCorporate = deps.syncCorporate ?? syncCorporateActions
  const discover = deps.discover ?? defaultDiscover

  let lab = await loadAccount(supabase, userId, labId)
  if (!lab) throw new Error('Lab account not found')
  if (lab.status === 'pending_baseline') {
    throw new Error('This Lab has no pinned benchmark baseline yet, so its results could not be measured. Establish the baseline before running a cycle.')
  }
  if (lab.status !== 'active') throw new Error(`Lab is ${lab.status} — cycles only run on an active Lab.`)

  const k: ResolvedConstraints = resolveConstraints(lab.constraints)
  const decideConfig = toDecideConfig(k)
  const constraintsNote = constraintsBrief(k)
  const invocationStart = Date.now()
  const invocationDeadline = invocationStart + k.invocation_budget_ms
  const notes: string[] = []
  const deferred: { symbol: string; reason: string }[] = []

  /**
   * Live-readiness (Deploy #4). Retry budgets used to be fixed — 2 retries at a
   * 90s timeout — while the whole invocation only had 45s. One slow call could
   * therefore blow past the request budget and the platform would kill it
   * mid-cycle. Timeouts are now derived from the time actually remaining, and
   * every call carries the invocation deadline so it stops retrying rather than
   * overrunning. `share` is the fraction of the remaining time one call may use;
   * an analysis makes two calls, so it asks for less than half each.
   */
  const researchBudget = (share: number) => {
    const remaining = Math.max(0, invocationDeadline - Date.now())
    return {
      retries: remaining > 40_000 ? 2 : remaining > 20_000 ? 1 : 0,
      timeoutMs: Math.max(8_000, Math.min(60_000, Math.floor(remaining * share))),
      deadline: invocationDeadline,
      maxUses: k.max_web_searches_per_analysis,
    }
  }
  const quoteBudget = () => ({
    timeoutMs: 8_000,
    retries: 1,
    deadline: invocationDeadline,
    concurrency: 4,
  })
  const markOpts = (): MarkOptions => ({ ...(deps.markOptions ?? {}), fetchOptions: { ...quoteBudget(), ...(deps.markOptions?.fetchOptions ?? {}) } })

  // ── 1. Mark, and open or resume the cycle ────────────────────────────────
  const markResult = await mark(supabase, userId, lab, markOpts())
  if (!markResult.navWritten && markResult.skippedReason) notes.push(markResult.skippedReason)
  notes.push(...markResult.notes)

  let cycle = await findOpenCycle(supabase, userId, labId)
  const created = !cycle
  if (!cycle) {
    cycle = await createCycle({
      supabase, userId, labId, modelVersion: lab.model_version,
      tradingDate: markResult.tradingDate, nowIso: nowFn().toISOString(),
    })
    cycle.cursor.holdingQueue = markResult.markedPositions
      .filter(p => p.quantity > 0)
      .map(p => stepKey('holding', p.symbol, p.exchange))
  }
  cycle.counters.invocations += 1
  cycle.cursor.markDone = true
  await saveCycle(supabase, cycle, { status: 'in_progress', phase: 'holdings', cursor: cycle.cursor, counters: cycle.counters }, nowFn().toISOString())

  // ── 2. Corporate actions, once per cycle, before any trading ─────────────
  if (!cycle.cursor.corporateDone) {
    const ca = await syncCorporate(supabase, userId, lab, { now: nowFn(), research: researchBudget(0.5) })
    cycle.cursor.corporateDone = true
    notes.push(...ca.notes)
    if (ca.failure) notes.push(`Corporate-action sync unavailable this run (${ca.failure}) — will retry next cycle.`)
    if (ca.dividends || ca.splits || ca.bonuses) {
      // Cash and quantities changed underneath us: reload and re-mark.
      const reloaded = await loadAccount(supabase, userId, labId)
      if (reloaded) lab = reloaded
      const remark = await mark(supabase, userId, lab, markOpts())
      markResult.markedPositions = remark.markedPositions
      markResult.nav = remark.nav
    }
    await saveCycle(supabase, cycle, { cursor: cycle.cursor }, nowFn().toISOString())
  }

  // ── 3. Working state ─────────────────────────────────────────────────────
  let state: LabState = {
    cash: lab.cash,
    positions: markResult.markedPositions.filter(p => p.quantity > 0),
    constraints: k,
    cost_model: lab.cost_model,
  }

  const cacheLoader = makeCachedFundamentalsLoader({
    supabase, userId, ttlHours: k.fundamentals_ttl_hours, now: nowFn(),
    onEvent: e => { if (e.hit) cycle!.counters.cacheHits += 1 },
  })

  const regimeStored = await readStoredRegime(supabase, userId, k.regime_ttl_hours, nowFn())
  const regimeState = regimeStored.state as RegimeState
  if (!regimeStored.fresh) {
    notes.push(regimeStored.as_of
      ? `Market regime last assessed ${regimeStored.ageHours != null ? `${regimeStored.ageHours}h ago` : 'a while ago'} — run a Research Update to refresh it.`
      : 'No market regime has been assessed yet; treating the environment as neutral.')
  }

  const s: CycleSummary = {
    cycleId: cycle.id, status: cycle.status, phase: cycle.phase, tradingDate: cycle.trading_date,
    bought: [], sold: [], reduced: [], added: [], held: [], deferred,
    analyses: cycle.counters.analyses, cacheHits: cycle.counters.cacheHits,
    actions: cycle.counters.actions, invocations: cycle.counters.invocations,
    cashAfter: state.cash, remaining: 0, resumable: false,
    navWritten: markResult.navWritten, notes,
  }

  let analysesThisInvocation = 0
  let consecutiveTransportFailures = 0

  const invocationExhausted = (): string | null => {
    if (analysesThisInvocation >= k.max_analyses_per_invocation) return 'per-invocation analysis budget'
    if (Date.now() - invocationStart >= k.invocation_budget_ms) return 'per-invocation time budget'
    if (consecutiveTransportFailures >= 2) return 'repeated research failures'
    return null
  }
  const cycleExhausted = (): string | null => {
    if (cycle!.counters.analyses >= k.max_analyses_per_cycle) return 'per-cycle analysis budget'
    if (cycle!.counters.actions >= k.max_actions_per_cycle) return 'per-cycle action budget'
    return null
  }

  const analyzeOne = async (
    symbol: string, exchange: Exchange, companyName: string | null, isHolding: boolean,
  ): Promise<AnalyzeOutcome> => {
    const outcome = await analyze({
      symbol, exchange, companyName, isHolding,
      portfolio: summaryPortfolio(state), regimeState,
      config: decideConfig, constraintsNote,
      research: researchBudget(0.45),
      loadFundamentals: cacheLoader,
    })
    analysesThisInvocation++
    cycle!.counters.analyses += 1
    if (outcome.ok) {
      consecutiveTransportFailures = 0
      cycle!.counters.webSearchBudgetUsed += outcome.searchBudgetUsed
    } else {
      consecutiveTransportFailures++
      cycle!.counters.failures += 1
    }
    return outcome
  }

  // ── 4. Evaluate holdings, resuming at the cursor ─────────────────────────
  let yielded: string | null = null

  while (cycle.cursor.holdingIndex < cycle.cursor.holdingQueue.length) {
    const budgetStop = cycleExhausted()
    if (budgetStop) { notes.push(`Stopped evaluating holdings: ${budgetStop} reached.`); break }
    const invStop = invocationExhausted()
    if (invStop) { yielded = invStop; break }

    const key = cycle.cursor.holdingQueue[cycle.cursor.holdingIndex]
    const [, symbol, exchangeRaw] = key.split(':')
    const exchange = (exchangeRaw === 'BSE' ? 'BSE' : 'NSE') as Exchange
    const nowIso = nowFn().toISOString()

    const claim = await claimStep({ supabase, cycle, key, kind: 'holding', symbol, exchange, nowIso })
    if (claim.state === 'settled') { cycle.cursor.holdingIndex++; await saveCycle(supabase, cycle, { cursor: cycle.cursor }, nowIso); continue }
    if (claim.state === 'recover') {
      const rec = await reconcileStep(supabase, lab, userId, claim.step.id, nowIso)
      if (rec.recovered) {
        if (rec.note) notes.push(rec.note)
        await finishStep({ supabase, stepId: claim.step.id, status: 'done', reason: 'recovered from trade log', nowIso })
        cycle.cursor.holdingIndex++
        await saveCycle(supabase, cycle, { cursor: cycle.cursor }, nowIso)
        continue
      }
      // Nothing was written — safe to run the step properly.
    }
    const stepId = claim.step.id

    const held = state.positions.find(p => p.symbol === symbol && p.exchange === exchange)
    if (!held) {
      await finishStep({ supabase, stepId, status: 'skipped', reason: 'position no longer held', nowIso })
      cycle.cursor.holdingIndex++
      await saveCycle(supabase, cycle, { cursor: cycle.cursor, counters: cycle.counters }, nowIso)
      continue
    }

    const outcome = await analyzeOne(symbol, exchange, held.company_name ?? null, true)
    const doneIso = nowFn().toISOString()

    if (!outcome.ok) {
      const reason = outcome.failure.kind as DeferReason
      const decisionId = await recordDeferral({
        supabase, lab, userId, cycleId: cycle.id, stepId, symbol, exchange,
        companyName: held.company_name, reason, detail: outcome.failure.message, nowIso: doneIso,
      })
      await finishStep({ supabase, stepId, status: 'deferred', reason: `${reason}: ${outcome.failure.message}`, decisionId, nowIso: doneIso })
      cycle.counters.deferred += 1
      deferred.push({ symbol, reason })
      cycle.cursor.holdingIndex++
      await saveCycle(supabase, cycle, { cursor: cycle.cursor, counters: cycle.counters }, doneIso)
      continue
    }

    const res: AnalyzeResult = outcome
    const action = res.recommendation.action
    const livePrice = res.currentPrice

    // Item 5: no live price, no trade — record the intent and retry later.
    const needsPrice = action === 'SELL' || action === 'AVOID' || action === 'REDUCE' || action === 'STRONG_BUY' || action === 'ACCUMULATE'
    if (needsPrice && (livePrice == null || !(livePrice > 0))) {
      const decisionId = await recordDeferral({
        supabase, lab, userId, cycleId: cycle.id, stepId, symbol, exchange,
        companyName: held.company_name, reason: 'UNPRICED',
        detail: `No live market price for ${symbol}; the intended action (${action}) is preserved and will be retried.`,
        intendedAction: action, nowIso: doneIso,
      })
      await finishStep({ supabase, stepId, status: 'deferred', reason: `UNPRICED (intended ${action})`, decisionId, nowIso: doneIso })
      cycle.counters.deferred += 1
      deferred.push({ symbol, reason: 'UNPRICED' })
      cycle.cursor.holdingIndex++
      await saveCycle(supabase, cycle, { cursor: cycle.cursor, counters: cycle.counters }, doneIso)
      continue
    }

    let engine: EngineResult | null = null
    let kind = 'hold'

    if (action === 'SELL' || action === 'AVOID') {
      engine = simulateSell(state, { symbol, exchange, price: livePrice!, quantity: held.quantity, pricedAt: doneIso })
      kind = 'exit'
    } else if (action === 'REDUCE') {
      const qty = Math.max(1, Math.floor(held.quantity / 2))
      engine = simulateSell(state, { symbol, exchange, price: livePrice!, quantity: qty, pricedAt: doneIso })
      kind = 'reduce'
    } else if (action === 'STRONG_BUY' || action === 'ACCUMULATE') {
      const targetPct = Math.min(res.recommendation.max_alloc_pct ?? k.max_single_pct, k.max_single_pct)
      const navBase = computeNav(state.cash, state.positions).totalValue
      const room = Math.max(0, (targetPct / 100) * navBase - (held.price ?? livePrice!) * held.quantity)
      const qty = Math.floor(room / livePrice!)
      if (qty > 0) {
        engine = simulateBuy(state, {
          symbol, exchange, price: livePrice!, quantity: qty, sector: held.sector,
          market_cap_band: held.market_cap_band, company_name: held.company_name,
          dataConfidence: res.recommendation.data_confidence, pricedAt: doneIso,
        })
        kind = 'add'
      }
    }

    if (engine && engine.ok && engine.trade) {
      state = engine.state
      const ids = await persistAction({ supabase, lab, userId, cycleId: cycle.id, stepId, kind, res, engine, stateAfter: state, nowIso: doneIso })
      cycle.counters.actions += 1
      if (kind === 'exit') s.sold.push(symbol)
      else if (kind === 'reduce') s.reduced.push(symbol)
      else s.added.push(symbol)
      await finishStep({ supabase, stepId, status: 'done', reason: kind, decisionId: ids.decisionId, tradeId: ids.tradeId, nowIso: doneIso })
    } else if (engine && !engine.ok) {
      const decisionId = await recordDeferral({
        supabase, lab, userId, cycleId: cycle.id, stepId, symbol, exchange,
        companyName: held.company_name, reason: 'CONSTRAINT',
        detail: engine.reason ?? 'The order did not satisfy the Lab constraints.',
        intendedAction: action, nowIso: doneIso,
      })
      await finishStep({ supabase, stepId, status: 'skipped', reason: engine.reason ?? 'constraint', decisionId, nowIso: doneIso })
      notes.push(`${symbol}: ${action.replace(/_/g, ' ')} not executed — ${engine.reason}`)
    } else {
      const ids = await persistAction({ supabase, lab, userId, cycleId: cycle.id, stepId, kind: 'hold', res, engine: null, stateAfter: state, nowIso: doneIso })
      s.held.push(symbol)
      await finishStep({ supabase, stepId, status: 'done', reason: 'hold', decisionId: ids.decisionId, nowIso: doneIso })
    }

    cycle.cursor.holdingIndex++
    await saveCycle(supabase, cycle, { cursor: cycle.cursor, counters: cycle.counters }, doneIso)
  }

  // ── 5. Discovery, then new ideas ─────────────────────────────────────────
  if (!yielded && !cycleExhausted()) {
    if (!cycle.cursor.discoveryRan) {
      const room = Math.max(0, Math.min(
        k.max_analyses_per_cycle - cycle.counters.analyses,
        k.max_actions_per_cycle - cycle.counters.actions,
      ))
      if (room > 0) {
        const held = state.positions.map(p => p.symbol.toUpperCase())
        const ideas = await discover({ summary: summaryPortfolio(state), held, limit: room })
        cycle.cursor.discoveryQueue = ideas
          .map(i => ({ i, sym: String(i.symbol ?? '').trim().toUpperCase() }))
          .filter(x => x.sym && !held.includes(x.sym))
          .map(x => `${stepKey('idea', x.sym, x.i.exchange === 'BSE' ? 'BSE' : 'NSE')}|${(x.i.company_name ?? '').replace(/\|/g, ' ')}`)
      }
      cycle.cursor.discoveryRan = true
      await saveCycle(supabase, cycle, { phase: 'discovery', cursor: cycle.cursor }, nowFn().toISOString())
    }

    while (cycle.cursor.discoveryIndex < cycle.cursor.discoveryQueue.length) {
      const budgetStop = cycleExhausted()
      if (budgetStop) { notes.push(`Stopped evaluating new ideas: ${budgetStop} reached.`); break }
      const invStop = invocationExhausted()
      if (invStop) { yielded = invStop; break }

      const entry = cycle.cursor.discoveryQueue[cycle.cursor.discoveryIndex]
      const [key, companyName] = entry.split('|')
      const [, symbol, exchangeRaw] = key.split(':')
      const exchange = (exchangeRaw === 'BSE' ? 'BSE' : 'NSE') as Exchange
      const nowIso = nowFn().toISOString()

      const claim = await claimStep({ supabase, cycle, key, kind: 'idea', symbol, exchange, nowIso })
      if (claim.state === 'settled') { cycle.cursor.discoveryIndex++; await saveCycle(supabase, cycle, { cursor: cycle.cursor }, nowIso); continue }
      if (claim.state === 'recover') {
        const rec = await reconcileStep(supabase, lab, userId, claim.step.id, nowIso)
        if (rec.recovered) {
          if (rec.note) notes.push(rec.note)
          await finishStep({ supabase, stepId: claim.step.id, status: 'done', reason: 'recovered from trade log', nowIso })
          cycle.cursor.discoveryIndex++
          await saveCycle(supabase, cycle, { cursor: cycle.cursor }, nowIso)
          continue
        }
      }
      const stepId = claim.step.id

      const outcome = await analyzeOne(symbol, exchange, companyName || null, false)
      const doneIso = nowFn().toISOString()

      if (!outcome.ok) {
        const reason = outcome.failure.kind as DeferReason
        const decisionId = await recordDeferral({
          supabase, lab, userId, cycleId: cycle.id, stepId, symbol, exchange,
          companyName: companyName || null, reason, detail: outcome.failure.message, nowIso: doneIso,
        })
        await finishStep({ supabase, stepId, status: 'deferred', reason: `${reason}: ${outcome.failure.message}`, decisionId, nowIso: doneIso })
        cycle.counters.deferred += 1
        deferred.push({ symbol, reason })
        cycle.cursor.discoveryIndex++
        await saveCycle(supabase, cycle, { cursor: cycle.cursor, counters: cycle.counters }, doneIso)
        continue
      }

      const res: AnalyzeResult = outcome
      const action = res.recommendation.action
      const buyish = action === 'STRONG_BUY' || action === 'BUY'

      if (buyish && (res.currentPrice == null || !(res.currentPrice > 0))) {
        const decisionId = await recordDeferral({
          supabase, lab, userId, cycleId: cycle.id, stepId, symbol, exchange,
          companyName: companyName || null, reason: 'UNPRICED',
          detail: `No live market price for ${symbol}; the intended ${action} is preserved and will be retried.`,
          intendedAction: action, nowIso: doneIso,
        })
        await finishStep({ supabase, stepId, status: 'deferred', reason: `UNPRICED (intended ${action})`, decisionId, nowIso: doneIso })
        cycle.counters.deferred += 1
        deferred.push({ symbol, reason: 'UNPRICED' })
        cycle.cursor.discoveryIndex++
        await saveCycle(supabase, cycle, { cursor: cycle.cursor, counters: cycle.counters }, doneIso)
        continue
      }

      if (buyish) {
        const targetPct = Math.min(res.recommendation.max_alloc_pct ?? k.max_single_pct, k.max_single_pct)
        const navBase = computeNav(state.cash, state.positions).totalValue
        const qty = Math.floor(((targetPct / 100) * navBase) / res.currentPrice!)
        const engine = qty > 0
          ? simulateBuy(state, {
              symbol, exchange, price: res.currentPrice!, quantity: qty,
              sector: res.fundamentals.sector, market_cap_band: res.fundamentals.market_cap_band,
              company_name: res.recommendation.company_name, dataConfidence: res.recommendation.data_confidence,
              pricedAt: doneIso,
            })
          : null

        if (engine && engine.ok && engine.trade) {
          state = engine.state
          const ids = await persistAction({ supabase, lab, userId, cycleId: cycle.id, stepId, kind: 'buy', res, engine, stateAfter: state, nowIso: doneIso })
          cycle.counters.actions += 1
          s.bought.push(symbol)
          await finishStep({ supabase, stepId, status: 'done', reason: 'buy', decisionId: ids.decisionId, tradeId: ids.tradeId, nowIso: doneIso })
        } else {
          const detail = engine?.reason ?? 'No compliant quantity available.'
          const decisionId = await recordDeferral({
            supabase, lab, userId, cycleId: cycle.id, stepId, symbol, exchange,
            companyName: companyName || null, reason: 'CONSTRAINT', detail, intendedAction: action, nowIso: doneIso,
          })
          await finishStep({ supabase, stepId, status: 'skipped', reason: detail, decisionId, nowIso: doneIso })
          notes.push(`${symbol}: ${action.replace(/_/g, ' ')} not taken — ${detail}`)
        }
      } else {
        const ids = await persistAction({ supabase, lab, userId, cycleId: cycle.id, stepId, kind: 'watch', res, engine: null, stateAfter: state, nowIso: doneIso })
        notes.push(`${symbol}: ${action.replace(/_/g, ' ')} — noted, not bought`)
        await finishStep({ supabase, stepId, status: 'done', reason: 'watch', decisionId: ids.decisionId, nowIso: doneIso })
      }

      cycle.cursor.discoveryIndex++
      await saveCycle(supabase, cycle, { cursor: cycle.cursor, counters: cycle.counters }, doneIso)
    }
  }

  // ── 6. Yield or finalise ─────────────────────────────────────────────────
  const remaining =
    (cycle.cursor.holdingQueue.length - cycle.cursor.holdingIndex) +
    (cycle.cursor.discoveryQueue.length - cycle.cursor.discoveryIndex) +
    (cycle.cursor.discoveryRan ? 0 : 1)
  const finishedWork = remaining <= 0 || cycleExhausted() != null
  const nowIso = nowFn().toISOString()

  if (!finishedWork && yielded) {
    notes.push(`Paused after ${analysesThisInvocation} ${analysesThisInvocation === 1 ? 'analysis' : 'analyses'} (${yielded}). Run the cycle again to continue at item ${cycle.cursor.holdingIndex + cycle.cursor.discoveryIndex + 1} — it will not start over.`)
    await saveCycle(supabase, cycle, {
      status: 'in_progress', phase: cycle.cursor.discoveryRan ? 'discovery' : 'holdings',
      cursor: cycle.cursor, counters: cycle.counters,
      summary: { ...cycle.summary, notes, deferred },
    }, nowIso)
  } else {
    const finalMark = await mark(supabase, userId, lab, markOpts())
    s.navWritten = finalMark.navWritten
    const reloaded = await loadAccount(supabase, userId, labId)
    if (reloaded) lab = reloaded

    await supabase.from('lab_decisions').insert({
      lab_id: lab.id, user_id: userId, cycle_id: cycle.id, ts: nowIso, kind: 'cycle',
      reason: `Cycle: ${s.bought.length} bought, ${s.added.length} added, ${s.reduced.length} reduced, ${s.sold.length} exited, ${s.held.length} held, ${cycle.counters.deferred} deferred.${cycle.counters.actions === 0 ? ' No attractive action — holding cash.' : ''}`,
      market_regime: regimeState, model_version: lab.model_version,
      snapshot: {
        summary: { bought: s.bought, added: s.added, reduced: s.reduced, sold: s.sold, held: s.held, deferred },
        counters: cycle.counters, trading_date: cycle.trading_date,
        nav_written: finalMark.navWritten, nav_quality: finalMark.nav.quality,
        as_of: nowIso,
      },
    })

    const anyProblem = cycle.counters.deferred > 0 || cycle.counters.failures > 0 || !finalMark.navWritten || cycleExhausted() != null
    await saveCycle(supabase, cycle, {
      status: anyProblem ? 'partial' : 'completed', phase: 'done',
      cursor: cycle.cursor, counters: cycle.counters, completed_at: nowIso,
      summary: { ...cycle.summary, notes, deferred },
    }, nowIso)
  }

  s.status = cycle.status
  s.phase = cycle.phase
  s.analyses = cycle.counters.analyses
  s.cacheHits = cycle.counters.cacheHits
  s.actions = cycle.counters.actions
  s.invocations = cycle.counters.invocations
  s.cashAfter = lab.cash
  s.remaining = Math.max(0, remaining)
  s.resumable = cycle.status === 'in_progress'
  if (created) notes.unshift(`Started cycle ${cycle.id.slice(0, 8)} for session ${cycle.trading_date}.`)
  else notes.unshift(`Resumed cycle ${cycle.id.slice(0, 8)} at item ${cycle.cursor.holdingIndex + cycle.cursor.discoveryIndex + 1}.`)
  return s
}

// ── Research Update: refresh intelligence, never trade ──────────────────────

export interface ResearchSummary {
  regime: RegimeState
  regimeRefreshed: boolean
  marked: number
  navWritten: boolean
  tradingDate: string
  unpriced: string[]
  stale: string[]
  corporate: CASyncResult | null
  notes: string[]
}

export async function runResearchUpdate(
  supabase: SupabaseClient,
  userId: string,
  labId: string,
  deps: CycleDeps = {},
): Promise<ResearchSummary> {
  const nowFn = deps.now ?? (() => new Date())
  const mark = deps.mark ?? markLab
  const syncCorporate = deps.syncCorporate ?? syncCorporateActions
  const assessRegime = deps.assessRegime ?? getMarketRegime

  const lab = await loadAccount(supabase, userId, labId)
  if (!lab) throw new Error('Lab account not found')
  const k = resolveConstraints(lab.constraints)
  const notes: string[] = []

  // Same deadline discipline as the cycle: nothing upstream may outlive the
  // request that started it.
  const deadline = Date.now() + k.invocation_budget_ms
  const budget = (share: number) => {
    const remaining = Math.max(0, deadline - Date.now())
    return {
      retries: remaining > 40_000 ? 2 : remaining > 20_000 ? 1 : 0,
      timeoutMs: Math.max(8_000, Math.min(60_000, Math.floor(remaining * share))),
      deadline,
      maxUses: k.max_web_searches_per_analysis,
    }
  }
  const markOptions: MarkOptions = {
    ...(deps.markOptions ?? {}),
    fetchOptions: { timeoutMs: 8_000, retries: 1, concurrency: 4, deadline, ...(deps.markOptions?.fetchOptions ?? {}) },
  }

  // Corporate actions first — they change cash and share counts.
  const corporate = await syncCorporate(supabase, userId, lab, { now: nowFn(), research: budget(0.4) })
  notes.push(...corporate.notes)
  if (corporate.failure) notes.push(`Corporate-action sync unavailable (${corporate.failure}).`)
  const reloaded = corporate.dividends || corporate.splits || corporate.bonuses
    ? await loadAccount(supabase, userId, labId)
    : lab
  const account = reloaded ?? lab

  const markResult = await mark(supabase, userId, account, markOptions)
  notes.push(...markResult.notes)

  const stored = await readStoredRegime(supabase, userId, k.regime_ttl_hours, nowFn())
  let regime = stored.state as RegimeState
  let regimeRefreshed = false

  if (!stored.fresh) {
    const { regime: fresh, failure } = await assessRegime(budget(0.6))
    if (fresh) {
      regime = fresh.state
      regimeRefreshed = true
      await supabase.from('inv_market_regime').insert({
        user_id: userId, as_of: fresh.as_of, state: fresh.state, summary: fresh.summary,
        reasons: fresh.reasons, drivers: fresh.drivers, sources: fresh.sources,
      })
    } else if (failure) {
      // Do NOT write a regime we did not actually assess.
      notes.push(`Market regime not refreshed (${failure.kind}) — kept the last stored assessment${stored.as_of ? ` from ${stored.as_of}` : ''}.`)
    }
  } else {
    notes.push(`Market regime is still current (${stored.ageHours}h old) — not re-assessed.`)
  }

  await supabase.from('lab_decisions').insert({
    lab_id: account.id, user_id: userId, ts: nowFn().toISOString(), kind: 'research',
    reason: `Research update: regime ${regime}${regimeRefreshed ? ' (refreshed)' : ' (cached)'}, marked ${markResult.markedPositions.length} holding(s)${markResult.navWritten ? '' : ' — NAV not recorded'}.`,
    market_regime: regime, model_version: account.model_version,
    snapshot: {
      regime, regime_refreshed: regimeRefreshed,
      nav: markResult.nav, benchmarks: markResult.benchmarks,
      trading_date: markResult.tradingDate, nav_written: markResult.navWritten,
      corporate: { dividends: corporate.dividends, splits: corporate.splits, bonuses: corporate.bonuses, flagged: corporate.flagged },
      as_of: nowFn().toISOString(),
    },
  })

  return {
    regime, regimeRefreshed,
    marked: markResult.markedPositions.length,
    navWritten: markResult.navWritten,
    tradingDate: markResult.tradingDate,
    unpriced: markResult.nav.unpriced,
    stale: markResult.nav.stale,
    corporate,
    notes,
  }
}
