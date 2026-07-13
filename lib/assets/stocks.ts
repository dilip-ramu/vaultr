// Stocks as assets.
//
// A stock is the simplest asset the app has: quantity × price. What makes it
// worth its own file is the PRICE — it's fetched, not entered, which means it
// can be missing, stale, or wrong, and the code has to be honest about which.
//
// The rule: a holding with no price is worth "unknown", not zero. Valuing it at
// zero would quietly delete it from your net worth; valuing it at cost would
// pretend the market never moved. Both are lies, so we say we don't know.

export interface StockDetails {
  /** Ticker as the exchange knows it. RELIANCE, TCS, INFY… */
  symbol?: string
  /** NSE | BSE. Decides the suffix used when fetching (.NS / .BO). */
  exchange?: 'NSE' | 'BSE'
  /** Shares held. */
  quantity?: number
  /** What you paid per share, on average. */
  avg_cost?: number
  /** Last fetched market price per share. */
  last_price?: number
  /** When that price was fetched (ISO). Stale prices must be visible as stale. */
  last_price_at?: string
  currency?: string
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** What the holding cost you. Always knowable — you paid it. */
export function stockCost(d: StockDetails): number {
  return round2(num(d.quantity) * num(d.avg_cost))
}

/**
 * What the holding is worth today.
 *
 * Returns null when there's no price — NOT zero, and NOT cost. "I don't know
 * what this is worth" is a real answer and the UI must be able to show it.
 */
export function stockValue(d: StockDetails): number | null {
  const qty = num(d.quantity)
  const price = num(d.last_price)
  if (qty <= 0) return 0
  if (!d.last_price || price <= 0) return null
  return round2(qty * price)
}

/** Profit if you sold at the last fetched price. Null when the price is unknown. */
export function stockGain(d: StockDetails): number | null {
  const value = stockValue(d)
  if (value === null) return null
  return round2(value - stockCost(d))
}

export function stockGainPct(d: StockDetails): number | null {
  const cost = stockCost(d)
  const gain = stockGain(d)
  if (gain === null || cost <= 0) return null
  return round2((gain / cost) * 100)
}

/**
 * How old the price is, in hours. Null when never fetched.
 *
 * This exists so the UI can say "priced 3 days ago" instead of presenting a
 * week-old number as if it were live. A stale price shown confidently is worse
 * than no price at all.
 */
export function priceAgeHours(d: StockDetails, now: Date = new Date()): number | null {
  if (!d.last_price_at) return null
  const then = new Date(d.last_price_at).getTime()
  if (!Number.isFinite(then)) return null
  return Math.max(0, Math.round(((now.getTime() - then) / 3_600_000) * 10) / 10)
}

/** Prices older than this are shown as stale rather than current. */
export const STALE_AFTER_HOURS = 24

export function isPriceStale(d: StockDetails, now: Date = new Date()): boolean {
  const age = priceAgeHours(d, now)
  if (age === null) return true          // never fetched = definitely not fresh
  return age > STALE_AFTER_HOURS
}

/** The ticker as the quote provider wants it: RELIANCE on NSE → RELIANCE.NS */
export function quoteSymbol(d: StockDetails): string | null {
  const sym = (d.symbol ?? '').trim().toUpperCase()
  if (!sym) return null
  if (sym.includes('.')) return sym      // already suffixed — trust the user
  return d.exchange === 'BSE' ? `${sym}.BO` : `${sym}.NS`
}

export function validateStock(d: StockDetails): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!(d.symbol ?? '').trim()) errors.push('Enter the ticker symbol.')
  if (num(d.quantity) <= 0) errors.push('Enter how many shares you hold.')
  if (num(d.avg_cost) < 0) errors.push('Average cost cannot be negative.')
  return { ok: errors.length === 0, errors }
}

/** Totals across a portfolio. Holdings with no price are counted and named. */
export function portfolio(holdings: StockDetails[]) {
  let cost = 0
  let value = 0
  const unpriced: string[] = []

  for (const h of holdings) {
    cost += stockCost(h)
    const v = stockValue(h)
    if (v === null) unpriced.push((h.symbol ?? '?').toUpperCase())
    else value += v
  }

  return {
    cost: round2(cost),
    /** Only the holdings we could actually price. */
    value: round2(value),
    gain: round2(value - cost),
    /** Symbols with no price — their value is NOT in `value`. */
    unpriced,
  }
}
