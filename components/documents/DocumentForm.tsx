'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import SignatorySelect from '@/components/company-details/SignatorySelect'
import { buildDocNumber, docNumberHead, docConfigFor, type DocSide } from '@/lib/documents/config'
import type { LinkKind } from '@/lib/documents/links'

interface CompanyOpt { id: string; name: string; prefix: string }
interface PartyOpt { id: string; name: string; gstin: string | null; address: string | null; state: string | null }
export interface DocInitial {
  companyId: string; partyId: string; date: string; reference: string; notes: string
  signatoryId: string | null; number: string
  lines: { item: string; hsn: string; qty: string; rate: string; gst: string }[]
}
interface Props {
  side: DocSide
  docType: string
  companies: CompanyOpt[]
  parties: PartyOpt[]
  existing: { company_id: string | null; number: string }[]
  docId?: string | null
  initial?: DocInitial
  /** When creating from an upstream document (convert). */
  sourceId?: string | null
  sourceKind?: LinkKind
  /** When this is a credit/debit note raised against an invoice. */
  against?: { id: string; kind: LinkKind; number: string } | null
}

interface Line { id: number; item: string; hsn: string; qty: string; rate: string; gst: string }
let seq = 0
const money = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)

export default function DocumentForm({ side, docType, companies, parties, existing, docId = null, initial, sourceId = null, sourceKind = 'document', against = null }: Props) {
  const router = useRouter()
  const isEdit = !!docId
  const cfg = docConfigFor(docType, side)!
  const listHref = `/${side === 'customer' ? 'customers' : 'suppliers'}/documents/${docType}`

  const companyPrefix = (cid: string) => companies.find(c => c.id === cid)?.prefix ?? ''
  const nextNumber = (cid: string) => buildDocNumber(companyPrefix(cid), cfg.code, existing.filter(e => e.company_id === cid).map(e => e.number))

  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? '')
  const [signatoryId, setSignatoryId] = useState<string | null>(initial?.signatoryId ?? null)
  const [partyId, setPartyId] = useState(initial?.partyId ?? '')
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState(initial?.reference ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [numberStr, setNumberStr] = useState(() => initial?.number ?? nextNumber(companies[0]?.id ?? ''))
  const [lines, setLines] = useState<Line[]>(() =>
    initial?.lines?.length ? initial.lines.map(l => ({ id: ++seq, ...l })) : [{ id: ++seq, item: '', hsn: '', qty: '1', rate: '', gst: '18' }])
  const [saving, setSaving] = useState(false)

  const party = parties.find(p => p.id === partyId)
  const setLine = (id: number, patch: Partial<Line>) => setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  const totals = useMemo(() => {
    let subtotal = 0, cgst = 0, sgst = 0
    for (const l of lines) {
      const amt = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0)
      subtotal += amt
      if (cfg.tax) { const g = (parseFloat(l.gst) || 0) / 2 / 100 * amt; cgst += g; sgst += g }
    }
    return { subtotal, cgst, sgst, total: subtotal + cgst + sgst }
  }, [lines, cfg.tax])

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

      // For NEW docs, reserve a monotonic number from the server counter so a
      // deleted number is never reused. Falls back to the client preview if the
      // RPC/migration isn't available yet.
      let finalNumber = numberStr.trim()
      if (!isEdit) {
        const { head, yy } = docNumberHead(companyPrefix(companyId), cfg.code)
        const { data: seq, error: seqErr } = await sb.rpc('next_document_number', { p_company: companyId, p_code: cfg.code, p_yy: yy })
        if (!seqErr && typeof seq === 'number') finalNumber = `${head}${String(seq).padStart(4, '0')}`
      }

      const fields = {
        company_id: companyId,
        party_kind: side, party_id: party.id, party_name: party.name,
        party_address: party.address, party_gstin: party.gstin, party_state: party.state,
        number: finalNumber, date, reference: reference.trim() || null, notes: notes.trim() || null,
        signatory_id: signatoryId || null,
        subtotal: totals.subtotal, cgst_amount: totals.cgst, sgst_amount: totals.sgst, total: totals.total,
      }
      let savedId = docId
      if (isEdit && docId) {
        const { error } = await sb.from('documents').update(fields).eq('id', docId).eq('user_id', user.id)
        if (error) { notify(error.message, 'error'); return }
        await sb.from('document_lines').delete().eq('document_id', docId).eq('user_id', user.id)
      } else {
        const { data: doc, error } = await sb.from('documents').insert({ user_id: user.id, doc_type: docType, ...fields }).select('id').single()
        if (error || !doc) { notify(error?.message ?? 'Save failed', 'error'); return }
        savedId = doc.id
      }
      const lineRows = valid.map((l, i) => {
        const amt = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0)
        const g = cfg.tax ? (parseFloat(l.gst) || 0) / 2 / 100 * amt : 0
        return { document_id: savedId, user_id: user.id, line_number: i + 1, item: l.item.trim(), hsn_sac: l.hsn.trim() || null, qty: parseFloat(l.qty) || 0, rate: parseFloat(l.rate) || 0, amount: amt, gst_rate: cfg.tax ? parseFloat(l.gst) || 0 : 0, cgst_amount: g, sgst_amount: g }
      })
      await sb.from('document_lines').insert(lineRows)

      // Record chain links on first creation (additive — never on edit).
      if (!isEdit && savedId) {
        if (sourceId) {
          await sb.from('document_links').insert({ user_id: user.id, source_kind: sourceKind, source_id: sourceId, target_kind: 'document', target_id: savedId, relation: 'converted' })
          if (sourceKind === 'document') await sb.from('documents').update({ status: 'converted' }).eq('id', sourceId).eq('user_id', user.id)
        }
        if (against) {
          await sb.from('document_links').insert({ user_id: user.id, source_kind: against.kind, source_id: against.id, target_kind: 'document', target_id: savedId, relation: 'adjusts' })
        }
      }

      notify(`${cfg.label} ${finalNumber} ${isEdit ? 'updated' : 'saved'} ✓`, 'success')
      router.push(listHref)
      router.refresh()
    } finally { setSaving(false) }
  }

  const iCls = 'w-full px-3 py-2 rounded-lg border text-sm mt-1'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const gridCols = cfg.tax ? '1fr 90px 60px 90px 70px 90px 32px' : '1fr 90px 60px 90px 90px 32px'

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={listHref} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><ChevronLeft className="w-4 h-4" /></Link>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{isEdit ? 'Edit' : 'New'} {cfg.label.toLowerCase()}</h1>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ background: 'var(--brand)' }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving…' : (isEdit ? 'Save changes' : `Save ${cfg.label.toLowerCase()}`)}
        </button>
      </div>

      <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Company (from)
            <select value={companyId} onChange={e => { setCompanyId(e.target.value); setNumberStr(nextNumber(e.target.value)) }} className={iCls} style={iStyle}>
              <option value="">— pick —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Number {!isEdit && <span style={{ color: 'var(--text-faint)' }}>(auto)</span>}
            <input value={numberStr} onChange={e => setNumberStr(e.target.value)} readOnly={!isEdit} className={iCls} style={{ ...iStyle, opacity: isEdit ? 1 : 0.7 }} />
          </label>
          <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{cfg.partyLabel}
            <select value={partyId} onChange={e => setPartyId(e.target.value)} className={iCls} style={iStyle}>
              <option value="">— pick —</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Authorised signatory
            <SignatorySelect companyId={companyId || null} value={signatoryId} onChange={setSignatoryId} className={iCls} style={iStyle} />
          </label>
          <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={iCls} style={iStyle} />
          </label>
          <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{cfg.referenceLabel ?? 'Reference'}
            <input value={reference} onChange={e => setReference(e.target.value)} className={iCls} style={iStyle} />
          </label>
        </div>

        {/* line items */}
        <div>
          <div className="grid gap-2 text-[10px] font-bold uppercase tracking-wide px-1 mb-1 overflow-x-auto" style={{ gridTemplateColumns: gridCols, color: 'var(--text-muted)' }}>
            <span>Item</span><span>HSN/SAC</span><span>Qty</span><span>Rate</span>{cfg.tax && <span>GST %</span>}<span className="text-right">Amount</span><span />
          </div>
          <div className="space-y-1.5">
            {lines.map(l => {
              const amt = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0)
              return (
                <div key={l.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: gridCols }}>
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
    </div>
  )
}
