'use client'

// Who can sign in to your chit module.
//
// These are real Inex logins that see the chit section and nothing else. The
// rest of the app is not hidden from them by menus alone — the database refuses
// it — so this page is about granting, not about pretending.

import { useCallback, useEffect, useState } from 'react'
import { Plus, X, KeyRound, UserMinus, ShieldCheck } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

interface Admin {
  id: string
  name: string | null
  email: string
  role: 'partner' | 'collector' | 'viewer'
  is_active: boolean
  must_change_password: boolean
  last_seen_at: string | null
}

const ROLE_LABEL: Record<Admin['role'], string> = {
  partner: 'Partner — runs the chit',
  collector: 'Collector — records payments only',
  viewer: 'Viewer — read only',
}

export default function ChitAdminsClient() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<Admin | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/chit/admins', { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) setAdmins(body.admins ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function patch(id: string, payload: Record<string, unknown>) {
    const res = await fetch('/api/chit/admins', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { notify(body?.error ?? 'Could not save', 'error'); return false }
    await load()
    return true
  }

  async function remove(a: Admin) {
    if (!(await confirmDialog(
      `Remove ${a.name ?? a.email} from your chit?\n\n`
      + 'Their access ends immediately. The login itself is left alone — this button '
      + 'takes away permission, it does not delete a person\'s account.',
    ))) return
    const res = await fetch(`/api/chit/admins?id=${a.id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Could not remove', 'error'); return }
    await load()
    notify('Access removed')
  }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            Chit admins
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Logins that can reach your chit module and nothing else.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl"
          style={{ background: 'var(--brand)' }}>
          <Plus className="w-4 h-4" /> Add a login
        </button>
      </div>

      {!loading && admins.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Nobody else has access</p>
          <p className="text-[12.5px] mt-1.5 leading-relaxed max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            Add a login for a partner who runs the chit with you. They will see the chit
            section only — your transactions, invoices, payroll and investments stay
            invisible to them.
          </p>
        </div>
      )}

      {admins.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {admins.map((a, i) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: a.is_active ? 1 : 0.55 }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  {a.name ?? a.email}
                  {!a.is_active && <span className="text-[10px] uppercase" style={{ color: 'var(--text-faint)' }}>suspended</span>}
                  {a.must_change_password && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 14%, transparent)' }}>
                      password not yet changed
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{a.email}</p>
              </div>

              <select value={a.role} onChange={e => patch(a.id, { role: e.target.value })}
                className="text-[11.5px] font-bold px-2 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                {(Object.keys(ROLE_LABEL) as Admin['role'][]).map(r => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>

              <button onClick={() => setResetting(a)} title="Set a new password"
                className="p-1.5" style={{ color: 'var(--text-faint)' }}><KeyRound className="w-4 h-4" /></button>
              <button onClick={() => patch(a.id, { is_active: !a.is_active })}
                className="text-[11px] font-bold px-2 py-1 rounded-full"
                style={a.is_active
                  ? { color: 'var(--income)', background: 'color-mix(in srgb, var(--income) 12%, transparent)' }
                  : { color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                {a.is_active ? 'Active' : 'Suspended'}
              </button>
              <button onClick={() => remove(a)} className="p-1.5" style={{ color: 'var(--expense)' }}>
                <UserMinus className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-[11px] uppercase tracking-wide font-extrabold mb-2 inline-flex items-center gap-1.5"
          style={{ color: 'var(--text-faint)' }}>
          <ShieldCheck className="w-3.5 h-3.5" /> What they can reach
        </p>
        <ul className="text-[12.5px] leading-relaxed space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>• Chit members, groups, auctions and collections — nothing else in Inex.</li>
          <li>• A <b>partner</b> can do everything you can in Chit except delete a group or change a chit&rsquo;s value.</li>
          <li>• A <b>collector</b> can record payments and nothing more.</li>
          <li>• Recording a collection still posts income to your accounts, as it does for you. They cannot otherwise see or touch your accounts.</li>
        </ul>
      </div>

      {adding && <AddAdmin onClose={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
      {resetting && (
        <ResetPassword admin={resetting} onClose={() => setResetting(null)}
          onDone={async pw => {
            const ok = await patch(resetting.id, { password: pw })
            if (ok) { setResetting(null); notify('Password set — they must change it on next sign-in', 'success') }
          }} />
      )}
    </div>
  )
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{title}</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

const FLD = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
const FS = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

function AddAdmin({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Admin['role']>('partner')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    const res = await fetch('/api/chit/admins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(body?.error ?? 'Could not create that login'); return }
    onDone()
  }

  return (
    <Sheet title="Add a chit login" onClose={onClose}>
      <div className="space-y-2.5">
        <input className={FLD} style={FS} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input className={FLD} style={FS} placeholder="Email" type="email" autoComplete="off"
          value={email} onChange={e => setEmail(e.target.value)} />
        <input className={FLD} style={FS} placeholder="First password" autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} />
        <select className={FLD} style={FS} value={role} onChange={e => setRole(e.target.value as Admin['role'])}>
          {(Object.keys(ROLE_LABEL) as Admin['role'][]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        {error && <p className="text-[12.5px]" style={{ color: 'var(--expense)' }}>{error}</p>}
        <button onClick={save} disabled={busy || !email || password.length < 10}
          className="w-full text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
          style={{ background: 'var(--brand)' }}>
          {busy ? 'Creating…' : 'Create login'}
        </button>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          Hand them the email and password in person. Because you chose it, they are made
          to replace it the first time they sign in — until they do, nothing in the chit
          opens for them.
        </p>
      </div>
    </Sheet>
  )
}

function ResetPassword({ admin, onClose, onDone }: {
  admin: Admin; onClose: () => void; onDone: (pw: string) => void
}) {
  const [pw, setPw] = useState('')
  return (
    <Sheet title={`New password for ${admin.name ?? admin.email}`} onClose={onClose}>
      <div className="space-y-2.5">
        <input className={FLD} style={FS} placeholder="New password" autoComplete="new-password"
          value={pw} onChange={e => setPw(e.target.value)} />
        <button onClick={() => onDone(pw)} disabled={pw.length < 10}
          className="w-full text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
          style={{ background: 'var(--brand)' }}>
          Set password
        </button>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          They will be asked to choose their own the next time they sign in.
        </p>
      </div>
    </Sheet>
  )
}
