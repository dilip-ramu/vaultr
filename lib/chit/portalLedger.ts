// What a member sees in their own passbook, month by month.
//
// WHY THIS EXISTS
//
// The passbook was built from the RECEIVABLES table alone: a row per month
// saying what is owed. A chit that was already running when it was entered
// into the app has collections — real money, recorded — and no receivables,
// so the passbook showed a member nothing at all. Months of payments,
// invisible to the person who made them.
//
// So the months come from everywhere they can: what was billed, what was
// paid, and what was auctioned. A month that exists in any of those is a
// month the member should see.
//
// Pure. Rows in, rows out, no database and no clock of its own.

export interface ReceivableRow {
  month_number: number | string
  amount: number | string
  due_date?: string | null
  status?: string | null
}

export interface CollectionRow {
  month_number: number | string
  amount: number | string
  paid_date?: string | null
}

export interface AuctionRow {
  month_number: number | string
  dividend_per_member?: number | string | null
  auction_date?: string | null
}

export interface LedgerRow {
  monthNumber: number
  dueAmount: number
  dueDate: string | null
  status: 'PENDING' | 'PAID' | 'PARTIAL' | 'WAIVED'
  paidAmount: number | null
  paidDate: string | null
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const r2 = (n: number) => Math.round(n * 100) / 100

export interface LedgerInput {
  receivables: readonly ReceivableRow[]
  collections: readonly CollectionRow[]
  auctions: readonly AuctionRow[]
  /** The chit's monthly subscription, before any dividend. */
  installment: number
}

/**
 * One row per month the member has anything to see.
 *
 * Where a month was billed, the billed figure stands — it is what the member
 * was actually told. Where it was not, the figure is worked out the way the
 * rest of the app works it out: the subscription less that month's dividend.
 * A month with neither a bill nor an auction falls back to the plain
 * subscription, which is what it would have been.
 */
export function ledgerRows(i: LedgerInput): LedgerRow[] {
  const billed = new Map<number, ReceivableRow>()
  for (const d of i.receivables) billed.set(Math.round(num(d.month_number)), d)

  const collected = new Map<number, CollectionRow>()
  for (const p of i.collections) collected.set(Math.round(num(p.month_number)), p)

  const auctioned = new Map<number, AuctionRow>()
  for (const a of i.auctions) auctioned.set(Math.round(num(a.month_number)), a)

  const months = [...new Set([...billed.keys(), ...collected.keys(), ...auctioned.keys()])]
    .filter(m => m > 0)
    .sort((a, b) => a - b)

  return months.map(month => {
    const bill = billed.get(month)
    const paid = collected.get(month)
    const auction = auctioned.get(month)

    const due = bill
      ? r2(num(bill.amount))
      : r2(Math.max(0, num(i.installment) - num(auction?.dividend_per_member)))

    const paidAmount = paid ? r2(num(paid.amount)) : null

    return {
      monthNumber: month,
      dueAmount: due,
      dueDate: bill?.due_date ?? null,
      status: statusFor(bill?.status, due, paidAmount),
      paidAmount,
      paidDate: paid?.paid_date ?? null,
    }
  })
}

/**
 * Paid, part paid, or still owed.
 *
 * A stored status wins, because somebody decided it — a waived month is a
 * decision, not an arithmetic result. Otherwise it is read off the money:
 * short of the figure is PARTIAL, which the old passbook could not say at all.
 */
function statusFor(
  stored: string | null | undefined,
  due: number,
  paid: number | null,
): LedgerRow['status'] {
  const said = String(stored ?? '').toUpperCase()
  if (said === 'WAIVED' || said === 'PAID' || said === 'PARTIAL' || said === 'PENDING') {
    // A month marked PENDING that has since been paid in full is paid: the
    // collection is the fact, the status is a label that can lag behind it.
    if (said === 'PENDING' && paid != null && paid >= due && due > 0) return 'PAID'
    return said as LedgerRow['status']
  }
  if (paid == null || paid <= 0) return 'PENDING'
  if (due > 0 && paid < due) return 'PARTIAL'
  return 'PAID'
}

/** What the member owes in all, and what they have put in. */
export function ledgerTotals(rows: readonly LedgerRow[]): {
  due: number; paid: number; outstanding: number; monthsPaid: number
} {
  const due = r2(rows.reduce((s, r) => s + (r.status === 'WAIVED' ? 0 : r.dueAmount), 0))
  const paid = r2(rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0))
  return {
    due,
    paid,
    outstanding: r2(Math.max(0, due - paid)),
    monthsPaid: rows.filter(r => r.status === 'PAID').length,
  }
}
