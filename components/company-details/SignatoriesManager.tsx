'use client'

import { useEffect, useState, useCallback } from 'react'
import { Upload, Loader2, Trash2, Plus, Star, PenLine } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import type { CompanySignatory } from '@/lib/companies/signatories'

type Row = CompanySignatory & { signatureUrl?: string | null }

interface Props {
  companyId: string | null
  businessType: 'proprietorship' | 'partnership'
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' } as const

/** Manage a company's authorised signatories (proprietor / partners) and their
 *  signature images. Only usable once the company row exists (like the logo). */
export default function SignatoriesManager({ companyId, businessType }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesignation, setNewDesignation] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/signatories`)
      const data = await res.json()
      if (res.ok) setRows(data.signatories ?? [])
    } finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  async function addSignatory() {
    if (!companyId || !newName.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/signatories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), designation: newDesignation.trim() || null, is_default: rows.length === 0 }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Could not add', 'error'); return }
      setNewName(''); setNewDesignation('')
      await load()
    } finally { setAdding(false) }
  }

  async function patch(sigId: string, body: Record<string, unknown>) {
    if (!companyId) return
    setBusyId(sigId)
    try {
      const res = await fetch(`/api/companies/${companyId}/signatories/${sigId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); notify(d.error || 'Update failed', 'error'); return }
      await load()
    } finally { setBusyId(null) }
  }

  async function remove(sigId: string) {
    if (!companyId) return
    setBusyId(sigId)
    try {
      const res = await fetch(`/api/companies/${companyId}/signatories/${sigId}`, { method: 'DELETE' })
      if (!res.ok) { notify('Could not remove', 'error'); return }
      await load()
    } finally { setBusyId(null) }
  }

  async function uploadSignature(sigId: string, file: File) {
    if (!companyId) return
    setBusyId(sigId)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/companies/${companyId}/signatories/${sigId}/signature`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Upload failed', 'error'); return }
      await load()
    } finally { setBusyId(null) }
  }

  async function removeSignature(sigId: string) {
    if (!companyId) return
    setBusyId(sigId)
    try {
      const res = await fetch(`/api/companies/${companyId}/signatories/${sigId}/signature`, { method: 'DELETE' })
      if (!res.ok) { notify('Could not remove image', 'error'); return }
      await load()
    } finally { setBusyId(null) }
  }

  if (!companyId) {
    return (
      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
        Save the company first, then add authorised signatories.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {loading && rows.length === 0 && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      )}

      {rows.map(sig => {
        const busy = busyId === sig.id
        return (
          <div key={sig.id} className="rounded-xl border p-3 flex items-start gap-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            {/* Signature preview / dropzone */}
            <div className="w-28 h-16 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {sig.signatureUrl
                ? <img src={sig.signatureUrl} alt="Signature" className="w-full h-full object-contain" />
                : <PenLine className="w-5 h-5" style={{ color: 'var(--text-faint)' }} />}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={inputCls} style={inputStyle} defaultValue={sig.name}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== sig.name) void patch(sig.id, { name: v }) }}
                  placeholder="Full name" />
                <input className={inputCls} style={inputStyle} defaultValue={sig.designation ?? ''}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (sig.designation ?? '')) void patch(sig.id, { designation: v }) }}
                  placeholder={businessType === 'partnership' ? 'Partner' : 'Proprietor'} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {sig.signatureUrl ? 'Replace sign' : 'Upload sign'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void uploadSignature(sig.id, f) }} />
                </label>
                {sig.signatureUrl && (
                  <button onClick={() => removeSignature(sig.id)} disabled={busy} className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
                <button onClick={() => patch(sig.id, { is_default: true })} disabled={busy || sig.is_default}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border disabled:opacity-100"
                  style={{ borderColor: sig.is_default ? 'var(--brand)' : 'var(--border)', color: sig.is_default ? 'var(--brand)' : 'var(--text-muted)', background: sig.is_default ? 'var(--brand-light)' : 'transparent' }}
                  title="Use this signatory by default (e.g. on salary slips)">
                  <Star className="w-3 h-3" style={{ fill: sig.is_default ? 'currentColor' : 'none' }} />
                  {sig.is_default ? 'Default' : 'Make default'}
                </button>
                <button onClick={() => remove(sig.id)} disabled={busy} className="inline-flex items-center gap-1 text-xs ml-auto" style={{ color: 'var(--expense)' }}>
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Add new */}
      <div className="rounded-xl border border-dashed p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className={inputCls} style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" />
          <input className={inputCls} style={inputStyle} value={newDesignation} onChange={e => setNewDesignation(e.target.value)} placeholder={businessType === 'partnership' ? 'Partner' : 'Proprietor'} />
        </div>
        <button onClick={addSignatory} disabled={adding || !newName.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add signatory
        </button>
      </div>
    </div>
  )
}
