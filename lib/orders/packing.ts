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

export interface PackReconcile {
  perPiece: PieceDiff[]
  orderedTotal: number
  packedTotal: number
  cartons: number
  balanced: boolean
  short: PieceDiff[]
  over: PieceDiff[]
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

  return {
    perPiece,
    orderedTotal: perPiece.reduce((t, d) => t + d.ordered, 0),
    packedTotal: perPiece.reduce((t, d) => t + d.packed, 0),
    cartons: totalCartons(packs),
    balanced: perPiece.length > 0 && short.length === 0 && over.length === 0,
    short,
    over,
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

// ── What the supplier reads ─────────────────────────────────────────────────

export type StyleName = (lineId: string) => string

/** "Polo navy / M" — one content line, said plainly. */
function contentWords(c: PackContent, styleName: StyleName, withStyle: boolean): string {
  const style = withStyle ? styleName(c.lineId) : ''
  const size = c.size ? ` ${c.size}` : ''
  const label = `${style}${style && size ? ' /' : ''}${size}`.trim()
  return c.qty > 1 ? `${c.qty} × ${label}` : label
}

/**
 * One pack, in a sentence a packer can follow.
 *
 * The style name is repeated on every content line ONLY when the carton
 * mixes styles — on a single-style carton it would be said four times for
 * no reason, and the thing that matters, the sizes, would be buried.
 */
export function describePack(pack: Pack, styleName: StyleName): string {
  const contents = cleanContents(pack.contents)
  if (!contents.length) return ''
  const cartons = int(pack.cartons)
  const sets = setsPerCarton(pack)
  const styles = new Set(contents.map(c => c.lineId))
  const mixed = styles.size > 1

  const inner = contents.map(c => contentWords(c, styleName, mixed)).join(' + ')
  const set = sets > 1 ? `${sets} sets of (${inner})` : (mixed || contents.length > 1 ? `(${inner})` : inner)
  const head = cartons ? `${cartons} ctn × ` : ''
  const only = !mixed ? ` — ${styleName(contents[0].lineId)}` : ''
  const per = piecesPerCarton(pack)
  return `${head}${set}${only} · ${per} pcs/ctn${cartons ? ` · ${per * cartons} pcs` : ''}`
}

export function describePacking(packs: readonly Pack[], styleName: StyleName): string {
  return packs.map(p => describePack(p, styleName)).filter(Boolean).join('\n')
}

export interface PackingTableRow {
  cartons: string
  contents: string
  perCarton: string
  pieces: string
  kind: string
}

/** The packing table on the summary sheet in the supplier pack. */
export function packingTable(packs: readonly Pack[], styleName: StyleName): PackingTableRow[] {
  return packs
    .filter(p => cleanContents(p.contents).length > 0)
    .map(p => {
      const contents = cleanContents(p.contents)
      const sets = setsPerCarton(p)
      const mixed = new Set(contents.map(c => c.lineId)).size > 1
      const inner = contents.map(c => contentWords(c, styleName, true)).join('\n')
      return {
        cartons: String(int(p.cartons)),
        contents: sets > 1 ? `${sets} sets of:\n${inner}` : inner,
        perCarton: String(piecesPerCarton(p)),
        pieces: String(packPieces(p)),
        kind: p.kind === 'solid' ? 'Solid' : mixed ? 'Assort (mixed styles)' : 'Assort',
      }
    })
}
