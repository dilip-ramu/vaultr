// One-shot analysis orchestration.
//
// The actual work lives in analyzeStages.ts, split into three separately
// persistable stages. This file runs all three inside a single request for the
// interactive Holdings path, where a durable multi-invocation job would be the
// wrong shape for a button press.
//
// It still refuses to start work it cannot finish. If the qualitative stage
// cannot be attempted safely, it returns BUDGET_EXHAUSTED with the fundamentals
// already cached, so pressing Analyse again completes in roughly half the time.
// The Lab does not use this wrapper — it drives the stages itself and persists
// between them (lib/investments/lab/cycle.ts).

import { fetchPrice as fetchPriceLive, type Quote } from './providers/price'
import type { FundamentalsInput, ResearchOptions } from './providers/fundamentals'
import type { ResearchErrorKind } from './claude'
import {
  runFundamentalsStage, runQualitativeStage, runDecisionStage,
  type RecommendationCore, type QualitativeResearch, type StageName,
} from './analyzeStages'
import type { Decision, DecideConfig } from './recommend'
import type { PortfolioSummary } from './portfolio'
import {
  unlimitedBudget, stopwatch, MIN_RESEARCH_CALL_MS,
  type RequestBudget, type Timings,
} from './deadline'
import type { Exchange, RegimeState, ScoreBreakdown, FundamentalsResult } from './types'

export type { RecommendationCore, QualitativeResearch }

/** Why an analysis produced no verdict. NONE of these is a view about the
 *  company — that distinction is the whole point. */
export type AnalyzeFailureKind = ResearchErrorKind | 'BUDGET_EXHAUSTED'

export interface AnalyzeFailure {
  kind: AnalyzeFailureKind
  stage: StageName | 'budget'
  message: string
  retryable: boolean
  /** True when this attempt still banked usable work (fundamentals cached). */
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
  fundamentalsCached: boolean
  /** True when the qualitative half came from storage rather than a fresh call. */
  qualitativeCached: boolean
  /** The qualitative research used, so callers can persist it. */
  qualitative: QualitativeResearch
  searchBudgetUsed: number
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
  config?: Partial<DecideConfig>
  constraintsNote?: string
  research?: ResearchOptions
  loadFundamentals?: (input: FundamentalsInput) => Promise<FundamentalsResult>
  fetchPriceFn?: (symbol: string, exchange: Exchange) => Promise<Quote | null>
  budget?: RequestBudget
  persistsFundamentals?: boolean
  /** Qualitative research already on file — skips stage 2 entirely. */
  qualitative?: QualitativeResearch | null
}

export async function analyzeSymbol(params: AnalyzeParams): Promise<AnalyzeOutcome> {
  const {
    symbol, exchange, companyName, isHolding, portfolio, regimeState,
    config, constraintsNote, research,
  } = params
  const fetchPriceFn = params.fetchPriceFn ?? fetchPriceLive
  const maxUses = research?.maxUses ?? 6
  const budget = params.budget ?? unlimitedBudget()
  const watch = stopwatch()

  const bounded = () => {
    const timeoutMs = Math.max(1_000, budget.callTimeout())
    return {
      ...research,
      maxUses,
      timeoutMs: Math.min(timeoutMs, research?.timeoutMs ?? timeoutMs),
      deadline: Math.min(budget.deadline, research?.deadline ?? budget.deadline),
      retries: Math.min(research?.retries ?? 2, budget.retriesFor(timeoutMs)),
    }
  }

  // ── price + stage 1 ───────────────────────────────────────────────────────
  const [quote, fundResult] = await Promise.all([
    watch.time('price_ms', () => fetchPriceFn(symbol, exchange)),
    watch.time('fundamentals_ms', () => runFundamentalsStage({
      symbol, exchange, companyName, research: bounded(), loadFundamentals: params.loadFundamentals,
    })),
  ])
  const currentPrice = quote?.price ?? null

  if (!fundResult.ok) {
    return { ok: false, failure: { ...fundResult.failure, timings: watch.timings } }
  }
  const fundamentals = fundResult.value
  const fundamentalsCached = fundamentals.cached === true

  // ── stage 2, only if it can actually finish ───────────────────────────────
  let qualitative = params.qualitative ?? null
  const qualitativeCached = qualitative != null

  if (!qualitative) {
    if (!budget.enough(MIN_RESEARCH_CALL_MS)) {
      const saved = params.persistsFundamentals === true && !fundamentalsCached
      return {
        ok: false,
        failure: {
          kind: 'BUDGET_EXHAUSTED', stage: 'qualitative',
          message: saved
            ? `Fundamentals for ${symbol} were researched and cached, but there was not enough time left in this request to complete the qualitative analysis. Running it again will finish the job.`
            : `Not enough time left in this request to research ${symbol} safely.`,
          retryable: true, progressSaved: saved, timings: watch.timings,
        },
      }
    }

    const qualResult = await watch.time('analysis_ms', () => runQualitativeStage({
      symbol, exchange, companyName, currentPrice, regimeState,
      fundamentals, constraintsNote, research: bounded(),
    }))
    if (!qualResult.ok) {
      return {
        ok: false,
        failure: {
          ...qualResult.failure,
          progressSaved: params.persistsFundamentals === true,
          timings: watch.timings,
        },
      }
    }
    qualitative = qualResult.value
  }

  // ── stage 3 — pure, always affordable ─────────────────────────────────────
  const t0 = Date.now()
  const { recommendation, breakdown, decision } = runDecisionStage({
    symbol, exchange, companyName, isHolding, currentPrice, regimeState,
    portfolio, fundamentals, qualitative, config,
  })
  watch.mark('decision_ms', Date.now() - t0)

  return {
    ok: true,
    recommendation, breakdown, fundamentals, decision, currentPrice, regimeState,
    note: fundamentals.notes ?? null,
    fundamentalsCached,
    qualitativeCached,
    qualitative,
    searchBudgetUsed: (fundamentalsCached ? 0 : maxUses) + (qualitativeCached ? 0 : maxUses),
    timings: watch.timings,
  }
}
