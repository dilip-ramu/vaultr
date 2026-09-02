'use client'

import { useState } from 'react'
import { Card } from './shared'

export default function PortalPinForm({ name }: { name: string }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pin !== confirm) { setError('The two PINs do not match.'); return }
    setSaving(true)
    const res = await fetch('/api/portal/pin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(body?.error ?? 'Could not save the PIN.'); return }
    window.location.href = '/m'
  }

  const field = {
    background: 'var(--surface-2, var(--bg))',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }

  return (
    <div className="pt-16">
      <h1 className="text-xl font-extrabold leading-tight">
        Welcome{name ? `, ${name.split(' ')[0]}` : ''}
      </h1>
      <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Choose a 4-digit PIN. You will not need it to check your dues — it is there so that
        only you can act on your chit from this phone.
      </p>

      <Card className="p-4 mt-5">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>New PIN</label>
            <input
              inputMode="numeric" autoComplete="new-password" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full mt-1 px-3 py-3 rounded-xl border text-lg tracking-[0.5em] outline-none"
              style={field}
            />
          </div>
          <div>
            <label className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>Confirm PIN</label>
            <input
              inputMode="numeric" autoComplete="new-password" maxLength={4} value={confirm}
              onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))}
              className="w-full mt-1 px-3 py-3 rounded-xl border text-lg tracking-[0.5em] outline-none"
              style={field}
            />
          </div>

          {error && (
            <p className="text-[12.5px]" style={{ color: 'var(--expense)' }}>{error}</p>
          )}

          <button type="submit" disabled={saving || pin.length !== 4}
            className="w-full py-3 rounded-xl text-[13.5px] font-extrabold disabled:opacity-50"
            style={{ background: 'var(--brand)', color: 'white' }}>
            {saving ? 'Saving…' : 'Save PIN and continue'}
          </button>
        </form>
      </Card>

      <p className="text-[11px] mt-4 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        Avoid 1234, your year of birth, or anything printed on a card you carry.
        The organiser cannot see your PIN and cannot recover it — if you forget it,
        they will reset it and you will choose a new one.
      </p>
    </div>
  )
}
