'use client'

// A member keeping their own record straight.
//
// WHY SOME FIELDS ARE LOCKED
//
// Their name, their phone number and their member number identify them — to
// the operator, to the books, and to the sign-in page. A phone number changed
// by whoever is holding the phone is an account takeover, so those three are
// shown and not editable, with a line saying who to ask.
//
// Everything else is theirs: a new address, a corrected account number, the
// bank they have moved to. The alternative is the operator retyping it from a
// phone call, which is how a register goes stale.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2, Check, Lock, Camera } from 'lucide-react'
import { Card } from './shared'
import PortalAvatar from './PortalAvatar'
import { photoProblem } from '@/lib/chit/memberPhoto'
import {
  profileProblems, FIELD_LABEL, type EditableField, type ProfilePatch,
} from '@/lib/chit/memberProfile'
import type { PortalProfile } from '@/lib/chit/portal-data'

const ORDER: EditableField[] = [
  'address', 'aadhaar', 'pan',
  'bank_name', 'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_branch',
]

const HINT: Partial<Record<EditableField, string>> = {
  aadhaar: '12 digits',
  pan: 'like ABCDE1234F',
  bank_ifsc: 'like HDFC0001234',
  bank_account_number: 'the whole number',
}

export default function PortalProfileForm({ profile }: { profile: PortalProfile }) {
  const router = useRouter()
  const [form, setForm] = useState<ProfilePatch>({
    address: profile.address ?? '',
    aadhaar: profile.aadhaar ?? '',
    pan: profile.pan ?? '',
    bank_name: profile.bankName ?? '',
    bank_account_name: profile.bankAccountName ?? '',
    bank_account_number: profile.bankAccountNumber ?? '',
    bank_ifsc: profile.bankIfsc ?? '',
    bank_branch: profile.bankBranch ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  // Bumped after an upload so the browser fetches the new photo rather than
  // the one it already has at the same address.
  const [photoVersion, setPhotoVersion] = useState(0)
  const [hasPhoto, setHasPhoto] = useState(profile.hasPhoto)

  async function uploadPhoto(file: File) {
    const problem = photoProblem({ type: file.type, size: file.size })
    if (problem) { setError(problem); return }
    setPhotoBusy(true); setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/portal/photo', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not save the photo'); return }
      setHasPhoto(true)
      setPhotoVersion(v => v + 1)
      setSaved('Photo updated.')
      router.refresh()
    } finally { setPhotoBusy(false) }
  }

  const problems = profileProblems(form)
  const problemFor = (f: EditableField) => problems.find(p => p.field === f)?.message

  async function save() {
    setSaving(true); setError(null); setSaved(null)
    try {
      const res = await fetch('/api/portal/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not save'); return }
      setSaved(data.note ?? 'Saved.')
      router.refresh()
    } finally { setSaving(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg border text-[13px] mt-1'
  const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="pt-8 space-y-4">
      <Link href="/m" className="inline-flex items-center gap-1 text-[12.5px] font-bold"
        style={{ color: 'var(--brand)' }}>
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>

      <h1 className="text-xl font-extrabold leading-tight">Your details</h1>

      {/* Their photograph. The organiser sees it too, which is the point: a
          face beside a name on a collection round. */}
      <div className="flex items-center gap-3">
        <PortalAvatar
          name={profile.name}
          src={hasPhoto ? `/api/portal/photo?v=${photoVersion}` : null}
          size={72}
        />
        <label className="inline-flex items-center gap-1.5 text-[12.5px] font-bold cursor-pointer"
          style={{ color: 'var(--brand)' }}>
          {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {hasPhoto ? 'Change photo' : 'Add a photo'}
          <input type="file" accept="image/*" className="hidden" disabled={photoBusy}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) uploadPhoto(f)
              e.target.value = ''
            }} />
        </label>
      </div>

      <p className="text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>
        Member number — {profile.memberCode ?? 'not set'}
      </p>

      {/* What only the organiser can change. */}
      <Card className="p-4 space-y-2">
        {[
          ['Name', profile.name],
          ['Phone', profile.phone ?? 'not set'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span className="text-[13px] font-semibold text-right">{value}</span>
          </div>
        ))}
        <p className="text-[11px] flex items-start gap-1.5 pt-1" style={{ color: 'var(--text-faint)' }}>
          <Lock className="w-3 h-3 mt-0.5 shrink-0" />
          These, and your member number, identify you — so only the chit organiser can change
          them. Ask them if any of it is wrong.
        </p>
      </Card>

      {/* What is theirs to correct. */}
      <Card className="p-4 space-y-3">
        {ORDER.map(f => (
          <label key={f} className="block text-[11.5px] font-semibold"
            style={{ color: 'var(--text-muted)' }}>
            {FIELD_LABEL[f]}
            {HINT[f] && (
              <span className="font-normal" style={{ color: 'var(--text-faint)' }}> · {HINT[f]}</span>
            )}
            {f === 'address' ? (
              <textarea value={form[f] ?? ''} rows={2}
                onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                className={input} style={inputStyle} />
            ) : (
              <input value={form[f] ?? ''}
                onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                className={input} style={inputStyle} />
            )}
            {problemFor(f) && (
              <span className="block mt-1 text-[11px] font-normal" style={{ color: 'var(--expense)' }}>
                {problemFor(f)}
              </span>
            )}
          </label>
        ))}

        {profile.nomineeName && (
          <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            Nominee on file: <b>{profile.nomineeName}</b>. Ask the organiser to change it.
          </p>
        )}

        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
          Your bank details decide where a winning amount is sent, so the organiser is told
          whenever they change.
        </p>

        {error && <p className="text-[12px]" style={{ color: 'var(--expense)' }}>{error}</p>}
        {saved && (
          <p className="text-[12px] flex items-center gap-1" style={{ color: 'var(--income)' }}>
            <Check className="w-3.5 h-3.5" /> {saved}
          </p>
        )}

        <button onClick={save} disabled={saving || problems.length > 0}
          className="w-full py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
          style={{ background: 'var(--brand)' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
        </button>
      </Card>

      <p className="text-[12px] text-center px-4 pb-6" style={{ color: 'var(--text-muted)' }}>
        Please always include your member number
        {profile.memberCode ? <b> ({profile.memberCode})</b> : null} when you contact us.
      </p>
    </div>
  )
}
