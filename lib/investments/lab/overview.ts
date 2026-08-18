// The Lab's read model (Deploy #3). ONE authoritative server-side calculation of
// everything the Lab screens display.
//
// Two rules shape this file:
//
//   1. READS ARE CHEAP. Opening the Lab must never trigger a Claude call or a
//      price fetch — it reads only what a mark or a cycle already persisted.
//      That is why prices come from lab_positions.last_price rather than Yahoo:
//      the dashboard shows the last real observation and says how old it is,
//      instead of quietly costing money every time someone looks at it.
//   2. THE CLIENT DOES NO ACCOUNTING. Every value below is computed here with
//      the same functions the engine uses (computeNav, analyzePortfolio,
//      computeMetrics), so a number on screen can never disagree with a number
//      in the ledger.

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeNav } from './accounting'
import { computeMetrics, type Metrics } from './metrics'
import { resolveConstraints } from './config'
import { hoursSince } from './config'
import type { LabAccount, MarkedPosition, Exchange, LabCycle } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface LabPositionView {
  symbol: string
  exchange: Exchange
  companyName: string | null
  sector: string | null
  marketCapBand: string | null
  quantity: number
  costBasis: number
  avgCost: number | null
  price: number | null
  pricedAt: string | null
  priceAgeHours: number | null
  stale: boolean
  marketValue: number | null
  weightPct: number | null
  unrealizedPnl: number | null
  returnPct: number | null
  openedAt: string | null
}

export interface BenchmarkLine {
  label: string
  start: number | null
  current: number | null
  returnPct: number | null
}

export interface LabStatus {
  labStatus: string
  baselinePinned: boolean
  baselineAsOf: string | null
  holdingsCount: number
  cash: number
  lastMark: {
    as_of: string
    data_quality: string
    stale: string[]
    unpriced: string[]
    session_source: string | null
    marked_at: string | null
    ageHours: number | null
  } | null
  lastCycle: LabCycle | null
  openCycle: LabCycle | null
  lastResearchAt: string | null
  lastCycleAt: string | null
  warnings: string[]
}

export interface LabOverview {
  exists: boolean
  lab: {
    id: string
    name: string
    startingCapital: number
    startDate: string
    modelVersion: string
    status: string
    constraints: ReturnType<typeof resolveConstraints>
  } | null
  totals: {
    startingCapital: number
    portfolioValue: number
    cash: number
    investedValue: number
    costBasis: number
    totalReturn: number
    totalReturnPct: number | null
    realizedPnl: number
    unrealizedPnl: number
    dividends: number
    cashPct: number | null
  }
  positions: LabPositionView[]
  benchmarks: {
    asOf: string | null
    lines: BenchmarkLine[]
    alphaNifty50: number | null
    alphaNifty500: number | null
    sufficient: boolean
    note: string | null
  }
  navHistory: {
    as_of: string
    total_value: number
    nifty50_value: number | null
    nifty500_value: number | null
    data_quality: string
  }[]
  metrics: Metrics | null
  history: {
    observations: number
    chartReady: boolean
    ratiosReady: boolean
    cagrReady: boolean
    note: string
  }
  counts: { decisions: number; trades: number; dividends: number; corporateActions: number }
  status: LabStatus
}

const EMPTY: LabOverview = {
  exists: false, lab: null,
  totals: {
    startingCapital: 1_000_000, portfolioValue: 0, cash: 0, investedValue: 0, costBasis: 0,
    totalReturn: 0, totalReturnPct: null, realizedPnl: 0, unrealizedPnl: 0, dividends: 0, cashPct: null,
  },
  positions: [],
  benchmarks: { asOf: null, lines: [], alphaNifty50: null, alphaNifty500: null, sufficient: false, note: null },
  navHistory: [],
  metrics: null,
  history: { observations: 0, chartReady: false, ratiosReady: false, cagrReady: false, note: 'The Lab has not been created yet.' },
  counts: { decisions: 0, trades: 0, dividends: 0, corporateActions: 0 },
  status: {
    labStatus: 'none', baselinePinned: false, baselineAsOf: null, holdingsCount: 0, cash: 0,
    lastMark: null, lastCycle: null, openCycle: null, lastResearchAt: null, lastCycleAt: null, warnings: [],
  },
}

export async function getLabOverview(
  supabase: SupabaseClient, userId: string, now: Date = new Date(),
): Promise<LabOverview> {
  const { data: labRow } = await supabase.from('lab_accounts').select('*')
    .eq('user_id', userId).in('status', ['active', 'pending_baseline', 'paused'])
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!labRow) return EMPTY

  const lab = labRow as LabAccount
  const k = resolveConstraints(lab.constraints)

  const [
    { data: positionRows }, { data: navRows }, { data: benchRows },
    { data: tradeRows }, { data: divRows }, { data: caRows },
    { data: cycleRows }, { data: decisionCountRows }, { data: researchRows },
  ] = await Promise.all([
    supabase.from('lab_positions').select('*').eq('lab_id', lab.id).eq('user_id', userId).order('opened_at', { ascending: true }),
    supabase.from('lab_nav_history').select('*').eq('lab_id', lab.id).order('as_of', { ascending: true }),
    supabase.from('lab_benchmarks').select('*').eq('lab_id', lab.id).order('as_of', { ascending: true }),
    supabase.from('lab_trades').select('realized_pnl, gross_amount, ts').eq('lab_id', lab.id),
    supabase.from('lab_dividends').select('net_dividend').eq('lab_id', lab.id),
    supabase.from('lab_corporate_actions').select('id').eq('lab_id', lab.id),
    supabase.from('lab_cycles').select('*').eq('lab_id', lab.id).order('started_at', { ascending: false }).limit(5),
    supabase.from('lab_decisions').select('id').eq('lab_id', lab.id),
    supabase.from('lab_decisions').select('ts').eq('lab_id', lab.id).eq('kind', 'research').order('ts', { ascending: false }).limit(1),
  ])

  const positions = (positionRows ?? []) as any[]
  const staleAfter = k.price_staleness_hours

  // Value positions from the LAST PERSISTED MARK — no network here.
  const marked: MarkedPosition[] = positions.map(p => {
    const price = p.last_price != null ? Number(p.last_price) : null
    const age = hoursSince(p.last_price_at, now)
    return {
      symbol: p.symbol,
      exchange: (p.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange,
      company_name: p.company_name,
      quantity: Number(p.quantity),
      cost_basis: Number(p.cost_basis),
      sector: p.sector,
      market_cap_band: p.market_cap_band,
      last_price: price, last_price_at: p.last_price_at, last_price_source: p.last_price_source,
      opened_at: p.opened_at,
      price,
      price_source: price == null ? 'none' : 'live',
      priced_at: p.last_price_at,
      stale: price != null && age != null && age > staleAfter,
    }
  })

  const nav = computeNav(Number(lab.cash), marked)
  const realizedPnl = round2((tradeRows ?? []).reduce((t: number, r: any) => t + Number(r.realized_pnl || 0), 0))
  const dividends = round2((divRows ?? []).reduce((t: number, r: any) => t + Number(r.net_dividend || 0), 0))
  const tradedValue = (tradeRows ?? []).reduce((t: number, r: any) => t + Number(r.gross_amount || 0), 0)

  const positionViews: LabPositionView[] = marked.map(p => {
    const marketValue = p.price != null ? round2(p.price * p.quantity) : null
    const age = hoursSince(p.priced_at, now)
    return {
      symbol: p.symbol, exchange: p.exchange, companyName: p.company_name ?? null,
      sector: p.sector ?? null, marketCapBand: p.market_cap_band ?? null,
      quantity: p.quantity, costBasis: round2(p.cost_basis),
      avgCost: p.quantity > 0 ? round2(p.cost_basis / p.quantity) : null,
      price: p.price, pricedAt: p.priced_at ?? null, priceAgeHours: age, stale: Boolean(p.stale),
      marketValue,
      weightPct: marketValue != null && nav.totalValue > 0 ? round2((marketValue / nav.totalValue) * 100) : null,
      unrealizedPnl: marketValue != null ? round2(marketValue - p.cost_basis) : null,
      returnPct: marketValue != null && p.cost_basis > 0 ? round2(((marketValue - p.cost_basis) / p.cost_basis) * 100) : null,
      openedAt: p.opened_at ?? null,
    }
  })

  const totalReturn = round2(nav.totalValue - Number(lab.starting_capital))
  const totals = {
    startingCapital: Number(lab.starting_capital),
    portfolioValue: nav.totalValue,
    cash: nav.cash,
    investedValue: nav.positionsValue,
    costBasis: nav.invested,
    totalReturn,
    totalReturnPct: lab.starting_capital > 0 ? round2((totalReturn / Number(lab.starting_capital)) * 100) : null,
    realizedPnl,
    unrealizedPnl: nav.unrealizedPnl,
    dividends,
    cashPct: nav.totalValue > 0 ? round2((nav.cash / nav.totalValue) * 100) : null,
  }

  // ── Benchmarks, from the PINNED baseline only ─────────────────────────────
  const benches = (benchRows ?? []) as any[]
  const latestBench = benches.length ? benches[benches.length - 1] : null
  const base = lab.benchmark_start ?? null
  const pct = (start: number | null, current: number | null) =>
    start != null && current != null && start > 0 ? round2(((current - start) / start) * 100) : null

  const labReturnPct = totals.totalReturnPct
  const n50Current = latestBench?.nifty50_value != null ? Number(latestBench.nifty50_value) : null
  const n500Current = latestBench?.nifty500_value != null ? Number(latestBench.nifty500_value) : null
  const benchLines: BenchmarkLine[] = [
    { label: 'Inex Lab', start: totals.startingCapital, current: totals.portfolioValue, returnPct: labReturnPct },
    { label: 'Nifty 50', start: base ? totals.startingCapital : null, current: n50Current, returnPct: pct(totals.startingCapital, n50Current) },
    { label: 'Nifty 500', start: base ? totals.startingCapital : null, current: n500Current, returnPct: pct(totals.startingCapital, n500Current) },
  ]
  const benchSufficient = Boolean(base) && benches.length >= 1 && (n50Current != null || n500Current != null)

  // ── NAV history joined to benchmark marks (no invented points) ────────────
  const benchByDate = new Map(benches.map(b => [b.as_of, b]))
  const navHistory = ((navRows ?? []) as any[]).map(r => {
    const b = benchByDate.get(r.as_of)
    return {
      as_of: r.as_of,
      total_value: Number(r.total_value),
      nifty50_value: b?.nifty50_value != null ? Number(b.nifty50_value) : null,
      nifty500_value: b?.nifty500_value != null ? Number(b.nifty500_value) : null,
      data_quality: r.data_quality ?? 'fresh',
    }
  })

  const closedTrades = (tradeRows ?? [])
    .filter((r: any) => r.realized_pnl != null)
    .map((r: any) => ({ realized_pnl: Number(r.realized_pnl) }))

  const metrics = navHistory.length
    ? computeMetrics({
        navHistory: navHistory.map(n => ({ as_of: n.as_of, total_value: n.total_value, data_quality: n.data_quality })),
        benchmarks: navHistory.map(n => ({ as_of: n.as_of, nifty50_value: n.nifty50_value, nifty500_value: n.nifty500_value })),
        closedTrades,
        startingCapital: totals.startingCapital,
        latestCash: totals.cash,
        dividendsCum: dividends,
        tradedValue,
      })
    : null

  const observations = navHistory.length
  const history = {
    observations,
    chartReady: observations >= 2,
    ratiosReady: Boolean(metrics?.ratiosSufficient),
    cagrReady: metrics?.cagrPct != null,
    note: observations === 0
      ? 'No market marks recorded yet. Run a Research Update to take the first one.'
      : observations < 2
        ? 'Only one market mark so far — a performance line needs at least two trading sessions.'
        : !metrics?.ratiosSufficient
          ? `${observations} trading ${observations === 1 ? 'session' : 'sessions'} recorded. Risk ratios need about 20 before they mean anything.`
          : `${observations} trading sessions recorded.`,
  }

  // ── Status + honest warnings ──────────────────────────────────────────────
  const cycles = (cycleRows ?? []) as LabCycle[]
  const openCycle = cycles.find(c => c.status === 'started' || c.status === 'in_progress') ?? null
  const lastCycle = cycles[0] ?? null
  const lastNav = navRows?.length ? (navRows as any[])[navRows.length - 1] : null

  const warnings: string[] = []
  if (lab.status === 'pending_baseline' || !base) {
    warnings.push('No benchmark baseline is pinned, so performance cannot be measured against the index yet.')
  }
  if (lastNav?.data_quality === 'stale') {
    warnings.push(`The last market mark used carried-forward prices for ${(lastNav.stale ?? []).join(', ') || 'one or more positions'}.`)
  }
  const staleNames = positionViews.filter(p => p.stale).map(p => p.symbol)
  if (staleNames.length) warnings.push(`Price older than ${staleAfter}h: ${staleNames.join(', ')}.`)
  const neverPriced = positionViews.filter(p => p.price == null).map(p => p.symbol)
  if (neverPriced.length) warnings.push(`Never priced, so excluded from portfolio value: ${neverPriced.join(', ')}.`)
  if (openCycle) warnings.push('A cycle is part-way through. The next run resumes it rather than starting again.')

  const status: LabStatus = {
    labStatus: lab.status,
    baselinePinned: Boolean(base),
    baselineAsOf: base?.as_of ?? null,
    holdingsCount: positionViews.filter(p => p.quantity > 0).length,
    cash: totals.cash,
    lastMark: lastNav ? {
      as_of: lastNav.as_of,
      data_quality: lastNav.data_quality ?? 'fresh',
      stale: lastNav.stale ?? [],
      unpriced: lastNav.unpriced ?? [],
      session_source: lastNav.session_source ?? null,
      marked_at: lastNav.marked_at ?? null,
      ageHours: hoursSince(lastNav.marked_at, now),
    } : null,
    lastCycle,
    openCycle,
    lastResearchAt: (researchRows as any[])?.[0]?.ts ?? null,
    lastCycleAt: lastCycle?.started_at ?? null,
    warnings,
  }

  return {
    exists: true,
    lab: {
      id: lab.id, name: lab.name, startingCapital: Number(lab.starting_capital),
      startDate: lab.start_date, modelVersion: lab.model_version, status: lab.status, constraints: k,
    },
    totals, positions: positionViews,
    benchmarks: {
      asOf: latestBench?.as_of ?? null,
      lines: benchLines,
      alphaNifty50: metrics?.alphaNifty50Pct ?? null,
      alphaNifty500: metrics?.alphaNifty500Pct ?? null,
      sufficient: benchSufficient,
      note: benchSufficient ? null : 'Benchmark comparison needs a pinned baseline and at least one recorded market mark.',
    },
    navHistory, metrics, history,
    counts: {
      decisions: (decisionCountRows ?? []).length,
      trades: (tradeRows ?? []).length,
      dividends: (divRows ?? []).length,
      corporateActions: (caRows ?? []).length,
    },
    status,
  }
}
