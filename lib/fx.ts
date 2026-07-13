// Money in more than one currency.
//
// The rule this file exists to enforce: NEVER add two numbers in different
// currencies. A ₹90,000 account and a €1,000 account do not make 91,000 of
// anything. Every total that spans currencies must convert first, at a rate you
// can name — and must be able to say what it converted and at what rate, because
// a total that moves when you didn't spend anything needs explaining.

export const BASE_CURRENCY = 'INR'

export interface FxRate {
  currency: string
  /** Base-currency units per 1 unit of `currency`. EUR at 91 → 1 EUR = ₹91. */
  market_rate: number
}

/** currency → rate. The base currency is always exactly 1. */
export function rateMap(rates: FxRate[]): Record<string, number> {
  const m: Record<string, number> = { [BASE_CURRENCY]: 1 }
  for (const r of rates) {
    const rate = Number(r.market_rate)
    if (r.currency && Number.isFinite(rate) && rate > 0) m[r.currency.toUpperCase()] = rate
  }
  return m
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Convert to the base currency.
 *
 * Returns null — not 0 — when there's no rate. A missing rate is "I don't know",
 * and quietly calling it zero would delete money from every total that uses it.
 */
export function toBase(amount: number, currency: string, rates: Record<string, number>): number | null {
  const code = (currency || BASE_CURRENCY).toUpperCase()
  if (code === BASE_CURRENCY) return round2(amount)
  const rate = rates[code]
  if (!rate || !Number.isFinite(rate)) return null
  return round2(amount * rate)
}

export interface CurrencyHolding {
  currency: string
  /** Total in that currency, as held. */
  native: number
  /** The same money in base currency, or null if we have no rate. */
  base: number | null
  rate: number | null
  accounts: number
}

export interface MixedTotal {
  /** Sum of everything we COULD convert. */
  base: number
  /** One line per currency actually held. */
  holdings: CurrencyHolding[]
  /** Currencies held with no rate — their money is NOT in `base`. */
  missingRates: string[]
  /** True when at least one holding is in a foreign currency. */
  multiCurrency: boolean
}

/**
 * Total a set of balances that may be in different currencies.
 *
 * `missingRates` is the honest part: if you hold £200 and there's no GBP rate,
 * that £200 is NOT silently dropped into the total as zero — it's excluded and
 * named, so the UI can say "plus £200 we can't convert" instead of lying.
 */
export function sumInBase(
  items: { balance: number; currency?: string | null }[],
  rates: Record<string, number>,
): MixedTotal {
  const byCcy = new Map<string, { native: number; accounts: number }>()

  for (const it of items) {
    const code = (it.currency || BASE_CURRENCY).toUpperCase()
    const cur = byCcy.get(code) ?? { native: 0, accounts: 0 }
    cur.native += Number(it.balance) || 0
    cur.accounts += 1
    byCcy.set(code, cur)
  }

  const holdings: CurrencyHolding[] = []
  const missingRates: string[] = []
  let base = 0

  for (const [currency, { native, accounts }] of byCcy) {
    const converted = toBase(native, currency, rates)
    if (converted === null) missingRates.push(currency)
    else base += converted

    holdings.push({
      currency,
      native: round2(native),
      base: converted,
      rate: currency === BASE_CURRENCY ? 1 : (rates[currency] ?? null),
      accounts,
    })
  }

  holdings.sort((a, b) => (b.base ?? 0) - (a.base ?? 0))

  return {
    base: round2(base),
    holdings,
    missingRates,
    multiCurrency: holdings.some(h => h.currency !== BASE_CURRENCY),
  }
}

// ── Cross-currency transfers ────────────────────────────────────────────────

export interface CrossTransfer {
  /** What left the source, in the source's currency. */
  amount: number
  fromCurrency: string
  /** What arrived, in the destination's currency. */
  toAmount: number
  toCurrency: string
}

export const isCrossCurrency = (from?: string | null, to?: string | null) =>
  (from || BASE_CURRENCY).toUpperCase() !== (to || BASE_CURRENCY).toUpperCase()

/** The rate you actually got: destination units per source unit. */
export function impliedRate(t: { amount: number; toAmount: number }): number | null {
  const a = Number(t.amount), b = Number(t.toAmount)
  if (!a || !Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b / a) * 1e8) / 1e8
}

/** What the market rate says you'd get — a sanity check, not the truth. */
export function expectedToAmount(
  amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>,
): number | null {
  const inBase = toBase(amount, fromCurrency, rates)
  if (inBase === null) return null
  const toCode = (toCurrency || BASE_CURRENCY).toUpperCase()
  if (toCode === BASE_CURRENCY) return round2(inBase)
  const toRate = rates[toCode]
  if (!toRate) return null
  return round2(inBase / toRate)
}

export function validateCrossTransfer(t: Partial<CrossTransfer>): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const amount = Number(t.amount) || 0
  const toAmount = Number(t.toAmount) || 0

  if (amount <= 0) errors.push('Enter the amount that left the account.')
  if (toAmount <= 0) errors.push('Enter the amount that actually arrived.')

  return { ok: errors.length === 0, errors }
}
