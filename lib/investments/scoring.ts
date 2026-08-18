// Transparent investment scoring model (brief §12).
//
// Every company gets a 0–100 score built from weighted factors. The weighting is
// deliberate, NOT equal, and documented below. Two kinds of factor:
//
//   • Quantitative — derived here, deterministically, from fundamentals/valuation
//     numbers. Pure and unit-tested.
//   • Qualitative — business quality, management, industry, moat, macro/geo
//     sensitivity — which come from the AI research step as 0–100 inputs.
//
// "Unknown is not zero": a factor with no usable input is DROPPED and the
// remaining weights are renormalised, rather than scored 0 (which would punish a
// company for our missing data). data_confidence is a factor in its own right so
// that thin evidence pulls the score toward the middle.

import type { Fundamentals, Valuation, ScoreBreakdown, ScoreFactor } from './types'

/** Default weights. Sum ≈ 1.0. Fundamentals-first; momentum is a minor input for
 *  long-term theses (brief §5 — technicals support, never lead). Configurable
 *  later via inv_settings.score_weights. */
export const DEFAULT_WEIGHTS: Record<string, number> = {
  business_quality: 0.14,
  earnings_growth: 0.14,
  balance_sheet: 0.12,
  cash_flow: 0.10,
  valuation: 0.16,
  management: 0.08,
  industry: 0.08,
  moat: 0.06,
  momentum: 0.04,
  macro_sensitivity: 0.04,
  geopolitical_risk: 0.02,
  data_confidence: 0.02,
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Score a value that is "good when high", linearly between lo and hi. */
function scaleUp(v: number, lo: number, hi: number): number {
  if (hi === lo) return 50
  return clamp(((v - lo) / (hi - lo)) * 100)
}
/** Score a value that is "good when low" (e.g. leverage, PEG). */
function scaleDown(v: number, lo: number, hi: number): number {
  if (hi === lo) return 50
  return clamp(100 - ((v - lo) / (hi - lo)) * 100)
}

// ── Quantitative factor scorers. Return null when inputs are missing. ─────────

export function scoreEarningsGrowth(f: Fundamentals): number | null {
  const eps = f.eps_growth_pct, rev = f.revenue_growth_pct
  const parts: number[] = []
  if (isNum(eps)) parts.push(scaleUp(eps, -5, 30))
  if (isNum(rev)) parts.push(scaleUp(rev, -5, 25))
  if (!parts.length) return null
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
}

export function scoreBalanceSheet(f: Fundamentals): number | null {
  const parts: number[] = []
  // Leverage via debt vs cash (net-cash is a strong positive).
  if (isNum(f.debt) && isNum(f.cash)) {
    const net = f.cash - f.debt
    const base = isNum(f.ebitda) && f.ebitda > 0 ? f.ebitda : (isNum(f.pat) && f.pat > 0 ? f.pat : null)
    if (base) parts.push(scaleUp(net / base, -3, 1))     // net debt/EBITDA-ish
    else parts.push(net >= 0 ? 70 : 35)
  }
  if (isNum(f.interest_coverage)) parts.push(scaleUp(f.interest_coverage, 1, 8))
  if (isNum(f.promoter_pledge_pct)) parts.push(scaleDown(f.promoter_pledge_pct, 0, 50))
  if (!parts.length) return null
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
}

export function scoreCashFlow(f: Fundamentals): number | null {
  const parts: number[] = []
  if (isNum(f.fcf) && isNum(f.pat) && f.pat !== 0) parts.push(scaleUp(f.fcf / Math.abs(f.pat), 0, 1.2))
  else if (isNum(f.fcf)) parts.push(f.fcf > 0 ? 70 : 30)
  if (isNum(f.ocf)) parts.push(f.ocf > 0 ? 70 : 30)
  if (isNum(f.roce_pct)) parts.push(scaleUp(f.roce_pct, 8, 25))
  if (isNum(f.roe_pct)) parts.push(scaleUp(f.roe_pct, 8, 25))
  if (!parts.length) return null
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
}

export function scoreValuation(v: Valuation, f: Fundamentals): number | null {
  const parts: number[] = []
  // Cheap vs sector / history is good; PEG < 1 is good.
  if (isNum(v.pe) && v.pe > 0) {
    if (isNum(v.sector_pe) && v.sector_pe > 0) parts.push(scaleDown(v.pe / v.sector_pe, 0.5, 2))
    else if (isNum(v.hist_pe) && v.hist_pe > 0) parts.push(scaleDown(v.pe / v.hist_pe, 0.5, 2))
    else parts.push(scaleDown(v.pe, 8, 45))
  } else if (isNum(v.pe) && v.pe <= 0) {
    parts.push(25)  // loss-making on a P/E basis
  }
  if (isNum(v.peg) && v.peg > 0) parts.push(scaleDown(v.peg, 0.5, 2.5))
  if (isNum(v.ev_ebitda) && v.ev_ebitda > 0) parts.push(scaleDown(v.ev_ebitda, 5, 25))
  if (isNum(v.pb) && v.pb > 0 && isNum(f.roe_pct)) {
    // Justified P/B rises with ROE; punish high P/B on low ROE.
    parts.push(scaleUp((f.roe_pct / 15) - (v.pb / 3), -1, 1.5))
  }
  if (!parts.length) return null
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
}

export interface ScoreInputs {
  fundamentals: Fundamentals
  valuation: Valuation
  dataConfidence: number            // 0–100
  /** Qualitative 0–100 scores from AI research; omit/undefined => dropped. */
  qualitative?: Partial<Record<
    'business_quality' | 'management' | 'industry' | 'moat' | 'macro_sensitivity' | 'geopolitical_risk',
    number | null | undefined
  >>
  /** Optional technical momentum score 0–100 (supporting only). */
  momentum?: number | null
  weights?: Record<string, number>
}

/**
 * Combine all factors into a transparent 0–100 score. Missing factors are
 * dropped and weights renormalised over what remains.
 */
export function scoreSecurity(input: ScoreInputs): ScoreBreakdown {
  const w = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) }
  const raw: Record<string, number | null> = {
    earnings_growth: scoreEarningsGrowth(input.fundamentals),
    balance_sheet: scoreBalanceSheet(input.fundamentals),
    cash_flow: scoreCashFlow(input.fundamentals),
    valuation: scoreValuation(input.valuation, input.fundamentals),
    business_quality: input.qualitative?.business_quality ?? null,
    management: input.qualitative?.management ?? null,
    industry: input.qualitative?.industry ?? null,
    moat: input.qualitative?.moat ?? null,
    macro_sensitivity: input.qualitative?.macro_sensitivity ?? null,
    geopolitical_risk: input.qualitative?.geopolitical_risk ?? null,
    momentum: isNum(input.momentum) ? clamp(input.momentum) : null,
    data_confidence: clamp(input.dataConfidence),
  }

  const factors: Record<string, ScoreFactor> = {}
  let weighted = 0
  let totalWeight = 0
  for (const [key, weight] of Object.entries(w)) {
    const s = raw[key]
    if (s == null) continue          // drop missing factor
    const score = Math.round(clamp(s))
    factors[key] = { score, weight }
    weighted += score * weight
    totalWeight += weight
  }
  const total = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0
  return { factors, total }
}
