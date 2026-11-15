// How the pieces go into cartons.
//
// A garment order is sizes; a shipment is cartons. "400 pieces" does not tell
// a supplier what to put in a box, so the purchase order has to carry the
// packing — and it has to be followable by somebody on a packing floor who
// was not in the conversation.
//
// THE SHAPE, AND WHY IT IS THIS SHAPE
//
// A pack is: a SET of contents, how many sets go in one CARTON, and how many
// cartons. Each content line is a style, a size, and how many pieces of it
// are in one set.
//
//   Solid            one content line.   20 × M of one style, 5 cartons.
//   Assorted         several sizes.      S1 M2 L2 XL1 of one style.
//   Two sets a box   setsPerCarton = 2.  Two of that assortment per carton.
//   Mixed styles     content lines on    one M of the polo and one M of the
//                    different styles.   tee, together in one carton.
//
// Those are not four features. They are one calculation seen four ways, and
// writing them separately would be four chances to get a carton count wrong.
//
// A PACK BELONGS TO THE ORDER, NOT TO A LINE. It used to hang off a single
// order line, which cannot express a carton holding two styles — and that is
// a real thing people ship. So contents point at lines instead.
//
// Pure. A carton count nobody can test is a carton count nobody should ship
// against.

export type PackKind = 'solid' | 'assort'

export interface PackContent {
  /** The order line — the style. */
  lineId: string
  /** Size label. Empty for a line with no size breakdown. */
  size: string
  /** Pieces of this style and size in ONE set. */
  qty: number
}

export interface Pack {
  kind: PackKind
  contents: PackContent[]
  /** How many of the set go in one carton. Almost always 1. */
  setsPerCarton: number
  cartons: number
  note?: string | null
}

/** How a style+size pair is counted. */
export const packKey = (lineId: string, size: string): string => `${lineId}|${size}`
export const splitKey = (key: string): { lineId: string; size: string } => {
  const i = key.indexOf('|')
  return i < 0 ? { lineId: key, size: '' } : { lineId: key.slice(0, i), size: key.slice(i + 1) }
}

const int = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Contents with the rubbish taken out, duplicates merged, order kept. */
export function cleanContents(contents: readonly PackContent[] | null | undefined): PackContent[] {
  const out: PackContent[] = []
  const at = new Map<string, number>()
  for (const c of contents ?? []) {
    const lineId = String(c?.lineId ?? '').trim()
    const size = String(c?.size ?? '').trim()
    const qty = int(c?.qty)
    if (!lineId || !qty) continue
    const k = packKey(lineId, size)
    const i = at.get(k)
    if (i === undefined) { at.set(k, out.length); out.push({ lineId, size, qty }) }
    else out[i].qty += qty
  }
  return out
}

/** How many sets go in one carton — never less than one. */
export const setsPerCarton = (pack: Pack): number => Math.max(1, int(pack.setsPerCarton) || 1)

export function piecesPerSet(pack: Pack): number {
  return cleanContents(pack.contents).reduce((t, c) => t + c.qty, 0)
}

export function piecesPerCarton(pack: Pack): number {
  return piecesPerSet(pack) * setsPerCarton(pack)
}

export function packPieces(pack: Pack): number {
  return piecesPerCarton(pack) * int(pack.cartons)
}

export function totalCartons(packs: readonly Pack[]): number {
  return packs.reduce((t, p) => t + int(p.cartons), 0)
}

export function totalPieces(packs: readonly Pack[]): number {
  return packs.reduce((t, p) => t + packPieces(p), 0)
}

/** Everything one pack accounts for, by style and size. */
export function packByKey(pack: Pack): Record<string, number> {
  const cartons = int(pack.cartons)
  const out: Record<string, number> = {}
  if (!cartons) return out
  const per = setsPerCarton(pack)
  for (const c of cleanContents(pack.contents)) {
    out[packKey(c.lineId, c.size)] = (out[packKey(c.lineId, c.size)] ?? 0) + c.qty * per * cartons
  }
  return out
}

export function packedByKey(packs: readonly Pack[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of packs) {
    for (const [k, n] of Object.entries(packByKey(p))) out[k] = (out[k] ?? 0) + n
  }
  return out
}

/** A pack that cannot be packed as written. */
export function packProblem(pack: Pack, knownLineIds?: ReadonlySet<string>): string | null {
  const contents = cleanContents(pack.contents)
  if (!contents.length) return 'Nothing in this carton yet'
  // The one rule that separates the two kinds, and why `kind` is stored at
  // all: the word goes on the document, and a "solid" carton holding two
  // things is not solid — whoever packs it would get it wrong.
  if (pack.kind === 'solid' && contents.length > 1) return 'A solid carton holds one style and one size'
  if (int(pack.cartons) <= 0) return 'No carton count'
  if (knownLineIds) {
    const stray = contents.find(c => !knownLineIds.has(c.lineId))
    if (stray) return 'Refers to a style that is no longer on this order'
  }
  return null
}

// ── Does the packing add up to the order? ───────────────────────────────────

export interface OrderedPiece {
  lineId: string
  size: string
  qty: number
}

export interface PieceDiff {
  lineId: string
  size: string
  ordered: number
  packed: number
  /** Positive means still to pack, negative means more packed than ordered. */
  difference: number
}

/**
 * HOW MUCH OVER IS ALLOWED IS NEGOTIATED, NOT A RULE.
 *
 * A supplier may be permitted to ship a few per cent extra, and on another
 * order none at all. So the figure lives on the order, is passed in here,
 * and defaults to zero — because an allowance nobody agreed is an allowance
 * that does not exist, and defaulting to a number somebody once mentioned
 * would quietly excuse an overshipment on an order that never allowed one.
 */
export interface PackReconcile {
  perPiece: PieceDiff[]
  orderedTotal: number
  packedTotal: number
  cartons: number
  balanced: boolean
  short: PieceDiff[]
  /** Everything packed beyond what was ordered. */
  over: PieceDiff[]
  /** Over, but inside the tolerance agreed on this order. */
  overWithinTolerance: PieceDiff[]
  /** Over by more than this order allows. */
  overBeyondTolerance: PieceDiff[]
  /** What was agreed on this order. 0 means none was. */
  tolerancePct: number
  problems: string[]
}

/**
 * Reported per style AND per size, never on the total. Totals hide the
 * mistake that actually happens: twenty too many smalls and twenty too few
 * larges comes to exactly the right number of pieces and the wrong shipment.
 */
export function reconcilePacking(
  ordered: readonly OrderedPiece[],
  packs: readonly Pack[],
  tolerancePct = 0,
): PackReconcile {
  const packed = packedByKey(packs)
  const orderedByKey = new Map<string, OrderedPiece>()
  const keys: string[] = []
  for (const o of ordered) {
    const k = packKey(o.lineId, o.size)
    if (!orderedByKey.has(k)) keys.push(k)
    const prev = orderedByKey.get(k)
    orderedByKey.set(k, { ...o, qty: (prev?.qty ?? 0) + Math.max(0, Math.floor(Number(o.qty) || 0)) })
  }
  for (const k of Object.keys(packed)) if (!keys.includes(k)) keys.push(k)

  const perPiece: PieceDiff[] = keys.map(k => {
    const { lineId, size } = splitKey(k)
    const o = orderedByKey.get(k)?.qty ?? 0
    const p = packed[k] ?? 0
    return { lineId, size, ordered: o, packed: p, difference: o - p }
  })

  const knownLineIds = new Set(ordered.map(o => o.lineId))
  const problems: string[] = []
  packs.forEach((p, i) => {
    const bad = packProblem(p, knownLineIds)
    if (bad) problems.push(`Pack ${i + 1}: ${bad}`)
  })

  const short = perPiece.filter(d => d.difference > 0)
  const over = perPiece.filter(d => d.difference < 0)
  // A size never ordered has no tolerance to be inside of: anything packed
  // against it is beyond, whatever the percentage says. And with no
  // tolerance agreed, one piece over is over.
  const pct = Math.max(0, Number(tolerancePct) || 0)
  const allowed = (d: PieceDiff) => d.ordered > 0 ? Math.floor(d.ordered * (1 + pct / 100)) : 0

  return {
    perPiece,
    orderedTotal: perPiece.reduce((t, d) => t + d.ordered, 0),
    packedTotal: perPiece.reduce((t, d) => t + d.packed, 0),
    cartons: totalCartons(packs),
    balanced: perPiece.length > 0 && short.length === 0 && over.length === 0,
    short,
    over,
    overWithinTolerance: over.filter(d => d.packed <= allowed(d)),
    overBeyondTolerance: over.filter(d => d.packed > allowed(d)),
    tolerancePct: pct,
    problems,
  }
}

/** What is left to pack, by style and size. */
export function remainingByKey(
  ordered: readonly OrderedPiece[], packs: readonly Pack[],
): Record<string, number> {
  const packed = packedByKey(packs)
  const out: Record<string, number> = {}
  for (const o of ordered) {
    const k = packKey(o.lineId, o.size)
    out[k] = Math.max(0, (out[k] ?? Math.max(0, Math.floor(Number(o.qty) || 0))) - 0)
  }
  for (const k of Object.keys(out)) out[k] = Math.max(0, out[k] - (packed[k] ?? 0))
  return out
}

/**
 * The most cartons of this pack that still fit in what is left.
 *
 * Limited by the TIGHTEST content line: a ratio of S1 M2 L2 XL1 against 100
 * of each makes fifty cartons, not a hundred, because the twos run out
 * first. Behind the "fill the rest" button, so nobody works it out by hand.
 */
export function suggestCartons(pack: Pack, remaining: Record<string, number>): number {
  const contents = cleanContents(pack.contents)
  if (!contents.length) return 0
  const per = setsPerCarton(pack)
  let best = Infinity
  for (const c of contents) {
    const left = Math.max(0, Math.floor(Number(remaining[packKey(c.lineId, c.size)]) || 0))
    best = Math.min(best, Math.floor(left / (c.qty * per)))
  }
  return Number.isFinite(best) ? Math.max(0, best) : 0
}

/**
 * The cartons of THIS pack that fit in what is left.
 *
 * A SUGGESTION, not a limit. A supplier may ship a few per cent over when
 * it has been agreed, so the carton box is not capped — typing more than
 * this is allowed and gets a warning instead. What is not allowed is doing
 * it without noticing.
 *
 * `otherPacks` is every pack EXCEPT this one, so editing a pack is measured
 * against what the rest of the packing has claimed and not against its own
 * contribution.
 */
export function maxCartons(
  pack: Pack,
  ordered: readonly OrderedPiece[],
  otherPacks: readonly Pack[],
): number {
  return suggestCartons(pack, remainingByKey(ordered, otherPacks))
}

// ── What the supplier reads ─────────────────────────────────────────────────

export type StyleName = (lineId: string) => string

/** "S-1, M-2, L-2, XL-1", or "12 pcs" for a style with no size breakdown. */
function sizeWords(contents: readonly PackContent[]): string {
  return contents
    .map(c => (c.size ? `${c.size}-${c.qty}` : `${c.qty} pcs`))
    .join(', ')
}

/**
 * One row per pack, laid out as a table without rules.
 *
 *   Box 1   20 boxes   S-1, M-2, L-2, XL-1
 *   Box 2   10 boxes   S-20
 *   Box 3   20 boxes   S-1, M-2, L-2, XL-1   (Polo navy)
 *                      S-1, M-2, L-2, XL-1   (Crew tee)
 *
 * A carton that mixes styles gets one line PER STYLE rather than one long
 * run of sizes: the packer is filling the box style by style, and
 * "S-1, M-2, S-1, M-2" with the styles buried in it is how the wrong
 * garment ends up in the box.
 *
 * The style is named only when the packing involves more than one. On a
 * single-style order it would be repeated on every row and bury the sizes,
 * which are the thing being read.
 */
export interface PackingRow {
  /** "Box 1". The packer's name for this instruction, not a carton serial. */
  label: string
  /** "20 boxes". */
  boxes: string
  /** One per style in the carton. */
  lines: { contents: string; style: string }[]
  /** Said once at the end of the row, so nobody multiplies by hand. */
  note: string
}

export function packingRows(packs: readonly Pack[], styleName: StyleName): PackingRow[] {
  const usable = packs.filter(p => cleanContents(p.contents).length > 0)
  const everyStyle = new Set<string>()
  for (const p of usable) for (const c of cleanContents(p.contents)) everyStyle.add(c.lineId)
  const showStyle = everyStyle.size > 1

  return usable.map((p, i) => {
    const contents = cleanContents(p.contents)
    const cartons = int(p.cartons)
    const sets = setsPerCarton(p)

    // Group by style, keeping the order the contents were entered in.
    const order: string[] = []
    const byStyle = new Map<string, PackContent[]>()
    for (const c of contents) {
      if (!byStyle.has(c.lineId)) { byStyle.set(c.lineId, []); order.push(c.lineId) }
      byStyle.get(c.lineId)!.push(c)
    }

    const lines = order.map(lineId => ({
      contents: (sets > 1 ? `${sets} sets of ` : '') + sizeWords(byStyle.get(lineId)!),
      style: showStyle ? `(${styleName(lineId)})` : '',
    }))

    const per = piecesPerCarton(p)
    return {
      label: `Box ${i + 1}`,
      boxes: `${cartons} box${cartons === 1 ? '' : 'es'}`,
      lines,
      note: `${per} pcs/box${cartons ? ` · ${per * cartons} pcs` : ''}`,
    }
  })
}

/** The same rows as plain text, for anywhere that cannot lay out columns. */
export function describePacking(packs: readonly Pack[], styleName: StyleName): string {
  return packingRows(packs, styleName)
    .map(r => {
      const head = `${r.label} - ${r.boxes}, `
      const pad = ' '.repeat(head.length)
      return r.lines
        .map((l, i) => `${i === 0 ? head : pad}${l.contents}${l.style ? ` ${l.style}` : ''}`)
        .join('\n')
    })
    .join('\n')
}

/** One pack on one line — for a list on screen where height is scarce. */
export function describePack(pack: Pack, styleName: StyleName): string {
  const rows = packingRows([pack], styleName)
  if (!rows.length) return ''
  const r = rows[0]
  const body = r.lines.map(l => `${l.contents}${l.style ? ` ${l.style}` : ''}`).join(' + ')
  return `${r.boxes}, ${body} · ${r.note}`
}
