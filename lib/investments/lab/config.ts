// The Lab's ONE authoritative configuration (correctness pass, item 6). PURE.
//
// Before this file the recommendation layer used recommend.DEFAULT_CONFIG
// (12% single name / 30% sector) while the execution engine used the account's
// constraints (10% / 25%). The analysis would therefore tell the journal "this
// allocation is acceptable" and the engine would immediately cap or refuse it —
// two different sets of rules writing contradictions into an immutable record.
//
// Now: lab_accounts.constraints is the single source of truth. resolve() fills
// in defaults for anything an older row is missing, toDecideConfig() hands the
// SAME numbers to the recommender, and constraintsBrief() puts them in the
// analysis prompt so the model reasons inside the real limits.

import type { DecideConfig } from '../recommend'
import type { LabConstraints, ResolvedConstraints, CostModel } from './types'

/** Defaults for a new Lab. Deliberately conservative. */
export const DEFAULT_LAB_CONSTRAINTS: ResolvedConstraints = {
  max_single_pct: 10,
  max_sector_pct: 25,
  min_data_confidence: 45,
  min_price: 20,
  no_leverage: true,
  no_shorting: true,
  no_derivatives: true,
  max_actions_per_cycle: 6,

  min_cash_pct: 2,                    // never spend the account to zero
  max_analyses_per_cycle: 8,          // total AI analyses one cycle may spend
  max_analyses_per_invocation: 2,     // per request, so it finishes in time
  max_web_searches_per_analysis: 6,
  invocation_budget_ms: 45_000,       // yield before any plausible platform cap
  fundamentals_ttl_hours: 168,        // 7 days — results move quarterly
  regime_ttl_hours: 24,
  price_staleness_hours: 30,          // one session + slack
}

export const DEFAULT_COST_MODEL_FIELDS: (keyof CostModel)[] = [
  'brokerage_pct', 'brokerage_flat', 'stt_pct', 'exchange_pct',
  'sebi_pct', 'stamp_pct_buy', 'gst_pct', 'slippage_pct',
]

const num = (v: unknown, fallback: number): number =>
  (typeof v === 'number' && Number.isFinite(v)) ? v : fallback
const bool = (v: unknown, fallback: boolean): boolean =>
  (typeof v === 'boolean') ? v : fallback

/**
 * Merge a stored (possibly partial, possibly ancient) constraints blob over the
 * defaults. Always returns a complete object, so no caller ever needs `as any`
 * or a `??` fallback of its own.
 */
export function resolveConstraints(raw: unknown): ResolvedConstraints {
  const k = (raw ?? {}) as Partial<LabConstraints>
  const d = DEFAULT_LAB_CONSTRAINTS
  return {
    max_single_pct: num(k.max_single_pct, d.max_single_pct),
    max_sector_pct: num(k.max_sector_pct, d.max_sector_pct),
    min_data_confidence: num(k.min_data_confidence, d.min_data_confidence),
    min_price: num(k.min_price, d.min_price),
    no_leverage: bool(k.no_leverage, d.no_leverage),
    no_shorting: bool(k.no_shorting, d.no_shorting),
    no_derivatives: bool(k.no_derivatives, d.no_derivatives),
    max_actions_per_cycle: num(k.max_actions_per_cycle, d.max_actions_per_cycle),
    min_cash_pct: num(k.min_cash_pct, d.min_cash_pct),
    max_analyses_per_cycle: num(k.max_analyses_per_cycle, d.max_analyses_per_cycle),
    max_analyses_per_invocation: num(k.max_analyses_per_invocation, d.max_analyses_per_invocation),
    max_web_searches_per_analysis: num(k.max_web_searches_per_analysis, d.max_web_searches_per_analysis),
    invocation_budget_ms: num(k.invocation_budget_ms, d.invocation_budget_ms),
    fundamentals_ttl_hours: num(k.fundamentals_ttl_hours, d.fundamentals_ttl_hours),
    regime_ttl_hours: num(k.regime_ttl_hours, d.regime_ttl_hours),
    price_staleness_hours: num(k.price_staleness_hours, d.price_staleness_hours),
  }
}

/**
 * The recommendation layer's view of the SAME limits. This is the function that
 * makes item 6 true — every call to decide() from a Lab context must pass it.
 */
export function toDecideConfig(k: LabConstraints): DecideConfig {
  const r = resolveConstraints(k)
  return {
    minConfidence: r.min_data_confidence,
    maxSingleNamePct: r.max_single_pct,
    maxSectorPct: r.max_sector_pct,
  }
}

/** Human-readable limits, injected into the analysis prompt so the model sizes
 *  inside the rules the engine will actually enforce. */
export function constraintsBrief(k: LabConstraints): string {
  const r = resolveConstraints(k)
  return [
    `Portfolio rules in force: max ${r.max_single_pct}% of the portfolio in any single name;`,
    `max ${r.max_sector_pct}% in any one sector;`,
    `keep at least ${r.min_cash_pct}% in cash;`,
    `no buy below ₹${r.min_price} per share;`,
    `no buy when data confidence is under ${r.min_data_confidence}/100;`,
    'delivery equity only — no leverage, no shorting, no derivatives.',
  ].join(' ')
}

/** Rules that must hold for the configuration to be coherent. Returns the list
 *  of problems (empty = valid) so a route can refuse to start a bad Lab. */
export function validateConstraints(k: LabConstraints): string[] {
  const r = resolveConstraints(k)
  const errs: string[] = []
  if (r.max_single_pct <= 0 || r.max_single_pct > 100) errs.push('max_single_pct must be between 0 and 100.')
  if (r.max_sector_pct <= 0 || r.max_sector_pct > 100) errs.push('max_sector_pct must be between 0 and 100.')
  if (r.max_single_pct > r.max_sector_pct) errs.push('max_single_pct cannot exceed max_sector_pct — a single name would breach its own sector ceiling.')
  if (r.min_cash_pct < 0 || r.min_cash_pct >= 100) errs.push('min_cash_pct must be between 0 and 100.')
  if (r.min_data_confidence < 0 || r.min_data_confidence > 100) errs.push('min_data_confidence must be between 0 and 100.')
  if (r.min_price < 0) errs.push('min_price cannot be negative.')
  if (r.max_analyses_per_invocation > r.max_analyses_per_cycle) errs.push('max_analyses_per_invocation cannot exceed max_analyses_per_cycle.')
  if (r.max_analyses_per_invocation < 1) errs.push('max_analyses_per_invocation must be at least 1 or a cycle can never progress.')
  if (r.max_actions_per_cycle < 0) errs.push('max_actions_per_cycle cannot be negative.')
  if (r.invocation_budget_ms < 5_000) errs.push('invocation_budget_ms is too small to complete a single analysis.')
  if (!r.no_shorting || !r.no_leverage || !r.no_derivatives) errs.push('The Lab is delivery-equity only: no_shorting, no_leverage and no_derivatives must all stay true.')
  return errs
}

/**
 * Research freshness policy (item 10). Prices are cheap and volatile; company
 * fundamentals move on results; the macro regime moves on the news cycle.
 */
export function isFresh(fetchedAt: string | null | undefined, ttlHours: number, now: Date = new Date()): boolean {
  if (!fetchedAt) return false
  const t = new Date(fetchedAt).getTime()
  if (!Number.isFinite(t)) return false
  return (now.getTime() - t) < ttlHours * 3_600_000
}

export function hoursSince(at: string | null | undefined, now: Date = new Date()): number | null {
  if (!at) return null
  const t = new Date(at).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.round(((now.getTime() - t) / 3_600_000) * 10) / 10)
}
