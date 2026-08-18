// WHICH MODEL DOES WHAT, AND WHAT IT COSTS (efficiency pass).
//
// WHY THIS FILE EXISTS
//
// Every research call in the Investments module went to claude-sonnet-4-5 with
// six web searches, because `claude.ts` defaulted the model and NO caller ever
// passed one. `FAST_MODEL` was exported and never used. That made a $5 credit
// buy roughly one cycle.
//
// The fix is not "use a cheaper model". It is to separate two genuinely
// different jobs:
//
//   EXTRACTION — "what is this company's ROCE, and where does that number come
//     from?" There is a right answer on a filing. The work is finding it and
//     copying it faithfully, and refusing to invent it when it is not there.
//     A small model does this as well as a large one, at a third of the price.
//
//   JUDGEMENT — "is this a good business at this price, and what would prove me
//     wrong?" There is no right answer to look up. This is the actual
//     investment reasoning the Lab exists to test, and it stays on the strong
//     model. Nothing in this milestone makes it cheaper by making it dumber.
//
// The other lever is search count, and it matters more than the model does.
// Anthropic bills server-side web search results AS INPUT TOKENS, and the
// accumulated results are re-sent on every internal search iteration inside one
// turn. So the input cost grows with the SQUARE of max_uses, not linearly:
// dropping a call from 6 searches to 4 removes roughly half its input tokens.
// Searches are therefore budgeted per task, by how much breadth that task
// genuinely needs, rather than one number applied to everything.
//
// PURE MODULE. No network, no environment mutation, no side effects.

export type ResearchTask =
  | 'fundamentals'    // extract verifiable figures            → small model
  | 'qualitative'     // the investment judgement              → strong model
  | 'discovery'       // generate candidate ideas              → strong model
  | 'regime'          // macro read, cached for 24h            → strong model
  | 'corporate'       // list dividends/splits with dates      → small model
  | 'connectivity'    // preflight ping                        → small model

export interface TaskRoute {
  /** Anthropic model id. */
  model: string
  /** Web searches this task may perform. The dominant cost driver. */
  maxUses: number
  /**
   * Output ceiling. Deliberately GENEROUS: unused output tokens are free, but a
   * truncated JSON reply costs the whole call and returns nothing. This is a
   * truncation guard, never a savings lever.
   */
  maxTokens: number
  /** Why this task is routed where it is — surfaced in the cost report. */
  rationale: string
}

const ANALYSIS_MODEL = process.env.INVEST_ANALYSIS_MODEL || 'claude-sonnet-4-5'
const FAST_MODEL = process.env.INVEST_FAST_MODEL || 'claude-haiku-4-5-20251001'

export const MODELS = { analysis: ANALYSIS_MODEL, fast: FAST_MODEL }

const num = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * The routing table. Every entry is overridable by environment variable so a
 * model can be changed without a deploy, but the DEFAULTS are the policy.
 */
export function routeFor(task: ResearchTask): TaskRoute {
  switch (task) {
    case 'fundamentals':
      return {
        model: process.env.INVEST_MODEL_FUNDAMENTALS || FAST_MODEL,
        maxUses: num(process.env.INVEST_SEARCHES_FUNDAMENTALS, 4),
        maxTokens: 3072,
        rationale: 'Extraction of sourced figures — a lookup with a right answer, not a judgement.',
      }
    case 'qualitative':
      return {
        model: process.env.INVEST_MODEL_QUALITATIVE || ANALYSIS_MODEL,
        maxUses: num(process.env.INVEST_SEARCHES_QUALITATIVE, 5),
        maxTokens: 4096,
        rationale: 'The investment judgement itself. Stays on the strong model.',
      }
    case 'discovery':
      return {
        model: process.env.INVEST_MODEL_DISCOVERY || ANALYSIS_MODEL,
        maxUses: num(process.env.INVEST_SEARCHES_DISCOVERY, 5),
        maxTokens: 4096,
        rationale: 'Idea generation is judgement — a weak scan surfaces obvious names.',
      }
    case 'regime':
      return {
        model: process.env.INVEST_MODEL_REGIME || ANALYSIS_MODEL,
        maxUses: num(process.env.INVEST_SEARCHES_REGIME, 5),
        maxTokens: 3072,
        rationale: 'Macro interpretation. Cached for 24h, so it is paid for once a day at most.',
      }
    case 'corporate':
      return {
        model: process.env.INVEST_MODEL_CORPORATE || FAST_MODEL,
        maxUses: num(process.env.INVEST_SEARCHES_CORPORATE, 3),
        maxTokens: 4096,
        rationale: 'Dividends, splits and bonuses are dated facts to be reported, not weighed.',
      }
    case 'connectivity':
      return {
        model: process.env.INVEST_MODEL_CONNECTIVITY || FAST_MODEL,
        maxUses: 1,
        maxTokens: 512,
        rationale: 'A ping. It proves authentication works and nothing else.',
      }
  }
}

export const ALL_TASKS: ResearchTask[] = [
  'fundamentals', 'qualitative', 'discovery', 'regime', 'corporate', 'connectivity',
]

// ── Cost estimation ─────────────────────────────────────────────────────────
//
// EVERYTHING BELOW PRODUCES AN ESTIMATE. It is arithmetic on the token counts
// Anthropic returns in `usage`, multiplied by a published price list held in
// this file. It is NOT a billed amount, it cannot see the Anthropic invoice,
// and it must never be displayed without the word "estimated".

/** Published list prices, USD per million tokens. Update when Anthropic does. */
export interface ModelPrice {
  inputPerMTok: number
  outputPerMTok: number
  cacheWritePerMTok: number
  cacheReadPerMTok: number
}

export const PRICES_AS_OF = '2026-08-18'

const PRICE_TABLE: { match: RegExp; price: ModelPrice }[] = [
  { match: /haiku/i,  price: { inputPerMTok: 1,  outputPerMTok: 5,  cacheWritePerMTok: 1.25, cacheReadPerMTok: 0.10 } },
  { match: /sonnet/i, price: { inputPerMTok: 3,  outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 } },
  { match: /opus/i,   price: { inputPerMTok: 15, outputPerMTok: 75, cacheWritePerMTok: 18.75, cacheReadPerMTok: 1.50 } },
]

/** USD per web search performed by the server-side tool ($10 per 1,000). */
export const WEB_SEARCH_USD = 0.01

/** The price list for a model id, or null when we do not have one — in which
 *  case we report "unknown" rather than guessing a number. */
export function priceFor(model: string | null | undefined): ModelPrice | null {
  if (!model) return null
  for (const row of PRICE_TABLE) if (row.match.test(model)) return row.price
  return null
}

/** Token counts exactly as the API reported them. Every field optional because
 *  a failed call reports nothing, and we must not invent zeros that read as
 *  "this call was free". */
export interface CallUsage {
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  /** Searches the API says it actually ran — not the ceiling we allowed. */
  webSearches: number | null
}

export function emptyUsage(model: string | null = null): CallUsage {
  return {
    model,
    inputTokens: null, outputTokens: null,
    cacheReadTokens: null, cacheWriteTokens: null,
    webSearches: null,
  }
}

export interface CostEstimate {
  /** null when we could not compute one — never 0 as a stand-in. */
  usd: number | null
  /** Always true. Present so no caller can render this as a billed figure. */
  estimated: true
  /** Why we could not price it, when usd is null. */
  reason?: string
}

/** Estimate one call from the counts the API returned. Returns null when the
 *  model is unknown or the call reported no usage at all. */
export function estimateCallCost(u: CallUsage): CostEstimate {
  const price = priceFor(u.model)
  if (!price) return { usd: null, estimated: true, reason: `no price list for ${u.model ?? 'unknown model'}` }
  const anyTokens = u.inputTokens != null || u.outputTokens != null
    || u.cacheReadTokens != null || u.cacheWriteTokens != null
  if (!anyTokens && u.webSearches == null) {
    return { usd: null, estimated: true, reason: 'the call reported no usage' }
  }
  const usd =
      ((u.inputTokens ?? 0) / 1e6) * price.inputPerMTok
    + ((u.outputTokens ?? 0) / 1e6) * price.outputPerMTok
    + ((u.cacheReadTokens ?? 0) / 1e6) * price.cacheReadPerMTok
    + ((u.cacheWriteTokens ?? 0) / 1e6) * price.cacheWritePerMTok
    + (u.webSearches ?? 0) * WEB_SEARCH_USD
  return { usd: Math.round(usd * 1e6) / 1e6, estimated: true }
}

/** Running total across a cycle. `unpriced` counts calls we could not estimate,
 *  so the total is always presented as "at least this much". */
export interface UsageTotals {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  webSearches: number
  estimatedUsd: number
  unpricedCalls: number
  byModel: Record<string, { calls: number; estimatedUsd: number }>
}

export function emptyTotals(): UsageTotals {
  return {
    calls: 0, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0,
    estimatedUsd: 0, unpricedCalls: 0, byModel: {},
  }
}

/** Fold one call into a running total. Pure — returns a new object. */
export function addUsage(totals: UsageTotals, u: CallUsage): UsageTotals {
  const est = estimateCallCost(u)
  const key = u.model ?? 'unknown'
  const prev = totals.byModel[key] ?? { calls: 0, estimatedUsd: 0 }
  return {
    calls: totals.calls + 1,
    inputTokens: totals.inputTokens + (u.inputTokens ?? 0),
    outputTokens: totals.outputTokens + (u.outputTokens ?? 0),
    cacheReadTokens: totals.cacheReadTokens + (u.cacheReadTokens ?? 0),
    cacheWriteTokens: totals.cacheWriteTokens + (u.cacheWriteTokens ?? 0),
    webSearches: totals.webSearches + (u.webSearches ?? 0),
    estimatedUsd: Math.round((totals.estimatedUsd + (est.usd ?? 0)) * 1e6) / 1e6,
    unpricedCalls: totals.unpricedCalls + (est.usd == null ? 1 : 0),
    byModel: {
      ...totals.byModel,
      [key]: {
        calls: prev.calls + 1,
        estimatedUsd: Math.round((prev.estimatedUsd + (est.usd ?? 0)) * 1e6) / 1e6,
      },
    },
  }
}
