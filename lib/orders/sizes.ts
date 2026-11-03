// Size-wise quantities under one line.
//
// A garment line is never one number. It is S 200, M 400, L 400, XL 200 — and
// the supplier cannot make the order without that breakdown.
//
// THE RULE: when a line has sizes, the sizes ARE the quantity. The line total
// is their sum and is not typed. Two places to type the same number is two
// places for them to disagree, and the one that reaches the supplier would be
// whichever the document happened to read.
//
// Pure. The sum that goes on a purchase order is not a thing to find out is
// wrong after the goods are cut.

export interface SizeRow {
  label: string
  qty: number
  /** Part shipments, size by size. Optional — most lines never set it. */
  shippedQty?: number
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Drop blanks, add up repeats, keep the order they were entered in. */
export function normaliseSizes(sizes: readonly SizeRow[]): SizeRow[] {
  const out: SizeRow[] = []
  const at = new Map<string, number>()
  for (const s of sizes) {
    const label = (s.label ?? '').trim()
    if (!label) continue
    const key = label.toUpperCase()
    const qty = Math.max(0, num(s.qty))
    const shipped = Math.max(0, num(s.shippedQty))
    const i = at.get(key)
    if (i === undefined) {
      at.set(key, out.length)
      out.push({ label, qty, shippedQty: shipped })
    } else {
      out[i].qty += qty
      out[i].shippedQty = (out[i].shippedQty ?? 0) + shipped
    }
  }
  return out
}

export function sizeTotal(sizes: readonly SizeRow[]): number {
  return normaliseSizes(sizes).reduce((t, s) => t + s.qty, 0)
}

export function sizeShippedTotal(sizes: readonly SizeRow[]): number {
  return normaliseSizes(sizes).reduce((t, s) => t + Math.min(s.shippedQty ?? 0, s.qty), 0)
}

export function hasSizes(sizes: readonly SizeRow[] | null | undefined): boolean {
  return !!sizes && normaliseSizes(sizes).length > 0
}

/**
 * The quantity for a line. Sizes win whenever there are any — that is the
 * whole rule, in one place, so every screen and every document agrees.
 */
export function lineQty(typedQty: number, sizes: readonly SizeRow[] | null | undefined): number {
  return hasSizes(sizes) ? sizeTotal(sizes!) : Math.max(0, num(typedQty))
}

/**
 * How much of a line has gone out.
 *
 * Unlike the quantity, sizes do NOT automatically win here. Shipping is
 * recorded on the line today; size-by-size despatch is recorded only when
 * somebody actually fills it in. If sizes always won, a line with a size
 * breakdown would report nothing shipped however many times it had been —
 * so the sizes take over the moment they carry a figure, and not before.
 */
export function lineShipped(typedShipped: number, sizes: readonly SizeRow[] | null | undefined): number {
  const fromSizes = hasSizes(sizes) ? sizeShippedTotal(sizes!) : 0
  return fromSizes > 0 ? fromSizes : Math.max(0, num(typedShipped))
}

/** "S 200 / M 400 / L 400" — what goes on the purchase order line. */
export function formatSizes(sizes: readonly SizeRow[], sep = ' / '): string {
  return normaliseSizes(sizes).filter(s => s.qty > 0).map(s => `${s.label} ${s.qty.toLocaleString('en-IN')}`).join(sep)
}

/**
 * Quick entry. Typing "S 200, M 400, L 400" beats clicking Add four times,
 * and it is how a size breakdown arrives in a WhatsApp message anyway.
 *
 * Accepts commas, slashes, semicolons or newlines between pairs, and a space,
 * colon, dash or '=' between a label and its quantity. A label with no number
 * is kept at zero rather than thrown away, so a typo is visible on screen
 * instead of silently vanishing.
 */
export function parseSizes(text: string): SizeRow[] {
  const chunks = String(text ?? '').split(/[,;/\n]+/)
  const out: SizeRow[] = []
  for (const chunk of chunks) {
    const c = chunk.trim()
    if (!c) continue
    const m = /^(.*?)[\s:=-]*(-?\d+(?:\.\d+)?)\s*$/.exec(c)
    if (m && m[1].trim()) out.push({ label: m[1].trim(), qty: Math.max(0, parseFloat(m[2]) || 0) })
    else out.push({ label: c, qty: 0 })
  }
  return normaliseSizes(out)
}

/**
 * Something worth saying on screen before the order goes out. Not an error —
 * a half-typed breakdown is a normal thing to be looking at — but the
 * supplier must not be sent a line whose sizes say one thing and whose total
 * says another.
 */
export function sizeWarning(typedQty: number, sizes: readonly SizeRow[] | null | undefined): string | null {
  if (!hasSizes(sizes)) return null
  const rows = normaliseSizes(sizes!)
  const blank = rows.filter(s => s.qty <= 0).map(s => s.label)
  if (blank.length) return `No quantity against ${blank.join(', ')}.`
  return null
}
