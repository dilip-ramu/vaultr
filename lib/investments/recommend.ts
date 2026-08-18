// The recommendation engine (brief §9, §11, §13, §14, §15).
//
// Deterministic and testable. It does NOT write prose — the AI research step
// supplies the bull/base/bear, fair value, catalysts and invalidation. What
// lives HERE is the judgement that must be transparent and repeatable:
//
//   1. Data-confidence GATE — thin evidence => INSUFFICIENT_DATA, never a guess.
//   2. Score → action bands (different for owned vs not owned).
//   3. Valuation "why now vs WAIT" — a great company at a bad price is a HOLD,
//      not a BUY ("GOOD COMPANY — WAIT FOR BETTER ENTRY").
//   4. Portfolio-awareness — the best stock is not the best BUY if it worsens
//      concentration. A buy into an already-heavy sector/name is downgraded.
//   5. Regime selectivity — in risk-off/crisis we demand a higher bar and size
//      smaller. It sizes risk; it is NOT a market-timing on/off switch.

import type { RecAction, RegimeState } from './types'
import type { PortfolioSummary } from './portfolio'
import { sectorWeight, nameWeight } from './portfolio'

export interface DecideConfig {
  minConfidence: number      // below this => INSUFFICIENT_DATA
  maxSingleNamePct: number   // single-name concentration ceiling
  maxSectorPct: number       // sector concentration ceiling
}
export const DEFAULT_CONFIG: DecideConfig = { minConfidence: 45, maxSingleNamePct: 12, maxSectorPct: 30 }

export interface DecideInput {
  symbol: string
  isHolding: boolean
  score: number              // 0–100 total from scoreSecurity
  dataConfidence: number     // 0–100
  valuationScore?: number | null   // 0–100 valuation factor
  currentPrice?: number | null
  fairValueHigh?: number | null
  sector?: string | null
  regimeState?: RegimeState
  portfolio: PortfolioSummary
  /** Set when research says the thesis is broken (owned => SELL, else AVOID). */
  thesisInvalidated?: boolean
  config?: Partial<DecideConfig>
}

export interface Decision {
  action: RecAction
  why_now: string | null
  portfolio_context: string | null
  max_alloc_pct: number | null
  ai_confidence: number
  wait: boolean
  concentration_flag: boolean
}

const BUY_ACTIONS: RecAction[] = ['STRONG_BUY', 'BUY', 'ACCUMULATE']
const clamp = (n: number) => Math.max(0, Math.min(100, n))

function regimePenalty(state?: RegimeState): number {
  switch (state) {
    case 'cautious': return 5
    case 'risk_off': return 10
    case 'crisis': return 18
    default: return 0            // risk_on / neutral
  }
}

function bandNotHolding(s: number): RecAction {
  if (s >= 80) return 'STRONG_BUY'
  if (s >= 68) return 'BUY'
  if (s >= 58) return 'ACCUMULATE'
  if (s >= 40) return 'HOLD'      // watch / no action
  return 'AVOID'
}
function bandHolding(s: number): RecAction {
  if (s >= 82) return 'STRONG_BUY'
  if (s >= 70) return 'ACCUMULATE'
  if (s >= 50) return 'HOLD'
  if (s >= 38) return 'REDUCE'
  return 'SELL'
}

export function decide(input: DecideInput): Decision {
  const cfg = { ...DEFAULT_CONFIG, ...(input.config ?? {}) }
  const dc = clamp(input.dataConfidence)
  const aiConfidence = Math.round(dc * (0.65 + 0.35 * (Math.abs(input.score - 50) / 50)))

  // 1. Data-confidence gate ---------------------------------------------------
  if (dc < cfg.minConfidence) {
    return {
      action: 'INSUFFICIENT_DATA',
      why_now: `Data confidence is only ${Math.round(dc)}/100 — evidence is too thin, stale, or contradictory to justify a call. Do not buy yet.`,
      portfolio_context: null,
      max_alloc_pct: null,
      ai_confidence: aiConfidence,
      wait: false,
      concentration_flag: false,
    }
  }

  // 2. Thesis broken ----------------------------------------------------------
  if (input.thesisInvalidated) {
    return {
      action: input.isHolding ? 'SELL' : 'AVOID',
      why_now: 'A core thesis condition has materially deteriorated — the reason to own this no longer holds.',
      portfolio_context: null,
      max_alloc_pct: 0,
      ai_confidence: aiConfidence,
      wait: false,
      concentration_flag: false,
    }
  }

  // 3. Score → base action (regime raises the bar on the buy side) ------------
  const effective = input.score - regimePenalty(input.regimeState)
  let action = input.isHolding ? bandHolding(effective) : bandNotHolding(effective)

  let why_now: string | null = null
  let wait = false

  // 4. Valuation: good company, bad price => WAIT -----------------------------
  const richValuation = input.valuationScore != null && input.valuationScore < 40
  const abovePrice = input.currentPrice != null && input.fairValueHigh != null && input.currentPrice > input.fairValueHigh
  if (BUY_ACTIONS.includes(action) && (richValuation || abovePrice)) {
    wait = true
    action = 'HOLD'
    why_now = 'GOOD COMPANY — WAIT FOR BETTER ENTRY. The business scores well but the current price offers an unattractive risk/reward; wait for a valuation dislocation or a pullback toward fair value.'
  }

  // 5. Portfolio-awareness: don't worsen concentration ------------------------
  let portfolio_context: string | null = null
  let concentration_flag = false
  if (BUY_ACTIONS.includes(action)) {
    const secW = sectorWeight(input.portfolio, input.sector)
    const nameW = nameWeight(input.portfolio, input.symbol)
    if (secW >= cfg.maxSectorPct) {
      concentration_flag = true
      action = 'HOLD'
      portfolio_context = `Attractive on its own, but ${input.sector || 'this sector'} is already ${secW.toFixed(0)}% of the portfolio (ceiling ${cfg.maxSectorPct}%). Adding here would worsen concentration — hold off for portfolio-level risk reasons, not company reasons.`
    } else if (nameW >= cfg.maxSingleNamePct) {
      concentration_flag = true
      action = 'HOLD'
      portfolio_context = `This name is already ${nameW.toFixed(0)}% of the portfolio (single-name ceiling ${cfg.maxSingleNamePct}%). Adding more concentrates risk further — hold at the current weight.`
    }
  }

  // 6. Suggested max allocation (score- and regime-scaled) --------------------
  let max_alloc_pct: number | null = null
  if (!['SELL', 'AVOID', 'INSUFFICIENT_DATA'].includes(action)) {
    const base = Math.min(cfg.maxSingleNamePct, Math.round(input.score / 10))
    const regimeScale = input.regimeState === 'risk_off' ? 0.7 : input.regimeState === 'crisis' ? 0.5 : input.regimeState === 'cautious' ? 0.85 : 1
    max_alloc_pct = Math.max(0, Math.round(base * regimeScale))
  } else if (action === 'SELL' || action === 'AVOID') {
    max_alloc_pct = 0
  }

  return { action, why_now, portfolio_context, max_alloc_pct, ai_confidence: aiConfidence, wait, concentration_flag }
}
