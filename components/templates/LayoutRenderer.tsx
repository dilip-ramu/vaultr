import React from 'react'
import { PAGE_W, PAGE_H, type DocLayout, type LayoutEl } from '@/lib/documents/layout'
import type { LayoutContext } from '@/lib/documents/layoutContext'

const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

function resolveColor(c: string | undefined, accent: string): string {
  if (!c) return '#111'
  return c === 'accent' ? accent : c
}

/** Fill {{field}} tokens in static text. */
function fillTokens(text: string, fields: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => fields[k] ?? '')
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
    width: '100%', height: '100%',
    overflow: 'hidden',
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
      return <div style={baseText}>{el.label ? <span style={{ color: '#aaa', fontWeight: 700 }}>{el.label} </span> : null}{v}</div>
    }

    case 'logo':
      return ctx.logoUrl
        ? <img src={ctx.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left center' }} />
        : <div style={{ width: '100%', height: '100%', border: '1px dashed #cbd5e1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>LOGO</div>

    case 'signature':
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
          {ctx.signatureUrl
            ? <img src={ctx.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '70%', objectFit: 'contain' }} />
            : <div style={{ width: '80%', borderBottom: '1px solid #cbd5e1', height: '60%' }} />}
          <div style={{ fontSize: 9, color: '#888', marginTop: 4 }}>Authorised signatory</div>
        </div>
      )

    case 'lineItems': {
      const cols = el.columns?.length ? el.columns : ctx.columns
      const grid = cols.map(c => `${c.flex ?? 1}fr`).join(' ')
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, background: `color-mix(in srgb, ${ctx.accent} 8%, #fff)`, padding: '7px 10px', fontSize: 8, fontWeight: 800, letterSpacing: '.04em', color: ctx.accent }}>
            {cols.map(c => <span key={c.key} style={{ textAlign: c.align ?? 'left' }}>{c.label}</span>)}
          </div>
          {ctx.rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, padding: '7px 10px', fontSize: 9.5, color: r.danger ? '#c0392b' : (r.strong ? '#111' : '#333'), fontWeight: r.strong ? 700 : 400, borderTop: '1px solid #f2f2f2', background: r.strong ? '#fafafa' : 'transparent' }}>
              {cols.map(c => <span key={c.key} style={{ textAlign: c.align ?? 'left', ...(c.align && c.align !== 'left' ? num : {}) }}>{r.cells[c.key] ?? ''}</span>)}
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

    case 'terms':
      return (
        <div style={{ ...baseText, color: el.color ? color : '#999' }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.08em', color: '#aaa', marginBottom: 3 }}>TERMS &amp; CONDITIONS</div>
          {ctx.terms ?? ''}
        </div>
      )

    default:
      return null
  }
}

/** Full A4 sheet rendered from a layout + data. Wrapped in `.vinv > .sheet` so
 *  the existing HTML→PDF download captures it. Scale to fit for on-screen use. */
export default function LayoutRenderer({ layout, ctx, scale = 1, print = false }: { layout: DocLayout; ctx: LayoutContext; scale?: number; print?: boolean }) {
  const sheet = (
    <div className="sheet" style={{ position: 'relative', width: PAGE_W, height: PAGE_H, background: '#fff', overflow: 'hidden', fontFamily: "'Manrope', system-ui, -apple-system, sans-serif", boxShadow: print ? 'none' : '0 12px 40px rgba(0,0,0,.16)' }}>
      {layout.elements.map(el => (
        <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h }}>
          <ElementContent el={el} ctx={ctx} />
        </div>
      ))}
    </div>
  )
  if (scale === 1) return <div className="vinv" style={{ display: 'flex', justifyContent: 'center' }}>{sheet}</div>
  return (
    <div className="vinv" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{sheet}</div>
    </div>
  )
}
