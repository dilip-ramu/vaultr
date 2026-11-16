// Which order an invoice's money belongs to.
//
// WHY THIS EXISTS
//
// One invoice often covers two customer POs, and one PO is often invoiced in
// two goes. The order used to live on the invoice HEADER, so an invoice
// belonged to one order or to none — and a shared invoice would have counted
// in full against whichever order it was tied to, overstating that order's
// profit and leaving the other showing nothing invoiced.
//
// The money is on the LINES, so the lines carry the order. Nothing has to be
// split by hand: pick styles from two orders onto one invoice and each
// order's figure follows its own lines, exact to the rupee.
//
// Pure. No React, no database.

export interface InvoiceLineLike {
  /** Which order this line belongs to. null = untagged, older data. */
  orderId: string | null
  /** Line total in the INVOICE's currency, tax excluded. */
  amount: number
  /** Quantity on the line, for working out what is left to bill. */
  qty?: number
  /** Which order LINE it came from, when it was raised from an order. */
  orderLineId?: string | null
}

export interface InvoiceLike {
  id: string
  /** The order it was raised from, which older invoices have instead of tags. */
  orderId: string | null
  /** The invoice total, used only for an invoice whose lines carry no tags. */
  total: number
  lines: readonly InvoiceLineLike[]
}

const num = (n: number | null | undefined) => (Number.isFinite(Number(n)) ? Number(n) : 0)
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * What one order has been invoiced, in the invoices' currency.
 *
 * TAGGED LINES WIN. For an invoice whose lines carry no order — anything
 * raised before the tags existed, or a courier invoice attached by hand — the
 * whole invoice counts against the order it was raised from, which is exactly
 * what the app did before. Mixing the two rules per invoice rather than
 * globally is what lets old and new invoices sit on the same order.
 */
export function invoicedForOrder(invoices: readonly InvoiceLike[], orderId: string): number {
  let total = 0
  for (const inv of invoices) {
    const tagged = inv.lines.filter(l => l.orderId)
    if (tagged.length > 0) {
      total += tagged.filter(l => l.orderId === orderId).reduce((t, l) => t + num(l.amount), 0)
    } else if (inv.orderId === orderId) {
      total += num(inv.total)
    }
  }
  return r2(total)
}

/** Every order this invoice carries money for, most first. */
export function ordersOnInvoice(inv: InvoiceLike): { orderId: string; amount: number }[] {
  const by = new Map<string, number>()
  for (const l of inv.lines) {
    if (!l.orderId) continue
    by.set(l.orderId, num(by.get(l.orderId)) + num(l.amount))
  }
  if (by.size === 0 && inv.orderId) by.set(inv.orderId, num(inv.total))
  return [...by.entries()]
    .map(([orderId, amount]) => ({ orderId, amount: r2(amount) }))
    .sort((a, b) => b.amount - a.amount)
}

/** True when this invoice's money is split across more than one order. */
export function isShared(inv: InvoiceLike): boolean {
  return ordersOnInvoice(inv).length > 1
}

// ── What is left to invoice on an order ─────────────────────────────────────

export interface OrderLineLike {
  id: string
  item: string
  /** Ordered quantity. */
  qty: number
  /** Shipped so far. */
  shippedQty: number
  /** The customer's rate, in the order's currency. */
  sellRate: number
}

export interface BillableLine {
  orderLineId: string
  item: string
  /** What to put on the invoice: shipped, less whatever is already invoiced. */
  qty: number
  rate: number
  amount: number
  /** Already invoiced on this line, in pieces. */
  invoicedQty: number
  /** Shipped but not yet invoiced — the reason this line is here. */
  shippedQty: number
}

/**
 * The lines a new invoice should open with.
 *
 * SHIPPED, LESS WHAT IS ALREADY INVOICED. An order shipped in two lots gets
 * invoiced in two goes, and the second invoice must not re-bill the first
 * lot. A line with nothing left to bill is left out rather than offered at
 * zero, because a zero line is something somebody has to delete.
 *
 * `invoicedQtyByLine` is the pieces already invoiced against each ORDER line,
 * which is what the order_line tag on an invoice line gives us.
 */
export function billableLines(
  orderLines: readonly OrderLineLike[],
  invoicedQtyByLine: Readonly<Record<string, number>> = {},
): BillableLine[] {
  const out: BillableLine[] = []
  for (const l of orderLines) {
    const shipped = Math.max(0, num(l.shippedQty))
    const already = Math.max(0, num(invoicedQtyByLine[l.id]))
    const qty = r2(Math.max(0, shipped - already))
    if (qty <= 0) continue
    const rate = num(l.sellRate)
    out.push({
      orderLineId: l.id,
      item: l.item,
      qty,
      rate,
      amount: r2(qty * rate),
      invoicedQty: already,
      shippedQty: shipped,
    })
  }
  return out
}

/** Pieces already invoiced per order line, read off the invoice lines. */
export function invoicedQtyByLine(invoices: readonly InvoiceLike[]): Record<string, number> {
  const by: Record<string, number> = {}
  for (const inv of invoices) {
    for (const l of inv.lines) {
      if (!l.orderLineId) continue
      by[l.orderLineId] = num(by[l.orderLineId]) + num(l.qty)
    }
  }
  return by
}

/**
 * Nothing left to bill, and why — so the invoice screen can say it rather
 * than opening empty.
 */
export function nothingBillableWords(orderLines: readonly OrderLineLike[], invoiced: Readonly<Record<string, number>>): string | null {
  if (orderLines.length === 0) return 'This order has no lines on it yet.'
  const shipped = orderLines.reduce((t, l) => t + Math.max(0, num(l.shippedQty)), 0)
  if (shipped === 0) return 'Nothing has shipped on this order yet, so there is nothing to invoice. Enter the shipped quantities first, or add the lines by hand.'
  if (billableLines(orderLines, invoiced).length === 0) return 'Everything that has shipped on this order is already invoiced.'
  return null
}
