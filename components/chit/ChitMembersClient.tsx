'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Upload, Trash2, Pencil, X, Phone, Link2, LogOut } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import type { ChitMember } from '@/lib/chit/types'

export default function ChitMembersClient({ initialMembers }: { initialMembers: ChitMember[] }) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ChitMember | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return members
    return members.filter(m =>
      m.name.toLowerCase().includes(s) || (m.phone ?? '').includes(s))
  }, [members, q])

  // ── Member portal (v115) ──────────────────────────────────────────────────
  // Access is per member and off by default. Turning it OFF also signs the
  // member out everywhere, so "revoke" means revoked, not "revoked eventually".
  const [busyPortal, setBusyPortal] = useState<string | null>(null)

  async function portalAction(memberId: string, action: 'enable' | 'disable' | 'invite' | 'revoke') {
    setBusyPortal(memberId)
    try {
      const res = await fetch('/api/chit/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberId, action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not do that', 'error'); return }

      if (action === 'enable' || action === 'disable') {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, portal_enabled: body.portal_enabled } : m))
        notify(body.portal_enabled ? 'Portal access on' : 'Portal access off — signed out everywhere')
      } else if (action === 'revoke') {
        notify(body.revoked ? `Signed out of ${body.revoked} device(s)` : 'No active sessions')
      } else if (action === 'invite') {
        // The link is single-use and short-lived, so it is handed straight to
        // WhatsApp rather than parked anywhere.
        if (body.whatsappUrl) window.open(body.whatsappUrl, '_blank', 'noopener')
        else {
          await navigator.clipboard?.writeText(body.url).catch(() => {})
          notify('No phone number on file — link copied instead', 'error')
        }
      }
    } finally {
      setBusyPortal(null)
    }
  }

  async function remove(id: string) {
    if (!(await confirmDialog('Remove this member? Their group history goes too.'))) return
    const res = await fetch(`/api/chit/members?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Could not delete', 'error'); return }
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Chit members</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{members.length} on the roster</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setImporting(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}>
            <Plus className="w-4 h-4" /> Add member
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>No members yet.</p>
        )}
        {filtered.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.name}</p>
              <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}>
                {m.phone && <><Phone className="w-3 h-3" />{m.phone}</>}
                {m.pan && <span>· PAN {m.pan}</span>}
              </p>
            </div>
            {/* Portal access. Deliberately three separate controls: switching
                access on is not the same as sending a link, and revoking is not
                the same as switching off. */}
            {m.portal_enabled ? (
              <>
                <button onClick={() => portalAction(m.id, 'invite')} disabled={busyPortal === m.id}
                  title="Send a one-time login link on WhatsApp"
                  className="p-1.5 disabled:opacity-40" style={{ color: 'var(--brand)' }}>
                  <Link2 className="w-4 h-4" />
                </button>
                <button onClick={() => portalAction(m.id, 'revoke')} disabled={busyPortal === m.id}
                  title="Sign this member out of every device"
                  className="p-1.5 disabled:opacity-40" style={{ color: 'var(--text-faint)' }}>
                  <LogOut className="w-4 h-4" />
                </button>
                <button onClick={() => portalAction(m.id, 'disable')} disabled={busyPortal === m.id}
                  className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full disabled:opacity-40"
                  style={{ color: 'var(--income)', background: 'color-mix(in srgb, var(--income) 14%, transparent)' }}>
                  Portal on
                </button>
              </>
            ) : (
              <button onClick={() => portalAction(m.id, 'enable')} disabled={busyPortal === m.id}
                title="Allow this member to sign in to the read-only portal"
                className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full disabled:opacity-40"
                style={{ color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                Portal off
              </button>
            )}
            <button onClick={() => setEditing(m)} className="p-1.5" style={{ color: 'var(--text-faint)' }}><Pencil className="w-4 h-4" /></button>
            <button onClick={() => remove(m.id)} className="p-1.5" style={{ color: 'var(--expense)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {(adding || editing) && (
        <MemberForm
          member={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={m => {
            setMembers(prev => prev.some(x => x.id === m.id) ? prev.map(x => x.id === m.id ? m : x) : [...prev, m].sort((a, b) => a.name.localeCompare(b.name)))
            setAdding(false); setEditing(null)
          }}
        />
      )}

      {importing && <ImportSheet onClose={() => setImporting(false)} onDone={() => { setImporting(false); router.refresh() }} />}
    </div>
  )
}

function MemberForm({ member, onClose, onSaved }: {
  member: ChitMember | null
  onClose: () => void
  onSaved: (m: ChitMember) => void
}) {
  const [name, setName] = useState(member?.name ?? '')
  const [dial, setDial] = useState(member?.dial_code ?? '91')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [address, setAddress] = useState(member?.address ?? '')
  const [aadhaar, setAadhaar] = useState(member?.aadhaar ?? '')
  const [pan, setPan] = useState(member?.pan ?? '')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [busy, setBusy] = useState(false)

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lbl = 'text-[11px] font-bold block mb-1'

  async function save(force = false) {
    if (!name.trim()) { notify('Name is required', 'error'); return }
    setBusy(true)
    try {
      const payload = { id: member?.id, name, dial_code: dial, phone, address, aadhaar, pan, notes, force }
      const res = await fetch('/api/chit/members', {
        method: member ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (res.status === 409 && json.duplicate) {
        if (await confirmDialog(`${json.error}. Add anyway?`)) return save(true)
        return
      }
      if (!res.ok) { notify(json.error ?? 'Save failed', 'error'); return }
      onSaved(json.member)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{member ? 'Edit member' : 'Add member'}</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2.5">
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Name</label>
            <input className={fld} style={fs} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Phone</label>
              <div className="flex gap-1.5">
                <div className="relative w-20 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-faint)' }}>+</span>
                  <input className={`${fld} pl-5`} style={fs} value={dial} onChange={e => setDial(e.target.value.replace(/\D/g, ''))} inputMode="numeric" title="Country code" />
                </div>
                <input className={fld} style={fs} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="10-digit number" />
              </div>
            </div>
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>PAN</label>
              <input className={fld} style={fs} value={pan} onChange={e => setPan(e.target.value.toUpperCase())} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Aadhaar</label>
            <input className={fld} style={fs} value={aadhaar} onChange={e => setAadhaar(e.target.value)} inputMode="numeric" /></div>
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Address</label>
            <textarea className={fld} style={fs} rows={2} value={address} onChange={e => setAddress(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Notes</label>
            <input className={fld} style={fs} value={notes} onChange={e => setNotes(e.target.value)} placeholder="nominees, guarantors, securities…" /></div>
          <button onClick={() => save()} disabled={busy}
            className="w-full text-white text-sm font-bold py-2.5 rounded-xl mt-1 disabled:opacity-60" style={{ background: 'var(--brand)' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleFile(file: File) {
    setBusy(true); setResult(null)
    try {
      const text = await file.text()
      // Expect columns: Serial, Name, Phone (header row, comma-separated).
      const rows = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const header = rows.shift()?.toLowerCase().split(',').map(s => s.trim()) ?? []
      const nameIdx = header.findIndex(h => h.includes('name'))
      const phoneIdx = header.findIndex(h => h.includes('phone') || h.includes('mobile'))
      if (nameIdx < 0) { notify('CSV needs a Name column', 'error'); return }

      let ok = 0, skip = 0
      for (const line of rows) {
        const cols = line.split(',')
        const name = cols[nameIdx]?.trim()
        if (!name) { skip++; continue }
        const phone = phoneIdx >= 0 ? cols[phoneIdx]?.trim() : ''
        const res = await fetch('/api/chit/members', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, force: true }),
        })
        if (res.ok) ok++; else skip++
      }
      setResult(`Imported ${ok}. Skipped ${skip}.`)
      if (ok > 0) setTimeout(onDone, 1200)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Import members</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[12.5px] mb-4" style={{ color: 'var(--text-muted)' }}>
          A CSV with <b>Name</b> and <b>Phone</b> columns (a Serial column is fine, it's ignored). One member per row.
        </p>
        <label className="block w-full text-center py-8 rounded-xl cursor-pointer" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
          {busy ? 'Importing…' : 'Choose CSV file'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </label>
        {result && <p className="text-sm mt-3 font-semibold" style={{ color: 'var(--brand)' }}>{result}</p>}
      </div>
    </div>
  )
}
