'use client'

import { useState } from 'react'
import { notify } from '@/components/shared/Toast'

export default function SetPasswordForm({ name, forced }: { name: string | null; forced: boolean }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    const res = await fetch('/api/chit/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(body?.error ?? 'Could not set the password.'); return }
    notify('Password set', 'success')
    window.location.href = '/chit'
  }

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="w-full max-w-sm mx-auto px-4 py-16">
      <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>
        {forced ? 'Choose your own password' : 'Change your password'}
      </h1>
      <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {forced
          ? `Welcome${name ? `, ${name.split(' ')[0]}` : ''}. The password you were given was chosen by someone else, so please replace it before you start.`
          : 'Pick something only you know.'}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>New password</label>
          <input type="password" className={fld} style={fs} value={pw} autoComplete="new-password"
            onChange={e => setPw(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Confirm</label>
          <input type="password" className={fld} style={fs} value={confirm} autoComplete="new-password"
            onChange={e => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-[12.5px]" style={{ color: 'var(--expense)' }}>{error}</p>}
        <button type="submit" disabled={busy || pw.length < 10}
          className="w-full py-2.5 rounded-xl text-sm font-extrabold text-white disabled:opacity-50"
          style={{ background: 'var(--brand)' }}>
          {busy ? 'Saving…' : 'Set password and continue'}
        </button>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          At least 10 characters, with letters and a number.
        </p>
      </form>
    </div>
  )
}
