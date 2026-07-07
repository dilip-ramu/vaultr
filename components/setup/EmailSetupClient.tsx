'use client'

import { useState, useTransition } from 'react'
import { Mail, Plus, Trash2, AlertTriangle, CheckCircle2, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { notify } from '@/components/shared/Toast'

interface Integration {
  id: string
  provider: string
  email_address: string
  is_active: boolean
  last_checked_at: string | null
  created_at: string
}

export interface Sender {
  id: string
  email: string
  name: string | null
  is_active: boolean
  is_document: boolean
  is_bank_alert: boolean
  default_account_id: string | null
}

interface Account { id: string; name: string }

interface Props {
  initialIntegration: Integration | null
  initialSenders: Sender[]
  accounts: Account[]
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' } as const

export default function EmailSetupClient({ initialIntegration, initialSenders, accounts }: Props) {
  const [integration, setIntegration] = useState<Integration | null>(initialIntegration)
  const [senders, setSenders] = useState<Sender[]>(initialSenders)
  const [emailInput, setEmailInput] = useState(initialIntegration?.email_address ?? '')
  const [passwordInput, setPasswordInput] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [intError, setIntError] = useState<string | null>(null)
  const [intSuccess, setIntSuccess] = useState<string | null>(null)
  const [intPending, startIntTransition] = useTransition()

  const [newEmail, setNewEmail] = useState('')
  const [newName,  setNewName]  = useState('')
  const [newIsDoc,   setNewIsDoc]   = useState(true)
  const [newIsAlert, setNewIsAlert] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addPending, startAddTransition] = useTransition()

  // ── Integration actions ───────────────────────────────────────────────────

  function handleConnect() {
    setIntError(null); setIntSuccess(null)
    if (!emailInput.trim()) { setIntError('Email address is required'); return }
    if (!passwordInput.trim()) { setIntError('App password is required'); return }
    startIntTransition(async () => {
      const res = await fetch('/api/inbox/integrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_address: emailInput.trim(), app_password: passwordInput }),
      })
      const json = await res.json()
      if (!res.ok) { setIntError(json.error ?? 'Failed to connect'); return }
      setIntegration(json.integration)
      setPasswordInput('')
      setIntSuccess('Email account connected')
    })
  }

  function handleDisconnect() {
    startIntTransition(async () => {
      const res = await fetch('/api/inbox/integrations', { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); setIntError(j.error ?? 'Failed to disconnect'); return }
      setIntegration(null); setEmailInput(''); setPasswordInput('')
      setIntSuccess('Email account disconnected')
    })
  }

  // ── Sender actions ────────────────────────────────────────────────────────

  function handleAdd() {
    setAddError(null)
    if (!newEmail.trim()) { setAddError('Email is required'); return }
    if (!newIsDoc && !newIsAlert) { setAddError('Pick at least one role — Supplier or Transaction'); return }
    startAddTransition(async () => {
      const res = await fetch('/api/inbox/senders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(), name: newName.trim() || undefined,
          is_document: newIsDoc, is_bank_alert: newIsAlert,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setAddError(json.error ?? 'Failed to add'); return }
      setSenders(prev => [json.sender, ...prev])
      setNewEmail(''); setNewName(''); setNewIsDoc(true); setNewIsAlert(false)
    })
  }

  function patchSender(id: string, fields: Partial<Sender>) {
    setSenders(prev => prev.map(s => s.id === id ? { ...s, ...fields } : s))
    fetch(`/api/inbox/senders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }).then(async r => {
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        notify(j.error || 'Update failed — refreshing.', 'error')
        // Best-effort: leave the optimistic update; user can fix manually.
      }
    })
  }

  function deleteSender(id: string) {
    setSenders(prev => prev.filter(s => s.id !== id))
    fetch(`/api/inbox/senders/${id}`, { method: 'DELETE' })
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pb-8 space-y-6">

      {/* ── Integration ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
            <Mail className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Mailbox connection</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Yahoo Mail via IMAP App Password</p>
          </div>
          {integration && (
            <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--brand-light)] text-[var(--income)] border border-[var(--border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--income)]" /> Connected
            </span>
          )}
        </div>
        <div className="px-5 py-5 space-y-3">
          {intSuccess && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-[var(--brand-light)] text-[var(--income)]">
              <CheckCircle2 className="w-4 h-4" /> {intSuccess}
            </div>
          )}
          {intError && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
              <AlertTriangle className="w-4 h-4" /> {intError}
            </div>
          )}
          {integration ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{integration.email_address}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {integration.last_checked_at ? `Last checked ${format(parseISO(integration.last_checked_at), 'dd MMM, HH:mm')}` : 'Never checked'}
                </p>
              </div>
              <button onClick={handleDisconnect} disabled={intPending} className="px-3 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: 'rgba(239,68,68,0.25)', color: '#dc2626' }}>
                Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Email address</span>
                <input className={inputCls} style={inputStyle} type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="you@yahoo.com" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>App password</span>
                <div className="relative">
                  <input className={inputCls + ' pr-10'} style={inputStyle} type={showPw ? 'text' : 'password'} value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPw(s => !s)} style={{ color: 'var(--text-faint)' }} tabIndex={-1}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Generate at Yahoo Account → Security → App passwords.</p>
              </label>
              <button onClick={handleConnect} disabled={intPending} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--brand)' }}>
                {intPending ? 'Connecting…' : 'Connect mailbox'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Senders ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Senders</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Each sender can be tagged as <strong>Supplier</strong> (appears in Fetch Invoices) and/or
            <strong> Transaction</strong> (appears in Fetch Transactions). Pick both for emails that contain both.
          </p>
        </div>

        {/* Add */}
        <div className="px-5 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} style={inputStyle} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="alerts@bank.com" />
            <input className={inputCls} style={inputStyle} value={newName}  onChange={e => setNewName(e.target.value)}  placeholder="Display name (optional)" />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={newIsDoc} onChange={e => setNewIsDoc(e.target.checked)} />
              Supplier
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={newIsAlert} onChange={e => setNewIsAlert(e.target.checked)} />
              Transaction
            </label>
            <button onClick={handleAdd} disabled={addPending} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--brand)' }}>
              <Plus className="w-4 h-4" /> {addPending ? 'Adding…' : 'Add sender'}
            </button>
          </div>
          {addError && (
            <p className="text-xs" style={{ color: '#dc2626' }}>{addError}</p>
          )}
        </div>

        {/* List */}
        {senders.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No senders yet.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {senders.map(s => (
              <div key={s.id} className="px-5 py-3 flex flex-wrap items-center gap-3" style={{ opacity: s.is_active ? 1 : 0.55 }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{s.email}</p>
                  {s.name && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{s.name}</p>}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={s.is_document} onChange={e => patchSender(s.id, { is_document: e.target.checked })} />
                  Supplier
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={s.is_bank_alert} onChange={e => patchSender(s.id, { is_bank_alert: e.target.checked })} />
                  Transaction
                </label>
                {s.is_bank_alert && (
                  <select
                    value={s.default_account_id ?? ''}
                    onChange={e => patchSender(s.id, { default_account_id: e.target.value || null })}
                    className="px-2 py-1 rounded-lg text-xs"
                    style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  >
                    <option value="">Auto (by last-4)</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={s.is_active} onChange={e => patchSender(s.id, { is_active: e.target.checked })} />
                  Active
                </label>
                <button onClick={() => deleteSender(s.id)} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)]" title="Delete">
                  <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
