'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, ImagePlus, FileText, User, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { useFileDrop } from '@/components/shared/useFileDrop'
import type { AccountHolder, HolderDoc } from '@/lib/types'

const HOLDER_DOC_TYPES = ['PAN card', 'Aadhaar card', 'Passport', 'Driving licence', 'Voter ID', 'Photo', 'Signature', 'Cancelled cheque', 'Other']

export default function UsersClient({ initialHolders }: { initialHolders: AccountHolder[] }) {
  const [holders, setHolders] = useState<AccountHolder[]>(initialHolders)
  const [form, setForm] = useState<AccountHolder | null | 'new'>(null)

  const onSaved = (h: AccountHolder) => {
    setHolders(prev => prev.some(x => x.id === h.id) ? prev.map(x => x.id === h.id ? h : x) : [...prev, h])
    setForm(null)
  }
  const onDeleted = (id: string) => { setHolders(prev => prev.filter(h => h.id !== id)); setForm(null) }

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Users</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>People who hold your accounts — photo, KYC &amp; documents in one place.</p>
        </div>
        <button onClick={() => setForm('new')} className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}><Plus className="w-4 h-4" /> Add user</button>
      </div>

      {holders.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--surface-2)' }}><User className="w-7 h-7" style={{ color: 'var(--text-faint)' }} /></div>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No users yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add a person, then pick them as the holder on any account.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {holders.map(h => (
            <button key={h.id} onClick={() => setForm(h)} className="flex items-center gap-3 p-4 rounded-2xl text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              {h.photo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={h.photo_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                : <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)' }}><User className="w-5 h-5" style={{ color: 'var(--text-faint)' }} /></div>}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{h.name}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {[h.pan && 'PAN', h.aadhaar && 'Aadhaar', (h.documents?.length ? `${h.documents.length} doc${h.documents.length > 1 ? 's' : ''}` : '')].filter(Boolean).join(' · ') || 'Tap to add details'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {form && <HolderForm holder={form === 'new' ? null : form} onSaved={onSaved} onDeleted={onDeleted} onClose={() => setForm(null)} />}
    </div>
  )
}

function HolderForm({ holder, onSaved, onDeleted, onClose }: { holder: AccountHolder | null; onSaved: (h: AccountHolder) => void; onDeleted: (id: string) => void; onClose: () => void }) {
  const [name, setName] = useState(holder?.name ?? '')
  const [photoUrl, setPhotoUrl] = useState(holder?.photo_url ?? '')
  const [pan, setPan] = useState(holder?.pan ?? '')
  const [aadhaar, setAadhaar] = useState(holder?.aadhaar ?? '')
  const [dob, setDob] = useState(holder?.dob ?? '')
  const [phone, setPhone] = useState(holder?.phone ?? '')
  const [email, setEmail] = useState(holder?.email ?? '')
  const [address, setAddress] = useState(holder?.address ?? '')
  const [notes, setNotes] = useState(holder?.notes ?? '')
  const [docs, setDocs] = useState<HolderDoc[]>(holder?.documents ?? [])
  const [uploading, setUploading] = useState<'' | 'photo' | 'doc'>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const upload = async (file: File, folder: string) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user!.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const { error: e } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (e) { setError(e.message); return null }
    return supabase.storage.from('vaultr-avatars').getPublicUrl(path).data.publicUrl
  }
  const uploadPhoto = async (file?: File) => { if (!file) return; setUploading('photo'); const u = await upload(file, 'holders'); if (u) setPhotoUrl(`${u}?t=${Date.now()}`); setUploading('') }
  const uploadDoc = async (file?: File) => { if (!file) return; setUploading('doc'); const u = await upload(file, 'holder-docs'); if (u) setDocs(d => [...d, { type: HOLDER_DOC_TYPES[0], url: u, name: file.name }]); setUploading('') }
  const photoDrop = useFileDrop(f => uploadPhoto(f[0]), { disabled: uploading === 'photo' })
  const docDrop = useFileDrop(f => uploadDoc(f[0]), { disabled: uploading === 'doc' })

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      name: name.trim(), photo_url: photoUrl || null, pan: pan.trim() || null, aadhaar: aadhaar.trim() || null,
      dob: dob || null, phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null,
      documents: docs, notes: notes.trim() || null, updated_at: new Date().toISOString(),
    }
    const res = holder
      ? await supabase.from('account_holders').update(payload).eq('id', holder.id).select().single()
      : await supabase.from('account_holders').insert({ ...payload, user_id: user!.id }).select().single()
    if (res.error) { setError(res.error.message); setSaving(false); return }
    onSaved(res.data as AccountHolder)
  }
  const del = async () => {
    if (!holder) return
    if (!await confirmDialog(`Delete “${holder.name}”? Accounts linked to them will keep their text name.`)) return
    const supabase = createClient()
    await supabase.from('account_holders').delete().eq('id', holder.id)
    onDeleted(holder.id)
  }

  const fld = 'w-full mt-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-[10px] px-3 py-2.5 text-[13px]'
  const lbl = 'text-[11px] font-bold text-[var(--text-muted)]'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch justify-center md:justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:w-1/3 md:min-w-[380px] md:h-full rounded-t-3xl md:rounded-none shadow-2xl slide-up max-h-[92vh] md:max-h-none overflow-y-auto" style={{ borderLeft: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{holder ? 'Edit user' : 'New user'}</p>
          <div className="flex items-center gap-1.5">
            {holder && <button onClick={del} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--expense)' }}><Trash2 className="w-4 h-4" /></button>}
            <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-3.5">
          {error && <p className="text-[12px]" style={{ color: 'var(--expense)' }}>{error}</p>}

          {/* Photo + name */}
          <div className="flex items-center gap-3">
            <button type="button" {...photoDrop.dropProps} onClick={() => document.getElementById('holder-photo')?.click()}
              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden shrink-0 transition-all"
              style={{ background: photoDrop.dragOver ? 'var(--brand-light)' : 'var(--surface-2)', border: `1px ${photoDrop.dragOver ? 'dashed var(--brand)' : 'solid var(--border)'}` }}>
              {photoUrl && !photoDrop.dragOver
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                : <ImagePlus className="w-5 h-5" style={{ color: 'var(--text-faint)' }} />}
            </button>
            <input id="holder-photo" type="file" accept="image/*" className="hidden" onChange={e => uploadPhoto(e.target.files?.[0])} />
            <div className="flex-1">
              <label className={lbl}>Full name</label>
              <input className={fld} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dilip T R" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>PAN</label><input className={`${fld} font-mono uppercase`} value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></div>
            <div><label className={lbl}>Aadhaar</label><input className={`${fld} font-mono`} value={aadhaar} onChange={e => setAadhaar(e.target.value)} placeholder="1234 5678 9012" inputMode="numeric" /></div>
            <div><label className={lbl}>Date of birth</label><input type="date" className={fld} value={dob} onChange={e => setDob(e.target.value)} /></div>
            <div><label className={lbl}>Phone</label><input className={fld} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91…" inputMode="tel" /></div>
            <div className="col-span-2"><label className={lbl}>Email</label><input className={fld} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@email.com" inputMode="email" /></div>
            <div className="col-span-2"><label className={lbl}>Address</label><textarea className={`${fld} resize-none`} rows={2} value={address} onChange={e => setAddress(e.target.value)} /></div>
          </div>

          {/* Documents */}
          <div {...docDrop.dropProps} className="rounded-xl overflow-hidden transition-all" style={{ border: docDrop.dragOver ? '1px dashed var(--brand)' : '1px solid var(--border)', background: docDrop.dragOver ? 'var(--brand-light)' : undefined }}>
            <div className="flex items-center justify-between px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
              <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text)' }}><Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} /> Documents {docs.length > 0 && <span style={{ color: 'var(--text-faint)' }}>· {docs.length}</span>}</span>
              <button type="button" onClick={() => document.getElementById('holder-doc')?.click()} className="flex items-center gap-1 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>{uploading === 'doc' ? 'Uploading…' : docDrop.dragOver ? 'Drop file' : <><Plus className="w-3.5 h-3.5" /> Add</>}</button>
              <input id="holder-doc" type="file" accept="image/*,application/pdf" className="hidden" onChange={e => uploadDoc(e.target.files?.[0])} />
            </div>
            {docs.length > 0 && (
              <div className="px-3 py-2 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                {docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={d.type} onChange={e => setDocs(v => v.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[12px]">
                      {HOLDER_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 flex items-center gap-1.5 text-[12px] truncate" style={{ color: 'var(--brand)' }}><FileText className="w-3.5 h-3.5 shrink-0" />{d.name}</a>
                    <button type="button" onClick={() => setDocs(v => v.filter((_, j) => j !== i))} className="shrink-0" style={{ color: 'var(--text-faint)' }}><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div><label className={lbl}>Notes</label><textarea className={`${fld} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>

          <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand)' }}>{saving ? 'Saving…' : holder ? 'Save changes' : 'Add user'}</button>
        </div>
      </div>
    </div>
  )
}
