'use client'

import { useMemo, useState } from 'react'
import { Plus, X, Trash2, FileText, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { configsForSide, docConfig, type DocSide, type DocumentRow } from '@/lib/documents/config'

interface Party { id: string; name: string; gstin: string | null; address: string | null; state: string | null }
interface Company { id: string; name: string }
interface Props { side: DocSide; companies: Company[]; parties: Party[]; initialDocs: DocumentRow[] }

interface Line { id: number; item: string; hsn: string; qty: string; rate: string; gst: string }
let seq = 0
const money = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)

export default function DocumentsClient({ side, companies, parties, initialDocs }: Props) {
  const configs = configsForSide(side)
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [docType, setDocType] = useState(configs[0]?.id ?? '')
  const cfg = docConfig(docType)!
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [partyId, setPartyId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [numberStr, setNumberStr] = useState('')
  const [lines, setLines] = useState<Line[]>([{ id: ++seq, item: '', hsn: '', qty: '1', rate: '', gst: '18' }])

  const nextNumber = (dt: string) => {
    const c = docConfig(dt)!
    const n = docs.filter(d => d.doc_type === dt).length + 1
    return `${c.prefix}${String(n).padStart(4, '0')}`
  }

  function openNew() {
    const dt = configs[0]?.id ?? ''
    setDocType(dt); setCompanyId(companies[0]?.id ?? ''); setPartyId('')
    setDate(new Date().toISOString().slice(0, 10)); setReference(''); setNotes('')
    setNumberStr(nextNumber(dt))
    setLines([{ id: ++seq, item: '', hsn: '', qty: '1', rate: '', gst: '18' }])
    setOpen(true)
  }

  const party = parties.find(p => p.id === partyId)
  const totals = useMemo(() => {
    let subtotal = 0, cgst = 0, sgst = 0
    for (const l of lines) {
      const amt = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0)
      subtotal += amt
      if (cfg.tax) { const g = (parseFloat(l.gst) || 0) / 2 / 100 * amt; cgst += g; sgst += g }
    }
    return { subtotal, cgst, sgst, total: subtotal + cgst + sgst }
  }, [lines, cfg.tax])

  const setLine = (id: number, patch: Partial<Line>) => setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))

  async function save() {
    if (!companyId) { notify('Pick a company', 'info'); return }
    if (!party) { notify(`Pick a ${cfg.partyLabel.toLowerCase()}`, 'info'); return }
    const valid = lines.filter(l => l.item.trim() && (parseFloat(l.qty) || 0) > 0)
    if (valid.length === 0) { notify('Add at least one line item', 'info'); return }
    setSaving(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: doc, error } = await sb.from('documents').insert({
        user_id: user.id, doc_type: docType, company_id: companyId,
        party_kind: side, party_id: party.id, party_name: party.name,
        party_address: party.address, party_gstin: party.gstin, party_state: party.state,
        number: numberStr.trim(), date, reference: reference.trim() || null, notes: notes.trim() || null,
        subtotal: totals.subtotal, cgst_amount: totals.cgst, sgst_amount: totals.sgst, total: totals.total,
      }).select('*').single()
      if (error || !doc) { notify(error?.message ?? 'Save failed', 'error'); return }
      const lineRows = valid.map((l, i) => {
        const amt = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0)
        const g = cfg.tax ? (parseFloat(l.gst) || 0) / 2 / 100 * amt : 0
        return { document_id: doc.id, user_id: user.id, line_number: i + 1, item: l.item.trim(), hsn_sac: l.hsn.trim() || null, qty: parseFloat(l.qty) || 0, rate: parseFloat(l.rate) || 0, amount: amt, gst_rate: cfg.tax ? parseFloat(l.gst) || 0 : 0, cgst_amount: g, sgst_amount: g }
      })
      await sb.from('document_lines').insert(lineRows)
      setDocs(prev => [doc as DocumentRow, ...prev])
      notify(`${cfg.label} ${numberStr} saved ✓`, 'success')
      setOpen(false)
    } finally { setSaving(false) }
  }

  async function del(d: DocumentRow) {
    if (!await confirmDialog(`Delete ${docConfig(d.doc_type)?.label ?? 'document'} ${d.number}?`)) return
    const sb = createClient()
    const { error } = await sb.from('documents').delete().eq('id', d.id)
    if (error) { notify(error.message, 'error'); return }
    setDocs(prev => prev.filter(x => x.id !== d.id))
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{side === 'customer' ? 'Customer documents' : 'Supplier documents'}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{configs.map(c => c.label).join(' · ')} — GST-compliant, per company.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}><Plus className="w-4 h-4" /> New document</button>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <FileText className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No documents yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Create a {configs.map(c => c.label.toLowerCase()).join(', ')}.</p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--surface-2)' }}>
              {['Type', 'Number', 'Date', cfg.partyLabel, 'Total', ''].map((h, i) => <th key={i} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide ${i >= 4 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-muted)' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{docConfig(d.doc_type)?.label ?? d.doc_type}</td>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{d.number}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{d.date}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{d.party_name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{money(d.total)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
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

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh]" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <p className="font-extrabold" style={{ color: 'var(--text)' }}>New {cfg.label.toLowerCase()}</p>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Document type
                  <select value={docType} onChange={e => { setDocType(e.target.value); setNumberStr(nextNumber(e.target.value)) }} className={inputCls + ' mt-1'} style={iStyle}>
                    {configs.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Number
                  <input value={numberStr} onChange={e => setNumberStr(e.target.value)} className={inputCls + ' mt-1'} style={iStyle} />
                </label>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Company (from)
                  <select value={companyId} onChange={e => setCompanyId(e.target.value)} className={inputCls + ' mt-1'} style={iStyle}>
                    <option value="">— pick —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{cfg.partyLabel}
                  <select value={partyId} onChange={e => setPartyId(e.target.value)} className={inputCls + ' mt-1'} style={iStyle}>
                    <option value="">— pick —</option>
                    {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Date
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls + ' mt-1'} style={iStyle} />
                </label>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{cfg.referenceLabel ?? 'Reference'}
                  <input value={reference} onChange={e => setReference(e.target.value)} className={inputCls + ' mt-1'} style={iStyle} />
                </label>
              </div>

              {/* line items */}
              <div>
                <div className="grid gap-2 text-[10px] font-bold uppercase tracking-wide px-1 mb-1" style={{ gridTemplateColumns: cfg.tax ? '1fr 90px 60px 90px 70px 90px 32px' : '1fr 90px 60px 90px 90px 32px', color: 'var(--text-muted)' }}>
                  <span>Item</span><span>HSN/SAC</span><span>Qty</span><span>Rate</span>{cfg.tax && <span>GST %</span>}<span className="text-right">Amount</span><span />
                </div>
                <div className="space-y-1.5">
                  {lines.map(l => {
                    const amt = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0)
                    return (
                      <div key={l.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: cfg.tax ? '1fr 90px 60px 90px 70px 90px 32px' : '1fr 90px 60px 90px 90px 32px' }}>
                        <input value={l.item} onChange={e => setLine(l.id, { item: e.target.value })} placeholder="Description" className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle} />
                        <input value={l.hsn} onChange={e => setLine(l.id, { hsn: e.target.value })} placeholder="HSN" className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle} />
                        <input value={l.qty} onChange={e => setLine(l.id, { qty: e.target.value })} inputMode="decimal" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                        <input value={l.rate} onChange={e => setLine(l.id, { rate: e.target.value })} inputMode="decimal" placeholder="0.00" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                        {cfg.tax && <input value={l.gst} onChange={e => setLine(l.id, { gst: e.target.value })} inputMode="decimal" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />}
                        <span className="text-right text-[13px] tabular-nums" style={{ color: 'var(--text)' }}>{money(amt)}</span>
                        <button onClick={() => setLines(prev => prev.length > 1 ? prev.filter(x => x.id !== l.id) : prev)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                      </div>
                    )
                  })}
                </div>
                <button onClick={() => setLines(prev => [...prev, { id: ++seq, item: '', hsn: '', qty: '1', rate: '', gst: '18' }])} className="mt-2 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}><Plus className="w-3.5 h-3.5" /> Add line</button>
              </div>

              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes / terms" rows={2} className="w-full px-3 py-2 rounded-lg border text-sm resize-none" style={iStyle} />

              <div className="flex items-center justify-end gap-6 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                <span>Subtotal <b style={{ color: 'var(--text)' }}>{money(totals.subtotal)}</b></span>
                {cfg.tax && <span>CGST <b style={{ color: 'var(--text)' }}>{money(totals.cgst)}</b></span>}
                {cfg.tax && <span>SGST <b style={{ color: 'var(--text)' }}>{money(totals.sgst)}</b></span>}
                <span className="text-[15px]">Total <b style={{ color: 'var(--text)' }}>{money(totals.total)}</b></span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ background: 'var(--brand)' }}>{saving ? 'Saving…' : `Save ${cfg.label.toLowerCase()}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
