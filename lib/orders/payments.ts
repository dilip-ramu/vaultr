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

/**
 * An order has money moving in BOTH directions: out to the supplier and in
 * from the customer. Same three kinds on each side, so the party decides the
 * direction rather than there being six kinds to keep straight.
 */
export type PaymentParty = 'supplier' | 'customer'

export const PAYMENT_KINDS: { key: PaymentKind; label: Record<PaymentParty, string>; hint: Record<PaymentParty, string> }[] = [
  {
    key: 'advance',
    label: { supplier: 'Advance paid', customer: 'Advance received' },
    hint: {
      supplier: 'Paid before the goods — comes off what you owe later',
      customer: 'Received before shipping — comes off what they owe later',
    },
  },
  {
    key: 'settlement',
    label: { supplier: 'Payment', customer: 'Payment received' },
    hint: {
      supplier: 'Paid against the bills on this order',
      customer: 'Received against the invoices on this order',
    },
  },
  {
    key: 'refund',
    label: { supplier: 'Refund from supplier', customer: 'Refund to customer' },
    hint: {
      supplier: 'Money the supplier sent back',
      customer: 'Money you sent back to the customer',
    },
  },
]

/**
 * Out of the account, or into it.
 *
 * Derived, never stored. Two fields that have to agree are two fields that
 * eventually will not, and the one that would be wrong is the one deciding
 * whether the bank balance goes up or down. A refund is simply the normal
 * direction for that party, reversed.
 */
export function direction(kind: PaymentKind, party: PaymentParty = 'supplier'): 'out' | 'in' {
  const normal: 'out' | 'in' = party === 'customer' ? 'in' : 'out'
  if (kind !== 'refund') return normal
  return normal === 'in' ? 'out' : 'in'
}

export function kindLabel(kind: PaymentKind, party: PaymentParty = 'supplier'): string {
  return PAYMENT_KINDS.find(k => k.key === kind)?.label[party] ?? kind
}

export function kindHint(kind: PaymentKind, party: PaymentParty = 'supplier'): string {
  return PAYMENT_KINDS.find(k => k.key === kind)?.hint[party] ?? ''
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export interface PaymentInput {
  kind: PaymentKind
  party: PaymentParty
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
  if (p.party !== 'supplier' && p.party !== 'customer') return 'Is this the customer or the supplier?'
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
  const dir = direction(p.kind, p.party)
  const party = (p.partyName ?? '').trim()
  const who = party ? ` ${dir === 'in' ? 'from' : 'to'} ${party}` : ''
  const head =
    p.kind === 'advance' ? 'Advance' :
    p.kind === 'refund' ? 'Refund' : 'Payment'
  return {
    account_id: p.accountId,
    type: dir === 'in' ? 'income' : 'expense',
    amount: r2(p.amount),
    date: p.date,
    name: `${head}${who} — ${orderNumber}`,
    notes: [p.reference?.trim(), p.note?.trim()].filter(Boolean).join(' · ') || null,
  }
}

// ── Where the order stands on cash ──────────────────────────────────────────

export interface PaymentRow {
  kind: PaymentKind
  party?: PaymentParty
  amount: number
}

export interface PaymentTotals {
  /** Gross moved with this party, before any refund. */
  gross: number
  /** Advances alone, which is what moved before any paper. */
  advances: number
  /** Money that went back the other way. */
  refunds: number
  /** gross − refunds: what has actually changed hands. */
  net: number
}

/** One party's side of the order. */
export function paymentTotals(rows: readonly PaymentRow[], party: PaymentParty = 'supplier'): PaymentTotals {
  let gross = 0, advances = 0, refunds = 0
  for (const r of rows) {
    if ((r.party ?? 'supplier') !== party) continue
    const amount = r2(r.amount)
    if (r.kind === 'refund') refunds += amount
    else {
      gross += amount
      if (r.kind === 'advance') advances += amount
    }
  }
  return { gross: r2(gross), advances: r2(advances), refunds: r2(refunds), net: r2(gross - refunds) }
}

/**
 * What is still owed on one side of the order.
 *
 * Measured against the PAPER — bills on the supplier side, invoices on the
 * customer side — and not against the agreed value: until somebody invoices,
 * nothing is owed however much the order says it will come to. An advance
 * taken before any paper shows as a negative balance, which is the truth:
 * somebody is holding money they have not yet earned.
 */
export function partyBalance(
  documentedTotal: number, rows: readonly PaymentRow[], party: PaymentParty = 'supplier',
): number {
  return r2(r2(documentedTotal) - paymentTotals(rows, party).net)
}

/** Kept for the supplier side, which is what most screens still ask for. */
export function supplierBalance(billedTotal: number, rows: readonly PaymentRow[]): number {
  return partyBalance(billedTotal, rows, 'supplier')
}

/** How the balance should read on screen. */
export function balanceWords(balance: number, party: PaymentParty = 'supplier'): string {
  if (Math.abs(balance) < 0.005) return 'Settled'
  if (party === 'customer') return balance > 0 ? 'still to collect' : 'received in advance'
  return balance > 0 ? 'still to pay' : 'paid in advance'
}
