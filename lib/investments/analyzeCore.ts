// Shared analysis orchestration (extracted from the Phase-1 analyze route so the
// route AND the Lab cycle run IDENTICAL logic — same research, same score, same
// portfolio-aware decision). This function does NOT touch the database and does
// NOT persist: it takes the portfolio + regime as inputs and returns the full
// recommendation for the caller to store wherever it belongs (inv_* or lab_*).
//
// Correctness pass:
//   • item 6 — the caller may pass the Lab's REAL constraints, so the decision
//     bands and the concentration ceilings match what the engine will enforce,
//     and the model is told the rules it is sizing inside.
//   • item 9 — a research TRANSPORT failure now aborts with a classified
//     failure instead of flowing through as data_confidence 0. Without this an
//     HTTP 429 becomes "evidence is too thin to justify a call", which is an
//     investment conclusion the system never actually reached.
//   • item 10 — fundamentals may be supplied by a cache (loadFundamentals),
//     so a cycle does not re-research the same company on every invocation.

import { fetchPrice as fetchPriceLive } from './providers/price'
import { getFundamentals, type FundamentalsInput, type ResearchOptions } from './providers/fundamentals'
import { researchJson, isTransport, type ResearchErrorKind } from './claude'
import {
  unlimitedBudget, stopwatch, MIN_RESEARCH_CALL_MS,
  type RequestBudget, type Timings,
} from './deadline'
import { scoreSecurity } from './scoring'
import { decide, type Decision, type DecideConfig } from './recommend'
import type { PortfolioSummary } from './portfolio'
import type { Quote } from './providers/price'
import type { Exchange, RegimeState, Source, RecAction, ScoreBreakdown, FundamentalsResult } from './types'

interface Analysis {
  qualitative?: { business_quality?: number; management?: number; industry?: number; moat?: number; macro_sensitivity?: number; geopolitical_risk?: number }
  fair_value_low?: number | null; fair_value_high?: number | null
  entry_low?: number | null; entry_high?: number | null
  horizon?: string | null
  bull_case?: string | null; base_case?: string | null; bear_case?: string | null
  catalysts?: string[]; risks?: string[]; invalidation?: string[]
  why_now?: string | null; thesis_invalidated?: boolean
}

const ANALYSIS_SYSTEM = `You are a disciplined, sceptical equity analyst for Indian listed companies.
Present BOTH bull and bear cases. Avoid FOMO, hype, and price-chasing. Never claim a stock "will" go up — speak in risk/reward and probabilities. Distinguish price decline from business deterioration, and company quality from valuation. State uncertainty explicitly. Base everything on evidence and cite sources. Score qualitative factors 0-100 conservatively; if you cannot judge one, omit it.`

const num = (x: unknown): number | null => (x == null || !Number.isFinite(Number(x)) ? null : Number(x))
const arr = (x: unknown): string[] => Array.isArray(x) ? x.filter(v => typeof v === 'string') : []

export interface RecommendationCore {
  symbol: string; exchange: Exchange; company_name: string | null
  action: RecAction; current_price: number | null
  entry_low: number | null; entry_high: number | null
  fair_value_low: number | null; fair_value_high: number | null
  bull_case: string | null; base_case: string | null; bear_case: string | null
  horizon: string | null; why_now: string | null
  catalysts: string[]; risks: string[]; invalidation: string[]
  data_confidence: number; ai_confidence: number; max_alloc_pct: number | null
  market_regime: string; total_score: number; score_breakdown: ScoreBreakdown
  portfolio_context: string | null; sources: Source[]; is_holding: boolean
}

/** Why an analysis produced no verdict. NONE of these is a view about the
 *  company — that distinction is the whole point (item 4). */
export type AnalyzeFailureKind = ResearchErrorKind | 'BUDGET_EXHAUSTED'

export interface AnalyzeFailure {
  kind: AnalyzeFailureKind
  stage: 'fundamentals' | 'analysis' | 'budget'
  message: string
  retryable: boolean
  /**
   * True when this attempt still moved things forward — fundamentals were
   * researched and cached, so running again is roughly half the work and is
   * much more likely to finish. Lets the caller say "run it again" honestly.
   */
  progressSaved: boolean
  timings: Timings
}

export interface AnalyzeResult {
  recommendation: RecommendationCore
  breakdown: ScoreBreakdown
  fundamentals: FundamentalsResult
  decision: Decision
  currentPrice: number | null
  regimeState: RegimeState
  note: string | null
  /** True when the fundamentals came from cache rather than a fresh call. */
  fundamentalsCached: boolean
  /** Upper bound on web searches this analysis could have consumed. */
  searchBudgetUsed: number
  /** Per-stage milliseconds. Names only — no prompts, no keys. */
  timings: Timings
}

export type AnalyzeOutcome =
  | ({ ok: true } & AnalyzeResult)
  | { ok: false; failure: AnalyzeFailure }

export interface AnalyzeParams {
  symbol: string
  exchange: Exchange
  companyName?: string | null
  isHolding: boolean
  portfolio: PortfolioSummary
  regimeState: RegimeState
  /** The caller's real allocation rules. Omit for Phase-1 defaults. */
  config?: Partial<DecideConfig>
  /** One line describing those rules, injected into the prompt. */
  constraintsNote?: string
  /** Retry/timeout budget for the underlying research calls. */
  research?: ResearchOptions
  /** Injection points — used by the Lab's cache and by tests. */
  loadFundamentals?: (input: FundamentalsInput) => Promise<FundamentalsResult>
  fetchPriceFn?: (symbol: string, exchange: Exchange) => Promise<Quote | null>
  /** The request wall. Without one, calls run unbounded and the platform kills
   *  the request — which is exactly the 504 this parameter exists to prevent. */
  budget?: RequestBudget
  /** True when `loadFundamentals` writes through to the research cache, so a
   *  half-finished analysis leaves reusable work behind. */
  persistsFundamentals?: boolean
}

/**
 * WHY THE TWO RESEARCH CALLS STAY SEQUENTIAL (item 5)
 *
 * They are not independent. The qualitative prompt embeds `factSummary` — the
 * verified fundamentals — so the model judges business quality, moat and
 * management against real numbers instead of its own recollection. Running them
 * in parallel would hand the second call an empty fact base and quietly change
 * what the analysis is, to save time we can recover a better way: the
 * fundamentals half is CACHED, so a re-run costs one call instead of two.
 *
 * So: sequential, each strictly deadline-aware, with the first half persisted.
 */
export async function analyzeSymbol(params: AnalyzeParams): Promise<AnalyzeOutcome> {
  const {
    symbol, exchange, companyName, isHolding, portfolio, regimeState,
    config, constraintsNote, research,
  } = params
  const loadFundamentals = params.loadFundamentals ?? getFundamentals
  const fetchPriceFn = params.fetchPriceFn ?? fetchPriceLive
  const maxUses = research?.maxUses ?? 6
  const budget = params.budget ?? unlimitedBudget()
  const watch = stopwatch()

  // Every upstream call inherits the wall, whatever the caller passed.
  const bounded = (share = 1) => {
    const timeoutMs = Math.max(1_000, Math.floor(budget.callTimeout() * share))
    return {
      ...research,
      maxUses,
      timeoutMs: Math.min(timeoutMs, research?.timeoutMs ?? timeoutMs),
      deadline: Math.min(budget.deadline, research?.deadline ?? budget.deadline),
      retries: Math.min(research?.retries ?? 2, budget.retriesFor(timeoutMs)),
    }
  }

  const [quote, fundamentals] = await Promise.all([
    watch.time('price_ms', () => fetchPriceFn(symbol, exchange)),
    watch.time('fundamentals_ms', () => loadFundamentals({ symbol, exchange, companyName, research: bounded(1) })),
  ])
  const currentPrice = quote?.price ?? null
  const fundamentalsCached = fundamentals.cached === true

  // A transport failure is not evidence. Stop here and let the caller retry.
  if (fundamentals.failure && isTransport(fundamentals.failure.kind)) {
    return {
      ok: false,
      failure: {
        kind: fundamentals.failure.kind, stage: 'fundamentals',
        message: fundamentals.failure.message, retryable: fundamentals.failure.retryable,
        progressSaved: false, timings: watch.timings,
      },
    }
  }

  // Not enough wall left for a web-search call. Stop cleanly rather than start
  // something the platform will kill. The fundamentals just gathered are cached,
  // so running again completes in roughly half the time.
  if (!budget.enough(MIN_RESEARCH_CALL_MS)) {
    const saved = params.persistsFundamentals === true && !fundamentalsCached
    return {
      ok: false,
      failure: {
        kind: 'BUDGET_EXHAUSTED', stage: 'analysis',
        message: saved
          ? `Fundamentals for ${symbol} were researched and cached, but there was not enough time left in this request to complete the qualitative analysis. Running it again will finish the job.`
          : `Not enough time left in this request to research ${symbol} safely.`,
        retryable: true, progressSaved: saved, timings: watch.timings,
      },
    }
  }

  const factSummary = JSON.stringify({ fundamentals: fundamentals.fundamentals, valuation: fundamentals.valuation, data_confidence: fundamentals.data_confidence, sector: fundamentals.sector })
  const prompt = `Analyse ${companyName ? companyName + ' ' : ''}${symbol} (${exchange}) for a long-term investor.
Current price: ${currentPrice != null ? '₹' + currentPrice : 'unknown'}. Market regime: ${regimeState}.
${constraintsNote ? constraintsNote + '\n' : ''}Verified fundamentals gathered so far (INR crore for absolutes; null = unknown, do NOT invent): ${factSummary}

Use web search for anything material and recent (order book, promoter actions, capacity, regulation, results). Return ONLY JSON:
{
  "qualitative": { "business_quality": 0-100, "management": 0-100, "industry": 0-100, "moat": 0-100, "macro_sensitivity": 0-100, "geopolitical_risk": 0-100 },
  "fair_value_low": number|null, "fair_value_high": number|null,
  "entry_low": number|null, "entry_high": number|null,
  "horizon": string,
  "bull_case": string, "base_case": string, "bear_case": string,
  "catalysts": string[], "risks": string[], "invalidation": string[],
  "why_now": string, "thesis_invalidated": boolean
}
Notes: macro_sensitivity/geopolitical_risk are scored so that HIGHER = more resilient (less vulnerable). "invalidation" = specific, monitorable conditions that would break the thesis. "why_now" = the concrete reason to act now, or state that there is none and to wait.`

  const analysis = await watch.time('analysis_ms', () => researchJson<Analysis>({
    system: ANALYSIS_SYSTEM, prompt, webSearch: true, maxTokens: 4096, ...bounded(1),
  }))
  if (analysis.failure) {
    return {
      ok: false,
      failure: {
        kind: analysis.failure.kind, stage: 'analysis',
        message: analysis.failure.message, retryable: analysis.failure.retryable,
        // The fundamentals half is banked either way.
        progressSaved: params.persistsFundamentals === true,
        timings: watch.timings,
      },
    }
  }
  const a = analysis.data ?? {}

  const t0 = Date.now()
  const breakdown = scoreSecurity({
    fundamentals: fundamentals.fundamentals,
    valuation: fundamentals.valuation,
    dataConfidence: fundamentals.data_confidence,
    qualitative: a.qualitative,
  })

  watch.mark('scoring_ms', Date.now() - t0)
  const t1 = Date.now()
  const decision = decide({
    symbol, isHolding,
    score: breakdown.total,
    dataConfidence: fundamentals.data_confidence,
    valuationScore: breakdown.factors.valuation?.score ?? null,
    currentPrice,
    fairValueHigh: num(a.fair_value_high),
    sector: fundamentals.sector,
    regimeState,
    portfolio,
    thesisInvalidated: Boolean(a.thesis_invalidated),
    config,
  })

  watch.mark('decision_ms', Date.now() - t1)

  const why_now = decision.why_now ?? (a.why_now ?? null)
  const sources: Source[] = [...fundamentals.sources, ...analysis.sources]
    .filter((s, i, all) => s.url && all.findIndex(x => x.url === s.url) === i)

  const recommendation: RecommendationCore = {
    symbol, exchange,
    company_name: companyName ?? fundamentals.company_name ?? null,
    action: decision.action,
    current_price: currentPrice,
    entry_low: num(a.entry_low), entry_high: num(a.entry_high),
    fair_value_low: num(a.fair_value_low), fair_value_high: num(a.fair_value_high),
    bull_case: a.bull_case ?? null, base_case: a.base_case ?? null, bear_case: a.bear_case ?? null,
    horizon: a.horizon ?? null, why_now,
    catalysts: arr(a.catalysts), risks: arr(a.risks), invalidation: arr(a.invalidation),
    data_confidence: fundamentals.data_confidence, ai_confidence: decision.ai_confidence,
    max_alloc_pct: decision.max_alloc_pct, market_regime: regimeState,
    total_score: breakdown.total, score_breakdown: breakdown,
    portfolio_context: decision.portfolio_context, sources, is_holding: isHolding,
  }

  return {
    ok: true,
    recommendation, breakdown, fundamentals, decision, currentPrice, regimeState,
    note: fundamentals.notes ?? null,
    fundamentalsCached,
    searchBudgetUsed: fundamentalsCached ? maxUses : maxUses * 2,
    timings: watch.timings,
  }
}
