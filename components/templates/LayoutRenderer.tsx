import React from 'react'
import { PAGE_W, PAGE_H, mmToPx, type DocLayout, type LayoutEl } from '@/lib/documents/layout'
import type { LayoutContext } from '@/lib/documents/layoutContext'
// All the positioning maths lives in lib/documents/flow.ts — pure, and tested.
import {
  ROW_H, HEAD_H, fillTokens, withGstGuard, measuredHeight, computeShifts, tableBox, paginate,
} from '@/lib/documents/flow'

const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

function resolveColor(c: string | undefined, accent: string): string {
  if (!c) return '#111'
  return c === 'accent' ? accent : c
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
  // Both GSTINs must reach the page even if the template doesn't bind them.
  const ctx = withGstGuard(layout, rawCtx)

  const li = layout.elements.find(e => e.type === 'lineItems')
  const chunks = paginate(layout, ctx)
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
        const shift = computeShifts(layout, ctx, p, pages)
        const box = tableBox(layout, p, shift)
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
