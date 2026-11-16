// Where the order stands against the supplier's bills.
//
// WHY THIS EXISTS
//
// The supplier bill was the one piece of an order you had to enter somewhere
// else and then come back and link. Forget the link and nothing breaks
// loudly: the P/L quietly keeps using the cost you COSTED AT, the Actual
// column reads like a fact, and the order looks finished. 'Billed ₹0' and
// 'no bill has arrived' looked exactly the same on the screen.
//
// So the state is named. Nothing billed yet is a state. Billed short of what
// was costed is a state. Billed over it is a state, and the one worth an
// eyebrow. And goods gone with no bill behind them is the one to say loudest,
// because that is the gap between the cost you planned and the cost you will
// actually pay.
//
// Pure. No React, no database.

export interface BillLike {
  /** In rupees. A bill in another currency is the caller's problem to convert. */
  amount: number
  isPaid?: boolean
}

export type BillState = 'none' | 'under' | 'matched' | 'over'

export interface BillPosition {
  /** Total billed by the supplier, in rupees. */
  billed: number
  /** What the order costed at — quantity × agreed cost rate. */
  expected: number
  /** billed − expected. Negative means bills are still to come. */
  difference: number
  count: number
  paidCount: number
  state: BillState
  /** True when something has shipped and no bill has arrived at all. */
  shippedUnbilled: boolean
  /** One line, in the words of the job. */
  words: string
}

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const num = (n: number | undefined | null) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/** Rupees, grouped, no decimals — for a sentence rather than a column. */
function rs(n: number): string {
  return `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`
}

export interface BillPositionInput {
  bills: readonly BillLike[]
  /** Planned supplier cost in rupees. */
  expected: number
  /** Pieces shipped so far. Only used to decide whether a missing bill is overdue. */
  shipped?: number
  /**
   * How far a bill may differ from the costed figure and still count as
   * matched. A rounding difference is not a discrepancy; it is rounding.
   * Defaults to 1% or ₹10, whichever is larger.
   */
  tolerancePct?: number
}

export function billPosition(i: BillPositionInput): BillPosition {
  const billed = r2(i.bills.reduce((t, b) => t + num(b.amount), 0))
  const expected = r2(num(i.expected))
  const count = i.bills.length
  const paidCount = i.bills.filter(b => b.isPaid).length
  const shipped = num(i.shipped)
  const difference = r2(billed - expected)

  const pct = i.tolerancePct == null ? 1 : Math.max(0, i.tolerancePct)
  const slack = Math.max(expected * (pct / 100), 10)

  let state: BillState
  if (count === 0) state = 'none'
  else if (Math.abs(difference) <= slack) state = 'matched'
  else if (difference < 0) state = 'under'
  else state = 'over'

  const shippedUnbilled = state === 'none' && shipped > 0

  let words: string
  if (state === 'none') {
    words = shippedUnbilled
      ? `Goods have shipped and no supplier bill has arrived. The cost in the profit and loss is still the ${rs(expected)} you costed at.`
      : `No supplier bill yet. The cost in the profit and loss is the ${rs(expected)} you costed at.`
  } else if (state === 'matched') {
    words = count === 1
      ? `Billed ${rs(billed)}, as costed.`
      : `${count} bills, ${rs(billed)} in all — as costed.`
  } else if (state === 'under') {
    words = `Billed ${rs(billed)} of the ${rs(expected)} costed — ${rs(difference)} still to come.`
  } else {
    words = `Billed ${rs(billed)} against ${rs(expected)} costed — ${rs(difference)} more than planned.`
  }

  return { billed, expected, difference, count, paidCount, state, shippedUnbilled, words }
}

/** How much attention the buy side deserves on the screen. */
export function billTone(p: BillPosition): 'plain' | 'warn' | 'bad' | 'good' {
  if (p.shippedUnbilled) return 'bad'
  if (p.state === 'over') return 'warn'
  if (p.state === 'none' || p.state === 'under') return 'plain'
  return 'good'
}

export interface BillDraftInput {
  orderNumber: string
  /** The purchase order's number, when one has been raised. */
  poNumber?: string | null
  supplierId?: string | null
  /** Planned supplier cost in rupees. */
  expected: number
  /** What is already billed, so a second bill starts at the remainder. */
  billed?: number
}

export interface BillDraft {
  supplierId: string
  /** What is left to bill, never below zero. */
  amount: number
  /** Goes in the bill's notes, so the bill says where it came from. */
  notes: string
}

/**
 * The figures a bill raised from an order starts with.
 *
 * The amount is what is LEFT to bill, not the whole order: a second bill
 * against a part shipment should not open at the full value and invite
 * somebody to double it.
 */
export function billDraftFromOrder(i: BillDraftInput): BillDraft {
  const left = r2(Math.max(0, num(i.expected) - num(i.billed)))
  const ref = i.poNumber?.trim()
  return {
    supplierId: i.supplierId ?? '',
    amount: left,
    notes: ref
      ? `Against purchase order ${ref} (order ${i.orderNumber}).`
      : `Against order ${i.orderNumber}.`,
  }
}
