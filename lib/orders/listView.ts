// Reading the orders list: what is shown, in what order, and what it adds up to.
//
// WHY THIS EXISTS
//
// The list was one fixed order with a single open/all switch. With more than a
// handful of orders the questions you actually arrive with — whose orders are
// these, which is the biggest, which is nearest its cut-off, what have we
// billed this lot — all need the same three things: a filter, a sort, and a
// total of whatever is left on screen.
//
// TWO RULES WORTH KNOWING
//
// Money sorts on the RUPEE figure, never on the order's own currency. A list
// holding $48,000 and ₹2,00,000 cannot be ranked by the number in the cell;
// doing that puts the rupee order on top because 200000 > 48000.
//
// Stage sorts by where it sits in the job, not by its name. Alphabetically
// 'cancelled' comes before 'confirmed', which is no use to anybody.
//
// Pure. No React, no database.

import { stageIndex, isOpen } from './stage'

export type SortKey = 'number' | 'customer' | 'po' | 'date' | 'value' | 'profit' | 'margin' | 'stage'
export type SortDir = 'asc' | 'desc'

export interface Sort {
  key: SortKey
  dir: SortDir
}

export interface ListRowLike {
  number: string
  customer_name: string
  customer_po_no: string | null
  order_date: string
  stage: string
  /** The order's own currency value — shown, never sorted on. */
  value: number
  /** The same value in rupees, which is what sorting and totals use. */
  valueInr: number
  /** Invoiced to the customer so far, in rupees. 0 when nothing is invoiced. */
  invoicedInr: number
  net: number
  marginPct: number
}

/**
 * Which way a column should go when you first click it.
 *
 * Text reads naturally A→Z. Money, dates and profit are asked about from the
 * top: the biggest order, the most recent, the best margin.
 */
export function defaultDir(key: SortKey): SortDir {
  return key === 'number' || key === 'customer' || key === 'po' || key === 'stage' ? 'asc' : 'desc'
}

/** Clicking a column: a new one starts at its natural direction, the same one flips. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key !== key) return { key, dir: defaultDir(key) }
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
}

/**
 * Stage order for a LIST, which is not quite the order a progress bar wants.
 *
 * stageIndex gives cancelled -1, because a cancelled order has no position
 * along the job and draws no bar. In a list that would put it at the very
 * top, ahead of live work. It belongs at the end, after closed.
 */
function stageRank(stage: string): number {
  const i = stageIndex(stage)
  return i < 0 ? 99 : i
}

const text = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()
const num = (n: number | null | undefined) => (Number.isFinite(Number(n)) ? Number(n) : 0)

function compare(a: ListRowLike, b: ListRowLike, key: SortKey): number {
  switch (key) {
    case 'number':   return text(a.number).localeCompare(text(b.number), undefined, { numeric: true })
    case 'customer': return text(a.customer_name).localeCompare(text(b.customer_name))
    case 'po':       return text(a.customer_po_no).localeCompare(text(b.customer_po_no))
    case 'date':     return text(a.order_date).localeCompare(text(b.order_date))
    // Rupees, not the cell: see the note at the top of this file.
    case 'value':    return num(a.valueInr) - num(b.valueInr)
    case 'profit':   return num(a.net) - num(b.net)
    case 'margin':   return num(a.marginPct) - num(b.marginPct)
    // Where it sits in the job, not its name.
    case 'stage':    return stageRank(a.stage) - stageRank(b.stage)
  }
}

export function sortRows<T extends ListRowLike>(rows: readonly T[], sort: Sort): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  // The order number is the tie-break, so two orders on the same day never
  // swap places between renders.
  return [...rows].sort((a, b) =>
    (compare(a, b, sort.key) * sign) ||
    text(a.number).localeCompare(text(b.number), undefined, { numeric: true }))
}

export interface Filters {
  /** Order number, customer, or their PO number. Blank matches everything. */
  search: string
  /** Stages to keep. Empty keeps them all. */
  stages: readonly string[]
  /** 'open' hides closed and cancelled, as the page always has. */
  show: 'open' | 'all'
}

export const NO_FILTERS: Filters = { search: '', stages: [], show: 'open' }

export function filterRows<T extends ListRowLike>(rows: readonly T[], f: Filters): T[] {
  const q = text(f.search)
  const stages = new Set(f.stages)
  return rows.filter(r => {
    // An explicitly chosen stage wins over the open/all switch: asking for
    // 'closed' and being shown nothing because the switch says open is the
    // kind of thing that makes a filter feel broken.
    if (stages.size > 0) { if (!stages.has(r.stage)) return false }
    else if (f.show === 'open' && !isOpen(r.stage)) return false

    if (!q) return true
    return text(r.number).includes(q)
      || text(r.customer_name).includes(q)
      || text(r.customer_po_no).includes(q)
  })
}

export function isFiltering(f: Filters): boolean {
  return f.search.trim() !== '' || f.stages.length > 0
}

export interface Turnover {
  /** Invoiced to customers, in rupees. */
  invoicedInr: number
  /** Order value not yet invoiced, in rupees. Never negative. */
  uninvoicedInr: number
  /** The two together: the whole book in view. */
  totalInr: number
  count: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Turnover for the orders in view.
 *
 * Invoiced is turnover in the accounting sense — what has been billed. The
 * uninvoiced remainder sits beside it rather than inside it, because adding
 * the two and calling the result turnover counts work that has not been
 * billed yet.
 *
 * An over-invoiced order contributes nothing to the remainder rather than a
 * negative: the extra is already in the invoiced figure.
 */
export function turnover(rows: readonly ListRowLike[]): Turnover {
  let invoicedInr = 0
  let uninvoicedInr = 0
  for (const r of rows) {
    const inv = Math.max(0, num(r.invoicedInr))
    invoicedInr += inv
    uninvoicedInr += Math.max(0, num(r.valueInr) - inv)
  }
  invoicedInr = r2(invoicedInr)
  uninvoicedInr = r2(uninvoicedInr)
  return { invoicedInr, uninvoicedInr, totalInr: r2(invoicedInr + uninvoicedInr), count: rows.length }
}
