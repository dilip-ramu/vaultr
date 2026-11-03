// Turning an order's lines into a document's lines.
//
// A sales order and a purchase order are the same styles seen from two sides:
// the customer is quoted the sell rate in the order's currency, the supplier
// is given the cost rate in rupees. Everything else — the spec, the size
// breakdown — has to reach both of them, and a document line has only one
// text field to put it in.
//
// So it is joined with ' · ' rather than newlines. A newline is invisible in
// the single-line input on the document form, and somebody editing a line
// there would have no idea the size breakdown was sitting in it.

import { formatSizes, lineQty, type SizeRow } from './sizes'

export interface OrderLineLike {
  item: string
  description?: string | null
  qty: number
  sellRate: number
  costRate: number
  hsn?: string | null
  sizes?: readonly SizeRow[]
}

export interface DocLineDraft {
  item: string
  hsn: string
  qty: string
  rate: string
  gst: string
}

/** Style, spec and size breakdown as one readable line. */
export function docLineText(l: Pick<OrderLineLike, 'item' | 'description' | 'sizes'>): string {
  const parts = [l.item?.trim()]
  const spec = l.description?.trim()
  if (spec) parts.push(spec.replace(/\s*\n+\s*/g, ' · '))
  const sizes = formatSizes(l.sizes ?? [])
  if (sizes) parts.push(sizes)
  return parts.filter(Boolean).join(' · ')
}

/**
 * `side` decides which rate and which currency the lines are in:
 *  - 'sell' → the customer's rate, in the order's currency (sales order).
 *  - 'cost' → the agreed supplier rate, in rupees (purchase order).
 */
export function orderDocLines(
  lines: readonly OrderLineLike[],
  side: 'sell' | 'cost',
  defaultGst = '18',
): DocLineDraft[] {
  return lines.map(l => ({
    item: docLineText(l),
    hsn: (l.hsn ?? '').trim(),
    qty: String(lineQty(l.qty, l.sizes)),
    rate: String(side === 'sell' ? (l.sellRate ?? 0) : (l.costRate ?? 0)),
    gst: defaultGst,
  }))
}
