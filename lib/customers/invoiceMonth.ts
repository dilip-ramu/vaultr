// What is waiting to be invoiced this month.
//
// WHY THIS EXISTS
//
// The invoices page asked "what are you making?" when the app already knew.
// Billing happens once a month, so the knowledge is never in the head of the
// person standing at the screen — it is in the data: consignments imported and
// not yet billed, expenses paid on a customer's behalf and not yet sorted,
// invoices raised last month that have no counterpart this month.
//
// A job done twelve times a year has to be read, not remembered. So the page
// opens on the list of what is waiting, per customer, with the flow that
// clears each row one click away.
//
// Pure. No React, no database — counts, keys and wording only, so the figures
// a decision is made from can be tested.

export interface AllocationLike {
  customerId: string | null
  customerName: string
  /** What it will bill for, in rupees. */
  amount: number
}

export interface ExpenseLike {
  customerId: string | null
  customerName: string
  /** A billing category has been given, so it can go on an invoice. */
  sorted: boolean
  amount: number
}

export interface InvoiceLike {
  id: string
  number: string | null
  customerId: string | null
  customerName: string
  /** 'YYYY-MM-DD' */
  date: string
  /** 'YYYY-MM' when the invoice carries one. */
  month: string | null
  total: number
  balanceDue: number
  status: string
  dueDate?: string | null
}

/** 'YYYY-MM' for a date or a Date. */
export function monthKey(d: string | Date): string {
  const s = typeof d === 'string' ? d : d.toISOString()
  return s.slice(0, 7)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** 'November 2026'. An unreadable key is handed back untouched. */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  const i = Number(m[2]) - 1
  return MONTHS[i] ? `${MONTHS[i]} ${m[1]}` : key
}

export function previousMonth(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  let y = Number(m[1])
  let mm = Number(m[2]) - 1
  if (mm < 1) { mm = 12; y -= 1 }
  return `${y}-${String(mm).padStart(2, '0')}`
}

/**
 * Which month an invoice belongs to.
 *
 * invoice_month is the one to trust when it is there — a November invoice
 * raised on 2 December is still November's billing. The date is the fallback.
 */
export function invoiceMonth(inv: InvoiceLike): string {
  return inv.month && /^\d{4}-\d{2}$/.test(inv.month) ? inv.month : monthKey(inv.date)
}

/** One customer, and everything of theirs that is not yet on an invoice. */
export interface WaitingRow {
  customerId: string | null
  customerName: string
  consignments: number
  consignmentValue: number
  expensesSorted: number
  expensesUnsorted: number
  expenseValue: number
  /** Invoices already raised for this customer in the month being shown. */
  invoicedThisMonth: number
  /** The flow that clears the most of this row. */
  action: 'courier' | 'reimbursable'
}

/**
 * How two records are decided to be the same customer.
 *
 * By NAME, not by id, because the name is the only thing every side carries:
 * a courier sheet brings customer_name and may bring no id at all, and the
 * courier flow itself addresses a customer by name in its URL. Keying on the
 * id would split one customer into two rows the moment one side of the data
 * had the id and the other did not.
 *
 * An id is still picked up when any record carries one, so the link into the
 * flow can preselect them.
 */
const keyOf = (customerId: string | null, customerName: string) => {
  const name = customerName.trim().toLowerCase().replace(/\s+/g, ' ')
  return name || `id:${customerId ?? 'unknown'}`
}

/**
 * What is waiting, one row per customer, heaviest first.
 *
 * A customer with nothing waiting is left out — this is a to-do list, not a
 * directory. Being already invoiced this month does NOT remove a row, because
 * late consignments arriving after the invoice went out are exactly the thing
 * that gets missed.
 */
export function waitingRows(
  allocations: readonly AllocationLike[],
  expenses: readonly ExpenseLike[],
  invoices: readonly InvoiceLike[],
  month: string,
): WaitingRow[] {
  const rows = new Map<string, WaitingRow>()
  const blank = (customerId: string | null, customerName: string): WaitingRow => ({
    customerId, customerName,
    consignments: 0, consignmentValue: 0,
    expensesSorted: 0, expensesUnsorted: 0, expenseValue: 0,
    invoicedThisMonth: 0,
    action: 'courier',
  })
  const get = (customerId: string | null, customerName: string) => {
    const k = keyOf(customerId, customerName)
    let row = rows.get(k)
    if (!row) { row = blank(customerId, customerName); rows.set(k, row) }
    // A row first seen without an id gains one later if an allocation or an
    // expense carries it, so the link into the flow can preselect them.
    if (!row.customerId && customerId) row.customerId = customerId
    return row
  }

  for (const a of allocations) {
    const row = get(a.customerId, a.customerName)
    row.consignments += 1
    row.consignmentValue += Number(a.amount) || 0
  }
  for (const e of expenses) {
    const row = get(e.customerId, e.customerName)
    if (e.sorted) row.expensesSorted += 1
    else row.expensesUnsorted += 1
    row.expenseValue += Number(e.amount) || 0
  }

  for (const inv of invoices) {
    if (invoiceMonth(inv) !== month) continue
    const k = keyOf(inv.customerId, inv.customerName)
    const row = rows.get(k)
    if (row) row.invoicedThisMonth += 1
  }

  for (const row of rows.values()) {
    // Expenses are the bigger job when there are any: sorting them is the
    // step people forget, and the reimbursable invoice can carry courier
    // charges along with them anyway.
    row.action = (row.expensesSorted + row.expensesUnsorted) > 0 ? 'reimbursable' : 'courier'
    row.consignmentValue = Math.round(row.consignmentValue * 100) / 100
    row.expenseValue = Math.round(row.expenseValue * 100) / 100
  }

  return Array.from(rows.values())
    .filter(r => r.consignments + r.expensesSorted + r.expensesUnsorted > 0)
    .sort((a, b) =>
      (b.consignmentValue + b.expenseValue) - (a.consignmentValue + a.expenseValue)
      || a.customerName.localeCompare(b.customerName))
}

/** What is waiting on one row, in words. Counts only — no money, no currency. */
export function waitingWords(row: WaitingRow): string {
  const parts: string[] = []
  if (row.consignments > 0) {
    parts.push(`${row.consignments} consignment${row.consignments === 1 ? '' : 's'} to bill`)
  }
  if (row.expensesUnsorted > 0) {
    parts.push(`${row.expensesUnsorted} expense${row.expensesUnsorted === 1 ? '' : 's'} still to sort`)
  }
  if (row.expensesSorted > 0) {
    parts.push(`${row.expensesSorted} sorted and ready`)
  }
  return parts.join(' · ')
}

export interface MonthSummary {
  count: number
  total: number
  outstanding: number
  overdue: number
}

/** The month's invoices, settled or not. `today` is passed in so it is testable. */
export function monthSummary(
  invoices: readonly InvoiceLike[],
  month: string,
  today: string = new Date().toISOString().slice(0, 10),
): MonthSummary {
  const out: MonthSummary = { count: 0, total: 0, outstanding: 0, overdue: 0 }
  for (const inv of invoices) {
    if (invoiceMonth(inv) !== month) continue
    if (inv.status === 'cancelled') continue
    out.count += 1
    out.total += Number(inv.total) || 0
    if (inv.status !== 'paid') {
      out.outstanding += Number(inv.balanceDue) || 0
      if (inv.dueDate && inv.dueDate < today) out.overdue += 1
    }
  }
  out.total = Math.round(out.total * 100) / 100
  out.outstanding = Math.round(out.outstanding * 100) / 100
  return out
}

/**
 * This month against last month, in words.
 *
 * The most useful reminder for a job done once a month is what you did the
 * last time, so a month that is short of the one before it says so plainly
 * rather than leaving you to compare two numbers.
 */
export function monthComparison(now: MonthSummary, before: MonthSummary): string {
  if (before.count === 0 && now.count === 0) return 'No invoices either month.'
  if (before.count === 0) return `${now.count} so far. Nothing was invoiced the month before.`
  if (now.count === 0) return `Nothing invoiced yet. ${before.count} went out the month before.`
  if (now.count < before.count) {
    const short = before.count - now.count
    return `${now.count} so far, against ${before.count} the month before — ${short} fewer.`
  }
  if (now.count === before.count) return `${now.count} so far, the same as the month before.`
  return `${now.count} so far, against ${before.count} the month before.`
}
