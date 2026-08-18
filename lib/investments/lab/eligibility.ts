// Corporate-action eligibility and effects (correctness pass, items 3 and 4).
// PURE — every function here is a calculation over data the caller supplies, so
// each one is unit-testable and none of them can reach the network or the clock.
//
// The important idea: dividend eligibility is a fact about the PAST, and the
// Lab already stores an immutable record of the past — lab_trades. So instead of
// using "however many shares we hold right now" (which is wrong the moment a
// position is added to or trimmed after the ex-date), we replay the trade log up
// to the eligibility cut-off and use the quantity that was actually held then.

import { istDateString, addDays } from '../marketdate'

export interface TradeLike {
  ts: string                 // ISO instant
  side: 'buy' | 'sell'
  symbol: string
  exchange: string
  quantity: number
}

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Shares held at the close of `dateStr` (IST), reconstructed from the trade log.
 * Trades stamped later than that date are ignored — no hindsight.
 */
export function sharesHeldAsOf(
  trades: TradeLike[], symbol: string, exchange: string, dateStr: string,
): number {
  const sym = symbol.toUpperCase()
  let qty = 0
  for (const t of trades) {
    if (t.symbol.toUpperCase() !== sym) continue
    if (t.exchange !== exchange) continue
    const tradeDate = istDateString(new Date(t.ts))
    if (tradeDate > dateStr) continue
    qty += (t.side === 'buy' ? 1 : -1) * Number(t.quantity || 0)
  }
  return round4(Math.max(0, qty))
}

/**
 * The last day on which a purchase still earns the dividend: the day before the
 * ex-date. Buy on or after the ex-date and you do not receive it.
 */
export function eligibilityCutoff(exDate: string): string {
  return addDays(exDate, -1)
}

/** Shares that qualify for a dividend with this ex-date. */
export function eligibleShares(trades: TradeLike[], symbol: string, exchange: string, exDate: string): number {
  return sharesHeldAsOf(trades, symbol, exchange, eligibilityCutoff(exDate))
}

export interface DividendComputation {
  sharesOnRecord: number
  gross: number
  taxPct: number
  tax: number
  net: number
}

/** gross = eligible shares × dividend per share; net applies the documented
 *  withholding assumption. */
export function computeDividend(shares: number, dividendPerShare: number, taxPct = 0): DividendComputation {
  const gross = round2(shares * dividendPerShare)
  const tax = round2(gross * taxPct)
  return { sharesOnRecord: shares, gross, taxPct, tax, net: round2(gross - tax) }
}

/**
 * A split or bonus multiplies the share count, so the carried-forward price
 * must be divided by the same factor or the next NAV mark reads as a crash.
 * (The exchange quote is already post-adjustment; our stored price is not.)
 */
export function adjustCarriedPrice(price: number | null | undefined, factor: number): number | null {
  if (price == null || !(price > 0) || !(factor > 0)) return price ?? null
  return round2(price / factor)
}

/** Quantity multiplier for an event. Split ratio = new shares per old share;
 *  bonus ratio = bonus shares per share held. */
export function quantityFactor(type: 'split' | 'bonus', ratio: number): number {
  if (!(ratio > 0)) return 1
  return type === 'split' ? ratio : 1 + ratio
}
