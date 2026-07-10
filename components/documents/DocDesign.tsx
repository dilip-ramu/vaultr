import React from 'react'
import { type DocModel } from '@/lib/documents/model'

/**
 * The single downloadable-document design (the "31" design). Renders any
 * document from a normalized DocModel: full-width accent top strip, a Zoho-style
 * status band top-left, a stacked logo + company block, an accent doc title,
 * a party grid, an accent-tinted line table, optional tax summary, a big accent
 * total, and a bank + terms / signature footer.
 *
 * Wrapped in `.vinv > .sheet` so the existing HTML→PDF download (findDocSheet)
 * captures it unchanged.
 */
export default function DocDesign({ model, preview = false }: { model: DocModel; preview?: boolean }) {
  const acc = model.accent || '#1F5C3A'
  const cols = model.columns
  const gridCols = cols.map(c => `${c.flex ?? 1}fr`).join(' ')

  const sheetStyle: React.CSSProperties = {
    position: 'relative',
    background: '#fff',
    color: '#1a1a1a',
    fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
    width: preview ? '100%' : '210mm',
    minHeight: preview ? 'auto' : '297mm',
    margin: preview ? 0 : '0 auto',
    boxShadow: preview ? 'none' : '0 12px 40px rgba(0,0,0,.16)',
    borderRadius: preview ? '10px' : 0,
    overflow: 'hidden',
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  }

  const LBL: React.CSSProperties = { fontSize: '8px', fontWeight: 800, letterSpacing: '.08em', color: '#aaa', marginBottom: '4px' }
  const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

  return (
    <div className="vinv" style={{ background: preview ? 'transparent' : '#e5e7eb', padding: preview ? 0 : '28px 0', display: 'flex', justifyContent: 'center' }}>
      <div className="sheet" style={sheetStyle}>
        {/* accent top strip */}
        <div style={{ height: '6px', background: acc }} />

        <div style={{ padding: '30px 34px 26px', display: 'flex', flexDirection: 'column', minHeight: preview ? 'auto' : 'calc(297mm - 6px)' }}>
          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px' }}>
            <div style={{ maxWidth: '58%' }}>
              {model.logoUrl
                ? <img src={model.logoUrl} alt="" style={{ width: '5.5cm', maxHeight: '2.8cm', height: 'auto', objectFit: 'contain', objectPosition: 'left center', display: 'block', marginBottom: '10px' }} />
                : null}
              <p style={{ fontSize: '15px', fontWeight: 800, color: '#111', margin: 0 }}>{model.companyName}</p>
              {model.companyLines?.length ? (
                <p style={{ fontSize: '9.5px', color: '#888', lineHeight: 1.5, marginTop: '2px' }}>
                  {model.companyLines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>)}
                </p>
              ) : null}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: '19px', fontWeight: 800, color: acc, letterSpacing: '-.01em', margin: 0 }}>{model.title}</p>
              <p style={{ fontSize: '10px', color: '#666', marginTop: '3px', ...num }}>{model.number}</p>
              {model.subNote && <p style={{ fontSize: '9px', color: '#999', marginTop: '6px' }}>{model.subNote}</p>}
            </div>
          </div>

          {/* party grid */}
          {model.parties.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${model.parties.length}, 1fr)`, border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
              {model.parties.map((p, i) => (
                <div key={i} style={{ padding: '11px 14px', borderRight: i < model.parties.length - 1 ? '1px solid #eee' : 'none' }}>
                  <p style={LBL}>{p.label}</p>
                  <p style={{ fontSize: '11.5px', fontWeight: 700, color: '#222', margin: 0 }}>{p.name}</p>
                  {p.lines?.length ? (
                    <p style={{ fontSize: '9.5px', color: '#888', lineHeight: 1.5, marginTop: '2px', ...num }}>
                      {p.lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{l}</React.Fragment>)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* meta chips */}
          {model.meta?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '14px', fontSize: '9.5px', color: '#666' }}>
              {model.meta.map((m, i) => (
                <span key={i}>{m.label}: <b style={{ color: '#222', ...num }}>{m.value}</b></span>
              ))}
            </div>
          ) : null}

          {/* line items */}
          <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, background: `color-mix(in srgb, ${acc} 8%, #fff)`, padding: '8px 12px', fontSize: '8px', fontWeight: 800, letterSpacing: '.04em', color: acc }}>
              {cols.map(c => <span key={c.key} style={{ textAlign: c.align ?? 'left' }}>{c.label}</span>)}
            </div>
            {model.rows.map((r, ri) => (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '9px 12px', fontSize: '9.5px', color: r.danger ? '#c0392b' : (r.strong ? '#111' : '#333'), fontWeight: r.strong ? 700 : 400, borderTop: '1px solid #f2f2f2', background: r.strong ? '#fafafa' : 'transparent' }}>
                {cols.map(c => <span key={c.key} style={{ textAlign: c.align ?? 'left', ...(c.align === 'right' || c.align === 'center' ? num : {}) }}>{r.cells[c.key] ?? ''}</span>)}
              </div>
            ))}
          </div>

          {/* summary + totals */}
          {(model.taxSummary || model.totals || model.grandValue) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                {model.taxSummary && (
                  <>
                    <p style={LBL}>{model.taxSummary.title ?? 'TAX SUMMARY'}</p>
                    <div style={{ border: '1px solid #eee', borderRadius: '7px', overflow: 'hidden', maxWidth: '260px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${model.taxSummary.columns.length}, 1fr)`, background: '#fafafa', padding: '5px 9px', fontSize: '7.5px', fontWeight: 700, color: '#999' }}>
                        {model.taxSummary.columns.map((c, i) => <span key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>)}
                      </div>
                      {model.taxSummary.rows.map((row, ri) => (
                        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, 1fr)`, padding: '6px 9px', fontSize: '9px', color: '#333', ...num }}>
                          {row.map((cell, ci) => <span key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right' }}>{cell}</span>)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {model.inWords && <p style={{ fontSize: '8.5px', color: '#999', marginTop: '8px', lineHeight: 1.5, maxWidth: '300px' }}><b>In words:</b> {model.inWords}</p>}
              </div>
              <div style={{ width: '210px', flexShrink: 0 }}>
                {model.totals?.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '10px', color: '#666', borderBottom: i === (model.totals!.length - 1) ? '1px solid #eee' : 'none', paddingBottom: i === (model.totals!.length - 1) ? '9px' : '4px' }}>
                    <span>{t.label}</span><span style={num}>{t.value}</span>
                  </div>
                ))}
                {model.grandValue && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 0' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#111' }}>{model.grandLabel ?? 'TOTAL'}</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: acc, ...num }}>{model.grandValue}</span>
                  </div>
                )}
                {model.grandSub && <p style={{ textAlign: 'right', fontSize: '9px', color: '#999', marginTop: '2px', ...num }}>{model.grandSub}</p>}
              </div>
            </div>
          )}

          {/* footer: bank + terms (left), signature (right) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '20px', marginTop: 'auto', paddingTop: '18px' }}>
            <div style={{ maxWidth: '320px', borderTop: '1px solid #eee', paddingTop: '14px', width: '100%' }}>
              {model.bankLines?.length ? (
                <p style={{ fontSize: '8.5px', color: '#888', lineHeight: 1.6, margin: '0 0 6px', ...num }}>
                  {model.bankLines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>)}
                </p>
              ) : null}
              {model.terms && (
                <>
                  <p style={{ ...LBL, marginBottom: '3px' }}>TERMS &amp; CONDITIONS</p>
                  <p style={{ fontSize: '8px', color: '#999', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>{model.terms}</p>
                </>
              )}
              {model.note && <p style={{ fontSize: '8.5px', color: '#aaa', lineHeight: 1.6, marginTop: model.terms ? '6px' : 0 }}>{model.note}</p>}
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0, borderTop: '1px solid #eee', paddingTop: '14px', minWidth: '150px' }}>
              {model.signatureUrl
                ? <img src={model.signatureUrl} alt="" style={{ height: '2cm', width: 'auto', maxWidth: '5.5cm', objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
                : <div style={{ width: '130px', height: '34px', borderBottom: '1px solid #ccc', margin: '0 auto 4px' }} />}
              <p style={{ fontSize: '8.5px', color: '#888', margin: 0 }}>{model.signatureLabel ?? 'Authorised signatory'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
