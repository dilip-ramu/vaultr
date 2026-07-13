// Foreign currency held as an asset.
//
// This is cash you're HOLDING, not cash you're spending — €500 in a drawer, a
// leftover $200 from a trip. If money moves through it, it belongs in Accounts;
// if it just sits there and its rupee value drifts with the market, it belongs
// here.
//
// The value moves for a reason you didn't cause: the rate. So the two numbers
// must stay separate — what you PAID for the currency, and what it's WORTH now.
// Collapsing them hides the entire point of holding it.
//
// The rate comes from the Currencies page (currency_rates). Not a live API: a
// rate you set and can see is one you can reason about; a rate that silently
// changes under you is one that makes your net worth move with no explanation.

export interface ForexDetails {
  /** The currency being held. Deliberately NOT `currency`, which already means
   *  "the currency this asset was PURCHASED in" and drives a separate
   *  conversion — reusing it would double-convert. */
  fx_currency?: string
  /** How much of it you hold. */
  fx_amount?: number
  /** Rupees per unit when you acquired it. What it cost you. */
  fx_acquired_rate?: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** What the holding cost you, in rupees. Always knowable — you paid it. */
export function forexCost(d: ForexDetails): number {
  return round2(num(d.fx_amount) * num(d.fx_acquired_rate))
}

/**
 * What it's worth today, at the rate from the Currencies page.
 *
 * Returns null when that currency has no rate. NOT zero — zero would delete the
 * money from your net worth. NOT cost — that would pretend the rate never moved,
 * which is the only thing this asset does.
 */
export function forexValue(d: ForexDetails, rates: Record<string, number>): number | null {
  const amount = num(d.fx_amount)
  const code = (d.fx_currency ?? '').toUpperCase()
  if (amount <= 0) return 0
  if (!code) return null

  const rate = rates[code]
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null

  return round2(amount * rate)
}

/** Gain purely from the rate moving. Null when we can't price it. */
export function forexGain(d: ForexDetails, rates: Record<string, number>): number | null {
  const value = forexValue(d, rates)
  if (value === null) return null
  return round2(value - forexCost(d))
}

/** The rate move itself, as a percentage. This IS the story of this asset. */
export function forexRateChangePct(d: ForexDetails, rates: Record<string, number>): number | null {
  const acquired = num(d.fx_acquired_rate)
  const code = (d.fx_currency ?? '').toUpperCase()
  const current = rates[code]
  if (!acquired || !current) return null
  return round2(((current - acquired) / acquired) * 100)
}

/** Is this currency priced at all? Used to tell you what to go and set. */
export const hasRate = (d: ForexDetails, rates: Record<string, number>): boolean => {
  const code = (d.fx_currency ?? '').toUpperCase()
  return !!code && !!rates[code] && rates[code] > 0
}

export function validateForex(d: ForexDetails): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!(d.fx_currency ?? '').trim()) errors.push('Pick the currency you hold.')
  if (num(d.fx_amount) <= 0) errors.push('Enter how much of it you hold.')
  if (num(d.fx_acquired_rate) <= 0) errors.push('Enter the rate you got it at (₹ per unit).')
  return { ok: errors.length === 0, errors }
}
