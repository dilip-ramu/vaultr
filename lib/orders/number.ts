// Our own number for an order.
//
// The customer's PO number is the real identity of the job, but it cannot be
// the key: two customers can send the same number, some send none at all, and
// some send one that is unusable as a reference ("WhatsApp 12/3"). So every
// order also gets a short number of ours, and the customer's sits beside it.
//
// Shape: ORD-26-0001. Per calendar year, so the running number stays short and
// you can tell at a glance how old an order is.

export const ORDER_PREFIX = 'ORD'

export function orderNumberHead(year: number): string {
  return `${ORDER_PREFIX}-${String(year).slice(-2)}-`
}

/**
 * The next free number for a year, given the ones already used.
 *
 * Takes the HIGHEST used and adds one rather than counting how many exist: a
 * deleted order must not hand its number to the next one, or two pieces of
 * paper end up quoting the same reference.
 */
export function nextOrderNumber(existing: readonly string[], year: number = new Date().getFullYear()): string {
  const head = orderNumberHead(year)
  const used = existing
    .filter(n => typeof n === 'string' && n.startsWith(head))
    .map(n => parseInt(n.slice(head.length), 10))
    .filter(n => Number.isFinite(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${head}${String(next).padStart(4, '0')}`
}
