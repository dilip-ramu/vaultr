'use client'

import { useState } from 'react'
import { X, Pencil, Eye } from 'lucide-react'
import LayoutEditor from './LayoutEditor'
import LayoutRenderer from './LayoutRenderer'
import { defaultLayout, type DocLayout } from '@/lib/documents/layout'
import { sampleContext, type LayoutContext } from '@/lib/documents/layoutContext'

const TITLES: Record<string, string> = {
  tax_invoice: 'TAX INVOICE', quotation: 'QUOTATION', proforma_gst: 'PROFORMA INVOICE', sales_order: 'SALES ORDER',
  delivery_challan: 'DELIVERY CHALLAN', credit_note: 'CREDIT NOTE', purchase_order: 'PURCHASE ORDER', debit_note: 'DEBIT NOTE',
  salary_slip: 'SALARY SLIP', reimbursable: 'INVOICE',
}

export interface CompanyTpl {
  id: string
  name: string
  accent: string
  logoUrl: string | null
  layout: DocLayout | null      // null → uses the built-in default
}

const CARD_SCALE = 0.36
const VIEW_SCALE = 0.82

/** Gallery of every company's template for one format. Shows the real document
 *  (not an editor); open it larger, or edit it in a popup. */
export default function TemplateDesigner({ format, companies }: { format: string; companies: CompanyTpl[] }) {
  const fallback = () => defaultLayout(format, TITLES[format] ?? 'DOCUMENT')
  const [layouts, setLayouts] = useState<Record<string, DocLayout>>(() =>
    Object.fromEntries(companies.map(c => [c.id, c.layout ?? fallback()])))
  const [custom, setCustom] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(companies.map(c => [c.id, !!c.layout])))
  const [editId, setEditId] = useState<string | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)

  const ctxFor = (c: CompanyTpl): LayoutContext => ({ ...sampleContext(format, c.accent), logoUrl: c.logoUrl })

  if (companies.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add a company first — templates are designed per company.</p>
  }

  const editing = companies.find(c => c.id === editId) ?? null
  const viewing = companies.find(c => c.id === viewId) ?? null

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {companies.map(c => (
          <div key={c.id} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.accent }} />
                <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                  style={custom[c.id]
                    ? { background: '#DCFCE7', color: '#14532D' }
                    : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {custom[c.id] ? 'Custom' : 'Default'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setViewId(c.id)} title="Open larger" className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
                  <Eye className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => setEditId(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              </div>
            </div>

            {/* Real document preview (not editable) */}
            <button onClick={() => setViewId(c.id)} className="block w-full" style={{ background: '#e5e7eb', padding: 16, cursor: 'zoom-in' }}>
              <div className="mx-auto" style={{ width: 794 * CARD_SCALE, pointerEvents: 'none' }}>
                <LayoutRenderer layout={layouts[c.id]} ctx={ctxFor(c)} scale={CARD_SCALE} />
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Larger preview popup */}
      {viewing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={e => { if (e.target === e.currentTarget) setViewId(null) }}>
          <div className="rounded-2xl overflow-hidden flex flex-col max-h-[94vh]" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <p className="font-extrabold" style={{ color: 'var(--text)' }}>{viewing.name} — {TITLES[format] ?? format}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => { setViewId(null); setEditId(viewing.id) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                <button onClick={() => setViewId(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-auto p-5" style={{ background: '#e5e7eb' }}>
              <LayoutRenderer layout={layouts[viewing.id]} ctx={ctxFor(viewing)} scale={VIEW_SCALE} />
            </div>
          </div>
        </div>
      )}

      {/* Edit popup */}
      {editing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={e => { if (e.target === e.currentTarget) setEditId(null) }}>
          <div className="rounded-2xl overflow-hidden flex flex-col max-h-[94vh] w-full max-w-6xl" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-extrabold" style={{ color: 'var(--text)' }}>Edit {(TITLES[format] ?? format).toLowerCase()} — {editing.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Drag, resize, add text boxes and fields. Saved templates print automatically.</p>
              </div>
              <button onClick={() => setEditId(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-auto p-5">
              <LayoutEditor
                key={editing.id + format}
                format={format}
                companyId={editing.id}
                initial={layouts[editing.id]}
                ctx={ctxFor(editing)}
                onSaved={(layout, isCustom) => {
                  setLayouts(prev => ({ ...prev, [editing.id]: layout }))
                  setCustom(prev => ({ ...prev, [editing.id]: isCustom }))
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
