// Money moving on an order, and the bank entry each movement is.
//
// An advance to a supplier is not a note on a page — it is rupees leaving a
// bank account. So every payment recorded here posts a real transaction, and
// from that moment it is in the balances, the Books and the net worth like
// any other rupee. Chit does the same thing for the same reason; this is the
// order side of it, and the rules live in one place so no screen can post an
// order payment a slightly different way.
//
//   ADVANCE and SETTLEMENT are money OUT — an expense on the chosen account.
//   REFUND is money IN — the supplier sending some back.
//
// The direction is DERIVED from the kind rather than stored beside it. Two
// fields that have to agree are two fields that eventually will not, and the
// one that would be wrong is the one deciding whether the bank balance goes
// up or down.
//
// Pure. The API posts what this returns and nothing else, so what is written
// to the ledger is testable without a database.

export type PaymentKind = 'advance' | 'settlement' | 'refund'

export const PAYMENT_KINDS: { key: PaymentKind; label: string; hint: string }[] = [
  { key: 'advance',    label: 'Advance',   hint: 'Paid before the goods — comes off what you owe later' },
  { key: 'settlement', label: 'Payment',   hint: 'Paid against the bills on this order' },
  { key: 'refund',     label: 'Refund in', hint: 'Money the supplier sent back' },
]

/** Out of the account, or into it. */
export function direction(kind: PaymentKind): 'out' | 'in' {
  return kind === 'refund' ? 'in' : 'out'
}

export function kindLabel(kind: PaymentKind): string {
  return PAYMENT_KINDS.find(k => k.key === kind)?.label ?? kind
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export interface PaymentInput {
  kind: PaymentKind
  amount: number
  date: string
  accountId: string
  partyName?: string | null
  reference?: string | null
  note?: string | null
}

/**
 * Why this payment cannot be posted, in the words that say what to fix.
 * Checked again on the server: the form can be bypassed, the ledger cannot.
 */
export function paymentProblem(p: Partial<PaymentInput>): string | null {
  if (!p.kind || !PAYMENT_KINDS.some(k => k.key === p.kind)) return 'Pick what kind of payment this is'
  if (!p.accountId) return 'Pick the account the money moves through'
  if (!p.date) return 'Pick a date'
  const amount = Number(p.amount)
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount above zero'
  return null
}

export interface TransactionDraft {
  account_id: string
  type: 'expense' | 'income'
  amount: number
  date: string
  name: string
  notes: string | null
}

/** The bank entry a payment is. One function, so every screen posts it alike. */
export function paymentTransaction(p: PaymentInput, orderNumber: string): TransactionDraft {
  const party = (p.partyName ?? '').trim()
  const who = party ? ` ${direction(p.kind) === 'in' ? 'from' : 'to'} ${party}` : ''
  const head =
    p.kind === 'advance' ? 'Advance' :
    p.kind === 'refund' ? 'Refund' : 'Payment'
  return {
    account_id: p.accountId,
    type: direction(p.kind) === 'in' ? 'income' : 'expense',
    amount: r2(p.amount),
    date: p.date,
    name: `${head}${who} — ${orderNumber}`,
    notes: [p.reference?.trim(), p.note?.trim()].filter(Boolean).join(' · ') || null,
  }
}

// ── Where the order stands on cash ──────────────────────────────────────────

export interface PaymentRow {
  kind: PaymentKind
  amount: number
}

export interface PaymentTotals {
  /** Everything paid out — advances and settlements. */
  paidOut: number
  /** Advances alone, which is what has gone before any bill. */
  advances: number
  /** Money the supplier sent back. */
  refunds: number
  /** paidOut − refunds: what has actually left, net. */
  net: number
}

export function paymentTotals(rows: readonly PaymentRow[]): PaymentTotals {
  let paidOut = 0, advances = 0, refunds = 0
  for (const r of rows) {
    const amount = r2(r.amount)
    if (r.kind === 'refund') refunds += amount
    else {
      paidOut += amount
      if (r.kind === 'advance') advances += amount
    }
  }
  return { paidOut: r2(paidOut), advances: r2(advances), refunds: r2(refunds), net: r2(paidOut - refunds) }
}

/**
 * What is still owed to the supplier on this order.
 *
 * Measured against the BILLS, not against the agreed cost: until the supplier
 * invoices, nothing is owed however much the order says it will come to. An
 * advance paid before any bill shows as a negative balance, which is the
 * truth — they are holding your money.
 */
export function supplierBalance(billedTotal: number, rows: readonly PaymentRow[]): number {
  return r2(r2(billedTotal) - paymentTotals(rows).net)
}

/** How the balance should read on screen. */
export function balanceWords(balance: number): string {
  if (Math.abs(balance) < 0.005) return 'Settled'
  return balance > 0 ? 'still to pay' : 'paid in advance'
}
