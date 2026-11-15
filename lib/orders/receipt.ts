// What rate you actually got.
//
// An export invoice is in dollars; the money arrives in rupees. The rate on
// the contract is not the rate you got — the bank's rate is, less its
// charges, adjusted for whatever the customer actually settled. So the rate
// is not typed in. It is worked out from the only three things you can read
// off a bank advice:
//
//   rate = (remittance − bank charges) ÷ (invoice value ± adjustment)
//
// WHICH SIDE AN ADJUSTMENT LANDS ON IS DECIDED BY ITS CURRENCY, and that is
// the one judgement call in here.
//
// An adjustment in the ORDER'S CURRENCY changes what was settled: a customer
// short-paying $500 settled $47,500 of a $48,000 invoice, so it belongs in
// the denominator.
//
// An adjustment in RUPEES changes the rupees: there is no non-circular way
// to put it in the denominator, because converting it would need the very
// rate being calculated. Putting it in the numerator is exact, and it is
// also what the money did.
//
// Either way an addition raises the side it lands on and a deduction lowers
// it, which is the rule you asked for.
//
// Pure. A realised rate feeds the P/L, and a rate nobody can test is a
// margin nobody should trust.

export type AdjustmentCurrency = 'fx' | 'inr'
export type AdjustmentSign = 'add' | 'deduct'

export interface Adjustment {
  amount: number
  currency: AdjustmentCurrency
  sign: AdjustmentSign
  /** What it was — short payment, discount, a charge the customer took. */
  reason?: string | null
}

export interface ReceiptInput {
  /** The remittance, in rupees, before the bank took its charges. */
  remittanceInr: number
  /** What the bank charged, in rupees. */
  bankCharges?: number
  /** The invoice value, in the order's currency. */
  invoiceFx: number
  adjustment?: Adjustment | null
}

export interface ReceiptResult {
  /** Rupees after charges — what actually landed, and the numerator. */
  netInr: number
  /** Order currency actually settled — the denominator. */
  settledFx: number
  /** The rate this receipt achieved. null when it cannot be worked out. */
  realisedRate: number | null
  /** Why it cannot, when it cannot. */
  problem: string | null
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const r2 = (n: number) => Math.round(n * 100) / 100
/** Rates are quoted to four places; rounding to two loses real money on a
 *  large remittance. */
const r4 = (n: number) => Math.round(n * 10000) / 10000

/** Signed, in whatever currency it was entered in. */
export function adjustmentValue(a: Adjustment | null | undefined): number {
  if (!a) return 0
  const amount = Math.abs(num(a.amount))
  return a.sign === 'deduct' ? -amount : amount
}

export function computeReceipt(i: ReceiptInput): ReceiptResult {
  const remittance = num(i.remittanceInr)
  const charges = Math.max(0, num(i.bankCharges))
  const adj = i.adjustment ?? null
  const signed = adjustmentValue(adj)

  // Rupee adjustments go with the rupees, currency adjustments with the
  // currency. See the note at the top of this file.
  const netInr = r2(remittance - charges + (adj?.currency === 'inr' ? signed : 0))
  const settledFx = r2(num(i.invoiceFx) + (adj?.currency === 'fx' ? signed : 0))

  if (settledFx <= 0) {
    return { netInr, settledFx, realisedRate: null, problem: 'Nothing settled to divide by — check the invoice value and the adjustment' }
  }
  if (netInr <= 0) {
    return { netInr, settledFx, realisedRate: null, problem: 'Nothing received after charges' }
  }
  return { netInr, settledFx, realisedRate: r4(netInr / settledFx), problem: null }
}

/** The sum shown on screen, so nobody has to trust the single number. */
export function receiptWorkings(i: ReceiptInput, currency: string): string[] {
  const r = computeReceipt(i)
  const adj = i.adjustment ?? null
  const signed = adjustmentValue(adj)
  const out: string[] = []

  const charges = Math.max(0, num(i.bankCharges))
  out.push(charges
    ? `₹${num(i.remittanceInr).toLocaleString('en-IN')} received − ₹${charges.toLocaleString('en-IN')} bank charges`
    : `₹${num(i.remittanceInr).toLocaleString('en-IN')} received`)
  if (adj && signed !== 0 && adj.currency === 'inr') {
    out.push(`${signed > 0 ? '+' : '−'} ₹${Math.abs(signed).toLocaleString('en-IN')} ${adj.sign === 'add' ? 'addition' : 'deduction'}`)
  }
  out.push(`= ₹${r.netInr.toLocaleString('en-IN')}`)

  out.push(`${currency} ${num(i.invoiceFx).toLocaleString('en-IN')} invoiced`)
  if (adj && signed !== 0 && adj.currency === 'fx') {
    out.push(`${signed > 0 ? '+' : '−'} ${currency} ${Math.abs(signed).toLocaleString('en-IN')} ${adj.sign === 'add' ? 'addition' : 'deduction'}`)
  }
  out.push(`= ${currency} ${r.settledFx.toLocaleString('en-IN')} settled`)
  return out
}

export interface ReceiptRow {
  netInr: number
  settledFx: number
}

/**
 * The rate across every receipt on the order.
 *
 * Weighted by what each one settled, not averaged: two receipts, one of
 * $40,000 at 88 and one of $1,000 at 95, did not get you 91.5. The order's
 * realised rate is total rupees over total currency, which is the only
 * figure the P/L can honestly use.
 */
export function blendedRate(rows: readonly ReceiptRow[]): number | null {
  let inr = 0, fx = 0
  for (const r of rows) {
    inr += num(r.netInr)
    fx += num(r.settledFx)
  }
  if (fx <= 0) return null
  return r4(inr / fx)
}
