// Pure layout maths for the document engine. Everything the renderer does to
// decide WHERE things go lives here, with no React and no DOM — so it can be
// tested directly. <LayoutRenderer> is then a thin drawing layer over this.
//
// Three jobs:
//   1. GST guard        — both GSTINs must reach the page, whatever the template.
//   2. Auto-flow        — text grows to fit its content and pushes what's below.
//   3. Pagination       — rows are chunked to the space each page actually has.

import type { DocLayout, LayoutEl } from './layout'
import type { LayoutContext } from './layoutContext'

/** Row metrics. The renderer draws rows at EXACTLY these heights; if the two
 *  ever disagree, rows get sliced by the table's overflow. */
export const ROW_H = 30
export const HEAD_H = 26

const LINE_H = 1.35   // must match the renderer's text line-height
const CHAR_W = 0.53   // avg glyph width as a fraction of font size (Manrope)

/** Fill {{field}} tokens in static text. */
export function fillTokens(text: string, fields: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => fields[k] ?? '')
}

/**
 * Both parties' GSTINs must appear on every document — that's a legal
 * requirement, not a design choice. The current default layout carries dedicated
 * GSTIN elements, but a template designed before they existed (or one the user
 * deleted them from) would silently drop them. So: if the layout binds no
 * element to a GSTIN field, fold that GSTIN into the matching address block.
 * Exactly one of the two paths fires — the GSTIN never prints twice.
 */
export function withGstGuard(layout: DocLayout, ctx: LayoutContext): LayoutContext {
  const bound = new Set(layout.elements.map(e => e.field).filter(Boolean) as string[])
  const fields = { ...ctx.fields }
  const fold = (gstKey: string, addrKey: string) => {
    const gst = (fields[gstKey] ?? '').trim()
    if (!gst || bound.has(gstKey)) return
    const addr = (fields[addrKey] ?? '').trim()
    fields[addrKey] = addr ? `${addr}\nGSTIN: ${gst}` : `GSTIN: ${gst}`
  }
  fold('company.gstin', 'company.address')
  fold('party.gstin', 'party.address')
  return { ...ctx, fields }
}

/** The text an element will actually render. */
export function elText(el: LayoutEl, ctx: LayoutContext): string {
  if (el.type === 'field') return ctx.fields[el.field ?? ''] ?? ''
  if (el.type === 'text') return fillTokens(el.text ?? '', ctx.fields)
  return ''
}

/**
 * The height an element will actually occupy once its text wraps.
 * A designed box is a minimum, not a promise: a 4-line address in a 3-line box
 * must grow, not clip. An empty field collapses to 0 — it renders nothing, so
 * it should leave no gap behind either.
 */
export function measuredHeight(el: LayoutEl, ctx: LayoutContext): number {
  if (el.type !== 'field' && el.type !== 'text') return el.h
  const raw = elText(el, ctx)
  if (el.type === 'field' && !raw) return 0
  if (!raw) return el.h
  const fs = el.fontSize ?? 11
  const perLine = Math.max(1, Math.floor(el.w / (fs * CHAR_W)))
  const labelChars = el.label ? el.label.length + 1 : 0
  let lines = 0
  raw.split('\n').forEach((seg, i) => {
    const chars = seg.length + (i === 0 ? labelChars : 0)
    lines += Math.max(1, Math.ceil(chars / perLine))
  })
  // No fudge factor here: a stray pixel of "growth" would nudge every element
  // below it for no reason. Text overflows visibly rather than clipping, so an
  // exact line-box measure is what we want.
  return Math.max(el.h, Math.ceil(lines * fs * LINE_H))
}

export function onPage(el: LayoutEl, p: number, pages: number): boolean {
  switch (el.on ?? 'first') {
    case 'all': return true
    case 'last': return p === pages - 1
    default: return p === 0
  }
}

/**
 * How far each element moves on page `p` once the text above it has grown or
 * collapsed. Only elements sharing horizontal space are affected — a long
 * address pushes the GSTIN and the table below it, never the date on the right.
 *
 * The line-item table is a barrier: its bottom edge is fixed, so it absorbs
 * everything that grew above it by holding fewer rows. Elements below the table
 * therefore inherit none of those shifts.
 */
export function computeShifts(layout: DocLayout, ctx: LayoutContext, p: number, pages: number): Map<string, number> {
  const li = layout.elements.find(e => e.type === 'lineItems')
  const shift = new Map<string, number>()
  const grown: { x: number; w: number; bottom: number; delta: number }[] = []

  const ordered = layout.elements
    .filter(el => onPage(el, p, pages) && el.layer !== 'back' && el.layer !== 'front')
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)

  for (const el of ordered) {
    const overlapsX = (g: { x: number; w: number }) => !(el.x + el.w <= g.x || g.x + g.w <= el.x)
    let s = 0
    for (const g of grown) if (el.y >= g.bottom && overlapsX(g)) s += g.delta
    shift.set(el.id, s)

    const d = measuredHeight(el, ctx) - el.h
    if (d !== 0) grown.push({ x: el.x, w: el.w, bottom: el.y + el.h, delta: d })
    if (li && el.id === li.id) grown.length = 0   // the table absorbs what's above it
  }
  return shift
}

/** Elements that reserve space on page p — the table flows around them. */
function reservesFor(layout: DocLayout, p: number): LayoutEl[] {
  return layout.elements.filter(e => {
    if (e.layer !== 'reserve') return false
    const on = e.on ?? 'first'
    return on === 'all' || (on === 'first' && p === 0)
  })
}

/** The table's box on page p: pushed down by text that grew above it, and
 *  flowed around reserved elements. Its bottom stays put. */
export function tableBox(layout: DocLayout, p: number, shift?: Map<string, number>): { y: number; h: number } {
  const li = layout.elements.find(e => e.type === 'lineItems')
  if (!li) return { y: 0, h: 0 }
  const s = shift?.get(li.id) ?? 0
  let top = li.y + s
  let bottom = li.y + li.h
  for (const b of reservesFor(layout, p)) {
    const bTop = b.y, bBottom = b.y + b.h
    if (bBottom <= top || bTop >= bottom) continue
    if (bTop <= top) top = Math.max(top, bBottom)
    else bottom = Math.min(bottom, bTop)
  }
  return { y: top, h: Math.max(HEAD_H + ROW_H, bottom - top) }
}

/** How many rows fit in a table box of height h. */
export const rowCapacity = (h: number) => Math.max(1, Math.floor((h - HEAD_H) / ROW_H))

/**
 * Split the rows across pages, giving each page only as many rows as its own
 * table box can hold (page 1 holds fewer when a long address pushed the table
 * down). Returns one chunk per page; always at least one page.
 */
export function paginate(layout: DocLayout, ctx: LayoutContext): LayoutContext['rows'][] {
  const li = layout.elements.find(e => e.type === 'lineItems')
  if (!li) return []
  const chunks: LayoutContext['rows'][] = []
  let i = 0, p = 0
  do {
    // 'last'-page elements all sit below the table and so can't move it — a
    // provisional page count is safe while we're still counting pages.
    const box = tableBox(layout, p, computeShifts(layout, ctx, p, 9999))
    const cap = rowCapacity(box.h)
    chunks.push(ctx.rows.slice(i, i + cap))
    i += cap; p++
  } while (i < ctx.rows.length && p < 50)
  return chunks
}
