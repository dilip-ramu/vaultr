// The analysis, broken into stages that can each be persisted (Deploy #5).
//
// WHY THIS FILE EXISTS
//
// Analysing one security is three pieces of work with very different costs:
//
//   1. FUNDAMENTALS — a web-search research call. Expensive. Cacheable, because
//      company financials move on results, not on the hour.
//   2. QUALITATIVE  — a second web-search call that reasons about the business
//      AGAINST those verified numbers. Expensive. Also worth persisting.
//   3. DECISION     — scoring and the portfolio-aware call. Pure arithmetic,
//      milliseconds, no network.
//
// Previously all three had to complete inside one request. When ~8 seconds of
// budget remained after the fundamentals call, the qualitative call was started
// anyway, died at 8000ms, and a successful piece of research was thrown away.
//
// Splitting them means each stage is attempted only when there is time to finish
// it, and a stage that succeeds is banked. The cost of running out of time drops
// from "lose everything" to "continue next invocation".
//
// The two research calls remain SEQUENTIAL and that is deliberate: the
// qualitative prompt embeds the verified fundamentals so the model judges the
// business against real numbers. Parallelising would change what the analysis
// is, to save time we recover a better way — by persisting stage 1.

import { getFundamentals, type FundamentalsInput, type ResearchOptions } from './providers/fundamentals'
import { researchJson, isTransport, type ResearchErrorKind } from './claude'
import { scoreSecurity } from './scoring'
import { decide, type Decision, type DecideConfig } from './recommend'
import type { PortfolioSummary } from './portfolio'
import type {
  Exchange, RegimeState, Source, RecAction, ScoreBreakdown, FundamentalsResult,
} from './types'

// ── Shared shapes ───────────────────────────────────────────────────────────

export type StageName = 'fundamentals' | 'qualitative' | 'decision' | 'complete'

export type StageFailureKind = ResearchErrorKind | 'BUDGET_EXHAUSTED'

export interface StageFailure {
  kind: StageFailureKind
  stage: StageName
  message: string
  retryable: boolean
  /** True when this attempt still banked usable work. */
  progressSaved: boolean
}

export type StageResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: StageFailure }

/** The qualitative half, in the shape it is persisted and re-read in. */
export interface QualitativeResearch {
  qualitative?: {
    business_quality?: number; management?: number; industry?: number
    moat?: number; macro_sensitivity?: number; geopolitical_risk?: number
  }
  fair_value_low?: number | null
  fair_value_high?: number | null
  entry_low?: number | null
  entry_high?: number | null
  horizon?: string | null
  bull_case?: string | null
  base_case?: string | null
  bear_case?: string | null
  catalysts?: string[]
  risks?: string[]
  invalidation?: string[]
  why_now?: string | null
  thesis_invalidated?: boolean
  /** Everything the model actually cited. */
  sources: Source[]
  /** When this research was performed (ISO). */
  researched_at: string
  /** The market regime at the time — context the score was formed in. */
  regime?: string | null
}

export const ANALYSIS_SYSTEM = `You are a disciplined, sceptical equity analyst for Indian listed companies.
Present BOTH bull and bear cases. Avoid FOMO, hype, and price-chasing. Never claim a stock "will" go up — speak in risk/reward and probabilities. Distinguish price decline from business deterioration, and company quality from valuation. State uncertainty explicitly. Base everything on evidence and cite sources. Score qualitative factors 0-100 conservatively; if you cannot judge one, omit it.`

const num = (x: unknown): number | null => (x == null || !Number.isFinite(Number(x)) ? null : Number(x))
const arr = (x: unknown): string[] => Array.isArray(x) ? x.filter(v => typeof v === 'string') : []

// ── Stage 1: fundamentals ───────────────────────────────────────────────────

export interface FundamentalsStageParams {
  symbol: string
  exchange: Exchange
  companyName?: string | null
  research?: ResearchOptions
  /** Injected so the Lab can use the cache and tests can use neither. */
  loadFundamentals?: (input: FundamentalsInput) => Promise<FundamentalsResult>
}

export async function runFundamentalsStage(
  p: FundamentalsStageParams,
): Promise<StageResult<FundamentalsResult>> {
  const load = p.loadFundamentals ?? getFundamentals
  const fundamentals = await load({
    symbol: p.symbol, exchange: p.exchange, companyName: p.companyName, research: p.research,
  })

  // A transport failure is not evidence about the company.
  if (fundamentals.failure && isTransport(fundamentals.failure.kind)) {
    return {
      ok: false,
      failure: {
        kind: fundamentals.failure.kind, stage: 'fundamentals',
        message: fundamentals.failure.message,
        retryable: fundamentals.failure.retryable, progressSaved: false,
      },
    }
  }
  return { ok: true, value: fundamentals }
}

// ── Stage 2: qualitative ────────────────────────────────────────────────────

export interface QualitativeStageParams {
  symbol: string
  exchange: Exchange
  companyName?: string | null
  currentPrice: number | null
  regimeState: RegimeState
  fundamentals: FundamentalsResult
  constraintsNote?: string
  research?: ResearchOptions
  now?: () => Date
}

export function buildQualitativePrompt(p: QualitativeStageParams): string {
  const factSummary = JSON.stringify({
    fundamentals: p.fundamentals.fundamentals,
    valuation: p.fundamentals.valuation,
    data_confidence: p.fundamentals.data_confidence,
    sector: p.fundamentals.sector,
  })
  return `Analyse ${p.companyName ? p.companyName + ' ' : ''}${p.symbol} (${p.exchange}) for a long-term investor.
Current price: ${p.currentPrice != null ? '₹' + p.currentPrice : 'unknown'}. Market regime: ${p.regimeState}.
${p.constraintsNote ? p.constraintsNote + '\n' : ''}Verified fundamentals gathered so far (INR crore for absolutes; null = unknown, do NOT invent): ${factSummary}

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
}

export async function runQualitativeStage(
  p: QualitativeStageParams,
): Promise<StageResult<QualitativeResearch>> {
  const nowFn = p.now ?? (() => new Date())
  const res = await researchJson<Omit<QualitativeResearch, 'sources' | 'researched_at'>>({
    system: ANALYSIS_SYSTEM,
    prompt: buildQualitativePrompt(p),
    webSearch: true,
    maxTokens: 4096,
    ...p.research,
  })

  if (res.failure) {
    return {
      ok: false,
      failure: {
        kind: res.failure.kind, stage: 'qualitative',
        message: res.failure.message, retryable: res.failure.retryable,
        // The fundamentals half is already banked by the caller.
        progressSaved: true,
      },
    }
  }

  const a = res.data ?? {}
  return {
    ok: true,
    value: {
      qualitative: a.qualitative,
      fair_value_low: num(a.fair_value_low), fair_value_high: num(a.fair_value_high),
      entry_low: num(a.entry_low), entry_high: num(a.entry_high),
      horizon: a.horizon ?? null,
      bull_case: a.bull_case ?? null, base_case: a.base_case ?? null, bear_case: a.bear_case ?? null,
      catalysts: arr(a.catalysts), risks: arr(a.risks), invalidation: arr(a.invalidation),
      why_now: a.why_now ?? null,
      thesis_invalidated: Boolean(a.thesis_invalidated),
      sources: res.sources,
      researched_at: nowFn().toISOString(),
      regime: p.regimeState,
    },
  }
}

// ── Stage 3: decision (PURE — no network, milliseconds) ─────────────────────

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

export interface DecisionStageParams {
  symbol: string
  exchange: Exchange
  companyName?: string | null
  isHolding: boolean
  currentPrice: number | null
  regimeState: RegimeState
  portfolio: PortfolioSummary
  fundamentals: FundamentalsResult
  qualitative: QualitativeResearch
  config?: Partial<DecideConfig>
}

export interface DecisionStageResult {
  recommendation: RecommendationCore
  breakdown: ScoreBreakdown
  decision: Decision
}

/**
 * Scoring and the portfolio-aware call. Deterministic and cheap, so it can
 * always run — there is never a reason to defer this stage for time.
 */
export function runDecisionStage(p: DecisionStageParams): DecisionStageResult {
  const q = p.qualitative

  const breakdown = scoreSecurity({
    fundamentals: p.fundamentals.fundamentals,
    valuation: p.fundamentals.valuation,
    dataConfidence: p.fundamentals.data_confidence,
    qualitative: q.qualitative,
  })

  const decision = decide({
    symbol: p.symbol,
    isHolding: p.isHolding,
    score: breakdown.total,
    dataConfidence: p.fundamentals.data_confidence,
    valuationScore: breakdown.factors.valuation?.score ?? null,
    currentPrice: p.currentPrice,
    fairValueHigh: q.fair_value_high ?? null,
    sector: p.fundamentals.sector,
    regimeState: p.regimeState,
    portfolio: p.portfolio,
    thesisInvalidated: Boolean(q.thesis_invalidated),
    config: p.config,
  })

  const sources: Source[] = [...p.fundamentals.sources, ...q.sources]
    .filter((s, i, all) => s.url && all.findIndex(x => x.url === s.url) === i)

  const recommendation: RecommendationCore = {
    symbol: p.symbol, exchange: p.exchange,
    company_name: p.companyName ?? p.fundamentals.company_name ?? null,
    action: decision.action,
    current_price: p.currentPrice,
    entry_low: q.entry_low ?? null, entry_high: q.entry_high ?? null,
    fair_value_low: q.fair_value_low ?? null, fair_value_high: q.fair_value_high ?? null,
    bull_case: q.bull_case ?? null, base_case: q.base_case ?? null, bear_case: q.bear_case ?? null,
    horizon: q.horizon ?? null,
    why_now: decision.why_now ?? (q.why_now ?? null),
    catalysts: q.catalysts ?? [], risks: q.risks ?? [], invalidation: q.invalidation ?? [],
    data_confidence: p.fundamentals.data_confidence,
    ai_confidence: decision.ai_confidence,
    max_alloc_pct: decision.max_alloc_pct,
    market_regime: p.regimeState,
    total_score: breakdown.total,
    score_breakdown: breakdown,
    portfolio_context: decision.portfolio_context,
    sources,
    is_holding: p.isHolding,
  }

  return { recommendation, breakdown, decision }
}
