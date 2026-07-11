import React from 'react'
import { PAGE_W, PAGE_H, mmToPx, type DocLayout, type LayoutEl } from '@/lib/documents/layout'
import type { LayoutContext } from '@/lib/documents/layoutContext'

const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

// Row metrics — the renderer and the paginator MUST agree on these exactly.
const ROW_H = 30
const HEAD_H = 26

function resolveColor(c: string | undefined, accent: string): string {
  if (!c) return '#111'
  return c === 'accent' ? accent : c
}

/** Fill {{field}} tokens in static text. */
function fillTokens(text: string, fields: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => fields[k] ?? '')
}


// ── Auto-flow ───────────────────────────────────────────────────────────────
// Text and field boxes are drawn at a designed height, but real data doesn't
// respect it: a 4-line address in a 3-line box either clips or runs under the
// element beneath it. So we measure what each text box will ACTUALLY occupy and
// push everything below it (in the same horizontal column) down by the
// difference. Empty fields collapse to nothing and pull the block up, so there
// are never dangling gaps.

const LINE_H = 1.35          // must match baseText.lineHeight
const CHAR_W = 0.53          // avg glyph width as a fraction of font size (Manrope)

/** Text an element will actually render. */
function elText(el: LayoutEl, ctx: LayoutContext): string {
  if (el.type === 'field') return ctx.fields[el.field ?? ''] ?? ''
  if (el.type === 'text') return fillTokens(el.text ?? '', ctx.fields)
  return ''
}

/** Height an element will actually occupy once its text wraps. */
export function measuredHeight(el: LayoutEl, ctx: LayoutContext): number {
  if (el.type !== 'field' && el.type !== 'text') return el.h
  const raw = elText(el, ctx)
  if (el.type === 'field' && !raw) return 0            // no value → element renders null
  if (!raw) return el.h
  const fs = el.fontSize ?? 11
  const perLine = Math.max(1, Math.floor(el.w / (fs * CHAR_W)))
  const labelChars = el.label ? el.label.length + 1 : 0
  let lines = 0
  raw.split('\n').forEach((seg, i) => {
    const chars = seg.length + (i === 0 ? labelChars : 0)
    lines += Math.max(1, Math.ceil(chars / perLine))
  })
  return Math.max(el.h, Math.ceil(lines * fs * LINE_H) + 2)
}

/** Rotation / flip transform for an element — shared by the renderer + editor. */
export function elTransform(el: LayoutEl): React.CSSProperties {
  const rot = el.rotate ?? 0
  const sx = el.flipX ? -1 : 1
  const sy = el.flipY ? -1 : 1
  if (!rot && sx === 1 && sy === 1) return {}
  return { transform: `rotate(${rot}deg) scale(${sx}, ${sy})`, transformOrigin: 'center center' }
}

/** Inner content of a single element (no positioning) — shared by the renderer
 *  and the editor so the visuals always match. */
export function ElementContent({ el, ctx }: { el: LayoutEl; ctx: LayoutContext }) {
  const color = resolveColor(el.color, ctx.accent)
  const baseText: React.CSSProperties = {
    fontSize: (el.fontSize ?? 11) + 'px',
    fontWeight: el.bold ? 800 : 400,
    textAlign: el.align ?? 'left',
    color,
    lineHeight: 1.35,
    width: '100%',
    height: el.type === 'text' || el.type === 'field' ? 'auto' : '100%',
    overflow: el.type === 'text' || el.type === 'field' ? 'visible' : 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }

  switch (el.type) {
    case 'accentBar':
      return <div style={{ width: '100%', height: '100%', background: ctx.accent }} />

    case 'divider':
      return <div style={{ width: '100%', borderTop: `1px solid ${color === '#111' ? '#e5e7eb' : color}`, marginTop: (el.h / 2) + 'px' }} />

    case 'text':
      return <div style={baseText}>{fillTokens(el.text ?? '', ctx.fields)}</div>

    case 'field': {
      const v = ctx.fields[el.field ?? ''] ?? ''
      // Don't print a dangling label when there's no value.
      if (!v) return null
      return <div style={baseText}>{el.label ? <span style={{ color: '#aaa', fontWeight: 700 }}>{el.label} </span> : null}{v}</div>
    }

    case 'image':
      return el.src
        ? <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: el.fit ?? 'contain', opacity: el.opacity ?? 1 }} />
        : <div style={{ width: '100%', height: '100%', border: '1px dashed #cbd5e1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>IMAGE</div>

    case 'logo':
      return ctx.logoUrl
        ? <img src={ctx.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left center' }} />
        : <div style={{ width: '100%', height: '100%', border: '1px dashed #cbd5e1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>LOGO</div>

    case 'signature': {
      // A fixed size set on the signatory wins (width OR height in mm, ratio
      // preserved); otherwise the signature fits the element box.
      const s = ctx.signatureSize
      const sizeStyle: React.CSSProperties = s
        ? (s.mode === 'width'
          ? { width: mmToPx(s.mm), height: 'auto' }
          : { height: mmToPx(s.mm), width: 'auto' })
        : { maxWidth: '100%', maxHeight: '70%', objectFit: 'contain' }
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
          {ctx.signatureUrl
            ? <img src={ctx.signatureUrl} alt="" style={sizeStyle} />
            : <div style={{ width: '80%', borderBottom: '1px solid #cbd5e1', height: '60%' }} />}
          <div style={{ fontSize: 9, color: '#888', marginTop: 4 }}>Authorised signatory</div>
        </div>
      )
    }

    case 'lineItems': {
      const cols = el.columns?.length ? el.columns : ctx.columns
      const grid = cols.map(c => `${c.flex ?? 1}fr`).join(' ')
      // Row and header boxes are sized EXACTLY to ROW_H / HEAD_H — the same
      // constants the paginator uses — so a row is never half-sliced by the
      // table's overflow, and every row is the same height regardless of text.
      const cell: React.CSSProperties = {
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', lineHeight: 1.25, alignSelf: 'center',
      } as React.CSSProperties
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center', height: HEAD_H, boxSizing: 'border-box', padding: '0 10px', gap: 8, background: `color-mix(in srgb, ${ctx.accent} 8%, #fff)`, fontSize: 8, fontWeight: 800, letterSpacing: '.04em', color: ctx.accent }}>
            {cols.map(c => <span key={c.key} style={{ textAlign: c.align ?? 'left' }}>{c.label}</span>)}
          </div>
          {ctx.rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center', height: ROW_H, boxSizing: 'border-box', padding: '0 10px', gap: 8, fontSize: 9.5, color: r.danger ? '#c0392b' : (r.strong ? '#111' : '#333'), fontWeight: r.strong ? 700 : 400, borderTop: '1px solid #f2f2f2', background: r.strong ? '#fafafa' : 'transparent' }}>
              {cols.map(c => <span key={c.key} style={{ ...cell, textAlign: c.align ?? 'left', ...(c.align && c.align !== 'left' ? num : {}) }}>{r.cells[c.key] ?? ''}</span>)}
            </div>
          ))}
        </div>
      )
    }

    case 'totals':
      return (
        <div style={{ width: '100%' }}>
          {ctx.totals.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 10, color: '#666' }}>
              <span>{t.label}</span><span style={num}>{t.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, marginTop: 4, borderTop: '1px solid #eee' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#111' }}>{ctx.grandLabel}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: ctx.accent, ...num }}>{ctx.grandValue}</span>
          </div>
        </div>
      )

    case 'bank':
      return (
        <div style={{ ...baseText, color: el.color ? color : '#888' }}>
          {ctx.bankLines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>)}
        </div>
      )

    case 'terms': {
      if (!ctx.terms || !ctx.terms.trim()) return null
      return (
        <div style={{ ...baseText, color: el.color ? color : '#999' }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.08em', color: '#aaa', marginBottom: 3 }}>TERMS &amp; CONDITIONS</div>
          {ctx.terms}
        </div>
      )
    }

    default:
      return null
  }
}


/**
 * Renders the document from a layout + data, paginating the line-item table
 * across as many A4 pages as needed. Elements marked `on: 'all'` repeat on every
 * page (letterheads, watermarks, headers); `'last'` (totals, signature) only on
 * the final page. All pages live inside one `.sheet` so the HTML→PDF download
 * slices them into pages cleanly.
 */
export default function LayoutRenderer({ layout, ctx: rawCtx, scale = 1, print = false }: { layout: DocLayout; ctx: LayoutContext; scale?: number; print?: boolean }) {
  // GST compliance guard. Both parties' GSTINs must appear on every document.
  // The default layout carries dedicated GSTIN elements, but a template designed
  // before those existed (or one where the user removed them) would silently drop
  // them — so if the layout binds no element to a GSTIN field, fold that GSTIN
  // into the corresponding address block. Never both: no duplication.
  const ctx: LayoutContext = (() => {
    const bound = new Set(layout.elements.map(e => e.field).filter(Boolean) as string[])
    const fields = { ...rawCtx.fields }
    const fold = (gstKey: string, addrKey: string) => {
      const gst = (fields[gstKey] ?? '').trim()
      if (!gst || bound.has(gstKey)) return
      const addr = (fields[addrKey] ?? '').trim()
      fields[addrKey] = addr ? `${addr}\nGSTIN: ${gst}` : `GSTIN: ${gst}`
    }
    fold('company.gstin', 'company.address')
    fold('party.gstin', 'party.address')
    return { ...rawCtx, fields }
  })()

  const li = layout.elements.find(e => e.type === 'lineItems')

  const onPage = (el: LayoutEl, p: number, pages: number) => {
    switch (el.on ?? 'first') {
      case 'all': return true
      case 'last': return p === pages - 1
      default: return p === 0
    }
  }

  /** How far each element moves on page p once the text above it has grown or
   *  collapsed. Only elements in the same horizontal column are affected — a
   *  long address pushes the GSTIN and the table below it, not the date on the
   *  right. Elements pinned to every page (layer 'back'/'front' letterheads and
   *  watermarks) are measured too, so headers stay aligned page to page. */
  const shiftsFor = (p: number, pages: number): Map<string, number> => {
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
      // The table's bottom edge is fixed — it soaks up any growth above it by
      // holding fewer rows — so nothing below it inherits those shifts.
      if (li && el.id === li.id) grown.length = 0
    }
    return shift
  }

  // Elements that reserve space on a given page — the table flows around them.
  const reservesFor = (p: number) => layout.elements.filter(e => {
    if (e.layer !== 'reserve') return false
    const on = e.on ?? 'first'
    return on === 'all' || (on === 'first' && p === 0)
  })

  /** The table's box on page p: pushed down by any text that grew above it,
   *  and flowed around reserved elements. Its bottom stays put, so it simply
   *  holds fewer rows on a page with a long address. */
  const liBox = (p: number, shift?: Map<string, number>) => {
    if (!li) return { y: 0, h: 0 }
    const s = shift?.get(li.id) ?? 0
    let top = li.y + s
    let bottom = li.y + li.h
    for (const b of reservesFor(p)) {
      const bTop = b.y, bBottom = b.y + b.h
      if (bBottom <= top || bTop >= bottom) continue          // no overlap
      if (bTop <= top) top = Math.max(top, bBottom)           // covers the top → push down
      else bottom = Math.min(bottom, bTop)                    // starts inside → cut short
    }
    return { y: top, h: Math.max(HEAD_H + ROW_H, bottom - top) }
  }

  // Paginate the rows, honouring each page's available table height.
  const chunks: LayoutContext['rows'][] = []
  if (li) {
    let i = 0, p = 0
    do {
      // 'last'-page elements all sit below the table, so they can't affect its
      // box — a provisional page count is safe here.
      const box = liBox(p, shiftsFor(p, 9999))
      const cap = Math.max(1, Math.floor((box.h - HEAD_H) / ROW_H))
      chunks.push(ctx.rows.slice(i, i + cap))
      i += cap; p++
    } while (i < ctx.rows.length && p < 50)
  }
  const pages = li ? Math.max(1, chunks.length) : 1

  const visible = (el: LayoutEl, p: number) => {
    if (el.type === 'lineItems') return true
    switch (el.on ?? 'first') {
      case 'all': return true
      case 'last': return p === pages - 1
      default: return p === 0
    }
  }
  const zFor = (el: LayoutEl) => el.layer === 'back' ? 0 : el.layer === 'front' ? 100 : 1

  const sheet = (
    <div className="sheet" style={{ position: 'relative', width: PAGE_W, height: PAGE_H * pages, background: '#fff', overflow: 'hidden', fontFamily: "'Manrope', system-ui, -apple-system, sans-serif", boxShadow: print ? 'none' : '0 12px 40px rgba(0,0,0,.16)' }}>
      {Array.from({ length: pages }).map((_, p) => {
        const shift = shiftsFor(p, pages)
        const box = liBox(p, shift)
        const pageRows = li ? (chunks[p] ?? []) : []
        const pageCtx: LayoutContext = li ? { ...ctx, rows: pageRows } : ctx

        // The table shrinks to the rows actually on this page, and everything
        // BELOW it follows — so the totals/signature hug the last row instead of
        // floating at a fixed spot. Elements pinned to every page never move.
        const actualH = li ? Math.min(box.h, HEAD_H + pageRows.length * ROW_H) : 0
        const designedBottom = box.y + box.h
        const actualBottom = box.y + actualH
        const followDelta = li ? actualBottom - designedBottom : 0   // ≤ 0

        return (
          <div key={p} style={{ position: 'absolute', top: p * PAGE_H, left: 0, width: PAGE_W, height: PAGE_H, overflow: 'hidden', borderTop: p > 0 && !print ? '1px dashed #e5e7eb' : 'none' }}>
            {layout.elements.filter(el => visible(el, p)).map(el => {
              const isTable = el.type === 'lineItems'
              const pinned = (el.on ?? 'first') === 'all'
              // Anything below the table that isn't pinned flows with the content.
              const follows = !isTable && !pinned && li != null && el.y >= designedBottom
              const grows = el.type === 'text' || el.type === 'field'
              const mh = grows ? measuredHeight(el, pageCtx) : el.h
              return (
                <div key={el.id} style={{
                  position: 'absolute',
                  left: el.x,
                  top: isTable
                    ? box.y
                    : el.y + (shift.get(el.id) ?? 0) + (follows ? followDelta : 0),
                  width: el.w,
                  height: isTable ? actualH : mh,
                  overflow: grows ? 'visible' : undefined,
                  zIndex: zFor(el),
                  ...elTransform(el),
                }}>
                  <ElementContent el={el} ctx={pageCtx} />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )

  if (scale === 1) return <div className="vinv" style={{ display: 'flex', justifyContent: 'center' }}>{sheet}</div>
  return (
    <div className="vinv" style={{ width: PAGE_W * scale, height: PAGE_H * pages * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{sheet}</div>
    </div>
  )
}
