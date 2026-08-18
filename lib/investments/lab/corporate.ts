// Dividends + corporate actions (Phase-2 clarification). PURE and deterministic:
// given a position and an event, return the exact effect. Total return =
// price change + dividends + corporate actions, so these feed the same
// accounting engine as trades.
//
// Supported here: dividends, stock splits, bonus issues. Everything else
// (rights, buyback, merger, demerger) is FLAGGED by the caller — never silently
// applied — because a wrong adjustment is worse than a visible gap.

import type { LabPosition } from './types'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface DividendEvent {
  dividendPerShare: number
  taxPct?: number            // assumed withholding, documented
}
export interface DividendResult {
  sharesOnRecord: number
  gross: number
  tax: number
  net: number                // credited to virtual cash
}

/** Cash a dividend credits. Position quantity/cost basis are UNCHANGED. */
export function applyDividend(position: Pick<LabPosition, 'quantity'>, ev: DividendEvent): DividendResult {
  const shares = position.quantity
  const gross = round2(shares * ev.dividendPerShare)
  const tax = round2(gross * (ev.taxPct ?? 0))
  return { sharesOnRecord: shares, gross, tax, net: round2(gross - tax) }
}

/**
 * Stock split — `ratio` = new shares per old share (e.g. a ₹10→₹2 face split is
 * ratio 5). Quantity scales up; TOTAL cost basis is unchanged (per-share cost
 * falls). No cash effect.
 */
export function applySplit(position: Pick<LabPosition, 'quantity' | 'cost_basis'>, ratio: number): { quantity: number; cost_basis: number } {
  if (!(ratio > 0)) return { quantity: position.quantity, cost_basis: position.cost_basis }
  return { quantity: round2(position.quantity * ratio), cost_basis: position.cost_basis }
}

/**
 * Bonus issue — `bonusPerShare` = bonus shares per share held (a 1:1 bonus is 1).
 * Quantity rises; total cost basis unchanged (per-share cost falls). No cash.
 */
export function applyBonus(position: Pick<LabPosition, 'quantity' | 'cost_basis'>, bonusPerShare: number): { quantity: number; cost_basis: number } {
  if (!(bonusPerShare > 0)) return { quantity: position.quantity, cost_basis: position.cost_basis }
  return { quantity: round2(position.quantity * (1 + bonusPerShare)), cost_basis: position.cost_basis }
}

export const SUPPORTED_ACTIONS = ['split', 'bonus'] as const
export const FLAGGED_ACTIONS = ['rights', 'buyback', 'merger', 'demerger', 'other'] as const
export function isSupportedAction(type: string): boolean {
  return (SUPPORTED_ACTIONS as readonly string[]).includes(type)
}
