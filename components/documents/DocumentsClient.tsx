'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, FileText, Printer, Pencil, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { docConfigFor, type DocSide, type DocumentRow } from '@/lib/documents/config'
import { convertTargets, statusMeta } from '@/lib/documents/links'

const BADGE: Record<string, { bg: string; fg: string }> = {
  grey: { bg: '#EEF0F2', fg: '#4B5563' }, amber: { bg: '#FEF3C7', fg: '#92400E' },
  green: { bg: '#DCFCE7', fg: '#14532D' }, blue: { bg: '#DBEAFE', fg: '#1E40AF' },
}

interface Props { side: DocSide; lockedType: string; initialDocs: DocumentRow[] }

const money = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)

/** List of one document type for a side. Creation happens on a full page
 *  (DocumentForm), not a popup. */
export default function DocumentsClient({ side, lockedType, initialDocs }: Props) {
  const cfg = docConfigFor(lockedType, side)!
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs)
  const [convertDoc, setConvertDoc] = useState<DocumentRow | null>(null)
  const newHref = `/${side === 'customer' ? 'customers' : 'suppliers'}/documents/${lockedType}/new`
  const convertHref = (targetType: string, kind: 'document' | 'invoice', id: string) =>
    kind === 'invoice' ? `/customers/invoices/new?fromDoc=${id}` : `/${side === 'customer' ? 'customers' : 'suppliers'}/documents/${targetType}/new?from=${id}`

  async function del(d: DocumentRow) {
    if (!await confirmDialog(`Delete ${cfg.label} ${d.number}?`)) return
    const sb = createClient()
    const { error } = await sb.from('documents').delete().eq('id', d.id)
    if (error) { notify(error.message, 'error'); return }
    setDocs(prev => prev.filter(x => x.id !== d.id))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{cfg.label}s</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>GST-compliant {cfg.label.toLowerCase()}s, numbered per company.</p>
        </div>
        <Link href={newHref} className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}><Plus className="w-4 h-4" /> New {cfg.label.toLowerCase()}</Link>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <FileText className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No {cfg.label.toLowerCase()}s yet</p>
          <Link href={newHref} className="text-sm mt-1 inline-block font-semibold" style={{ color: 'var(--brand)' }}>Create the first one →</Link>
        </div>
      ) : (
        <div className="rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--surface-2)' }}>
              {['Number', 'Date', cfg.partyLabel, 'Total', ''].map((h, i) => <th key={i} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide ${i >= 3 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-muted)' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>
                    <span className="inline-flex items-center gap-2">
                      {d.number}
                      {(() => { const m = statusMeta(d.status ?? 'open'); const c = BADGE[m.tone]; return <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>{m.label}</span> })()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{d.date}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{d.party_name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{money(d.total)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {convertTargets(lockedType).length > 0 && (
                        <button onClick={() => setConvertDoc(d)} className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1 text-xs font-semibold" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }} title="Convert this document into the next step">Convert<ArrowRight className="w-3.5 h-3.5" /></button>
                      )}
                      <Link href={`${newHref.replace(/\/new$/, '')}/${d.id}/edit`} className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ background: 'var(--surface-2)' }} title="Edit"><Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></Link>
                      <a href={`/documents/${d.id}/print`} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ background: 'var(--surface-2)' }} title="Print / PDF"><Printer className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></a>
                      <button onClick={() => del(d)} className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {convertDoc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) setConvertDoc(null) }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="font-extrabold" style={{ color: 'var(--text)' }}>Convert {cfg.label.toLowerCase()}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{convertDoc.number} — carries the party &amp; line items forward.</p>
            </div>
            <div className="p-3 space-y-1.5">
              {convertTargets(lockedType).map(t => (
                <Link key={t.type} href={convertHref(t.type, t.kind, convertDoc.id)} onClick={() => setConvertDoc(null)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
                  <span>{t.label}</span><ArrowRight className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                </Link>
              ))}
            </div>
            <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setConvertDoc(null)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
