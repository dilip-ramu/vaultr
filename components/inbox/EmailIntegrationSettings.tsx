'use client'

import { useState, useTransition } from 'react'
import {
  Mail, Link2, Link2Off, RefreshCw, Plus, Trash2,
  PencilLine, Check, X, AlertTriangle, CheckCircle2,
  Eye, EyeOff, ToggleLeft, ToggleRight, ExternalLink,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

// ── Types ────────────────────────────────────────────────────────────────────

interface Integration {
  id: string
  provider: string
  email_address: string
  is_active: boolean
  last_checked_at: string | null
  created_at: string
}

interface Sender {
  id: string
  email: string
  name: string | null
  is_active: boolean
  created_at: string
}

interface CheckResult {
  checked: number
  added: number
  duplicates: number
  errors: string[]
}

interface Props {
  initialIntegration: Integration | null
  initialSenders: Sender[]
  hideHeader?: boolean
}

// ── Input helper ──────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder, disabled, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  hint?: string
}) {
  const [show, setShow] = useState(false)
  const inputType = type === 'password' ? (show ? 'text' : 'password') : type
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</label>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-faint)' }}
            tabIndex={-1}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{hint}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmailIntegrationSettings({ initialIntegration, initialSenders, hideHeader = false }: Props) {
  const [integration, setIntegration] = useState<Integration | null>(initialIntegration)
  const [senders, setSenders] = useState<Sender[]>(initialSenders)

  // Integration form state
  const [emailInput, setEmailInput] = useState(initialIntegration?.email_address ?? '')
  const [passwordInput, setPasswordInput] = useState('')
  const [intError, setIntError] = useState<string | null>(null)
  const [intSuccess, setIntSuccess] = useState<string | null>(null)
  const [intPending, startIntTransition] = useTransition()

  // Check now
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checkPending, startCheckTransition] = useTransition()

  // Sender form state
  const [newSenderEmail, setNewSenderEmail] = useState('')
  const [newSenderName, setNewSenderName] = useState('')
  const [senderError, setSenderError] = useState<string | null>(null)
  const [senderPending, startSenderTransition] = useTransition()

  // Edit sender state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editName, setEditName] = useState('')
  const [editPending, startEditTransition] = useTransition()

  // ── Integration actions ──────────────────────────────────────────────────

  const handleConnect = () => {
    setIntError(null)
    setIntSuccess(null)
    if (!emailInput.trim()) { setIntError('Email address is required'); return }
    if (!passwordInput.trim()) { setIntError('App password is required'); return }

    startIntTransition(async () => {
      try {
        const res = await fetch('/api/inbox/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email_address: emailInput.trim(), app_password: passwordInput }),
        })
        const json = await res.json()
        if (!res.ok) { setIntError(json.error ?? 'Failed to connect'); return }
        setIntegration(json.integration)
        setPasswordInput('')
        setIntSuccess('Email account connected successfully')
      } catch (e) {
        setIntError((e as Error).message)
      }
    })
  }

  const handleDisconnect = async () => {
    if (!await confirmDialog({
      title: 'Disconnect this mailbox?',
      message: 'Vaultr will stop fetching mail from this account. Monitored senders stay configured — you can reconnect later.',
      confirmLabel: 'Disconnect',
    })) return
    setIntError(null)
    setIntSuccess(null)
    startIntTransition(async () => {
      try {
        const res = await fetch('/api/inbox/integrations', { method: 'DELETE' })
        if (!res.ok) {
          const json = await res.json()
          setIntError(json.error ?? 'Failed to disconnect')
          return
        }
        setIntegration(null)
        setEmailInput('')
        setPasswordInput('')
        setIntSuccess('Email account disconnected')
      } catch (e) {
        setIntError((e as Error).message)
      }
    })
  }

  const handleCheckNow = () => {
    setCheckResult(null)
    setCheckError(null)
    startCheckTransition(async () => {
      try {
        const res = await fetch('/api/inbox/check', { method: 'POST' })
        const json = await res.json()
        if (!res.ok) { setCheckError(json.error ?? 'Failed to check mailbox'); return }
        setCheckResult(json.result)
        // Refresh integration to update last_checked_at
        const intRes = await fetch('/api/inbox/integrations')
        const intJson = await intRes.json()
        if (intJson.integration) setIntegration(intJson.integration)
      } catch (e) {
        setCheckError((e as Error).message)
      }
    })
  }

  // ── Sender actions ──────────────────────────────────────────────────────

  const handleAddSender = () => {
    setSenderError(null)
    if (!newSenderEmail.trim()) { setSenderError('Email address is required'); return }

    startSenderTransition(async () => {
      try {
        const res = await fetch('/api/inbox/senders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newSenderEmail.trim(), name: newSenderName.trim() || undefined }),
        })
        const json = await res.json()
        if (!res.ok) { setSenderError(json.error ?? 'Failed to add sender'); return }
        setSenders(prev => [json.sender, ...prev])
        setNewSenderEmail('')
        setNewSenderName('')
      } catch (e) {
        setSenderError((e as Error).message)
      }
    })
  }

  const handleToggleSender = (id: string, currentActive: boolean) => {
    // Optimistic
    setSenders(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentActive } : s))
    fetch(`/api/inbox/senders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentActive }),
    }).then(res => {
      if (!res.ok) setSenders(prev => prev.map(s => s.id === id ? { ...s, is_active: currentActive } : s))
    }).catch(() => {
      setSenders(prev => prev.map(s => s.id === id ? { ...s, is_active: currentActive } : s))
    })
  }

  const handleDeleteSender = async (id: string) => {
    if (!await confirmDialog({
      title: 'Remove this sender?',
      message: 'Future fetches won\'t pull mail from this address. Already-imported items stay.',
      confirmLabel: 'Remove',
    })) return
    setSenders(prev => prev.filter(s => s.id !== id))
    fetch(`/api/inbox/senders/${id}`, { method: 'DELETE' }).then(res => {
      if (!res.ok) {
        // On error we can't easily restore, just show nothing
      }
    })
  }

  const startEdit = (sender: Sender) => {
    setEditingId(sender.id)
    setEditEmail(sender.email)
    setEditName(sender.name ?? '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditEmail('')
    setEditName('')
  }

  const saveEdit = (id: string) => {
    startEditTransition(async () => {
      try {
        const res = await fetch(`/api/inbox/senders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: editEmail.trim(), name: editName.trim() || null }),
        })
        const json = await res.json()
        if (!res.ok) return
        setSenders(prev => prev.map(s => s.id === id ? json.sender : s))
        cancelEdit()
      } catch { /* ignore */ }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page header */}
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Email Setup</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Connect your Yahoo Mail inbox to automatically receive and review invoice documents
          </p>
        </div>
      )}

      {/* ── Section 1: Email Integration ── */}
      <div
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--brand-light)' }}
          >
            <Mail className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Email Integration</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Yahoo Mail via IMAP App Password</p>
          </div>
          {integration && (
            <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium   border border-[var(--border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--income)]" />
              Connected
            </span>
          )}
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Success/Error banners */}
          {intSuccess && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl  border border-[var(--border)]">
              <CheckCircle2 className="w-4 h-4  shrink-0" />
              <p className="text-sm ">{intSuccess}</p>
              <button onClick={() => setIntSuccess(null)} className="ml-auto   text-lg leading-none">&times;</button>
            </div>
          )}
          {intError && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl  border border-[var(--border)]">
              <AlertTriangle className="w-4 h-4  shrink-0" />
              <p className="text-sm ">{intError}</p>
              <button onClick={() => setIntError(null)} className="ml-auto   text-lg leading-none">&times;</button>
            </div>
          )}

          {/* Current integration info */}
          {integration ? (
            <div className="space-y-4">
              <div
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl"
                style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{integration.email_address}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Provider: {integration.provider.charAt(0).toUpperCase() + integration.provider.slice(1)}
                    {integration.last_checked_at && (
                      <> &bull; Last checked: {format(parseISO(integration.last_checked_at), 'dd MMM yyyy, HH:mm')}</>
                    )}
                    {!integration.last_checked_at && <> &bull; Never checked</>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCheckNow}
                    disabled={checkPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkPending ? 'animate-spin' : ''}`} />
                    {checkPending ? 'Checking...' : 'Check Now'}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={intPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all disabled:opacity-60  hover:border-[var(--border)] "
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Check result */}
              {checkResult && (
                <div className="flex items-start gap-3 p-4 rounded-xl  border border-[var(--border)]">
                  <CheckCircle2 className="w-4 h-4  shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold ">Mailbox checked</p>
                    <p className="text-sm  mt-0.5">
                      {checkResult.checked} emails scanned &bull; {checkResult.added} new documents &bull; {checkResult.duplicates} duplicates
                    </p>
                    {checkResult.errors.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {checkResult.errors.map((e, i) => (
                          <li key={i} className="text-xs ">{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button onClick={() => setCheckResult(null)} className="  text-lg leading-none">&times;</button>
                </div>
              )}
              {checkError && (
                <div className="flex items-start gap-3 p-4 rounded-xl  border border-[var(--border)]">
                  <AlertTriangle className="w-4 h-4  shrink-0 mt-0.5" />
                  <p className="text-sm ">{checkError}</p>
                  <button onClick={() => setCheckError(null)} className="ml-auto   text-lg leading-none">&times;</button>
                </div>
              )}

              {/* Update credentials */}
              <div>
                <p className="text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>Update credentials</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Email Address"
                    value={emailInput}
                    onChange={setEmailInput}
                    placeholder="yourname@yahoo.com"
                    type="email"
                  />
                  <Field
                    label="App Password"
                    value={passwordInput}
                    onChange={setPasswordInput}
                    placeholder="Enter new app password"
                    type="password"
                    hint="Leave blank to keep current password"
                  />
                </div>
                <button
                  onClick={handleConnect}
                  disabled={intPending || !passwordInput.trim()}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  <Link2 className="w-4 h-4" />
                  {intPending ? 'Saving...' : 'Update Connection'}
                </button>
              </div>
            </div>
          ) : (
            /* Connect form */
            <div className="space-y-4">
              {/* Instructions */}
              <div
                className="p-4 rounded-xl text-sm space-y-2"
                style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <p className="font-semibold" style={{ color: 'var(--text)' }}>How to get a Yahoo App Password</p>
                <ol className="list-decimal list-inside space-y-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <li>Sign in to your Yahoo account and go to Account Security</li>
                  <li>Enable two-step verification if not already enabled</li>
                  <li>Under "App passwords", click "Generate app password"</li>
                  <li>Select "Other app" and enter "InEx Vaultr"</li>
                  <li>Copy the generated password and paste it below</li>
                </ol>
                <a
                  href="https://login.yahoo.com/account/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium mt-1"
                  style={{ color: 'var(--brand)' }}
                >
                  Open Yahoo Account Security <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Yahoo Email Address"
                  value={emailInput}
                  onChange={setEmailInput}
                  placeholder="yourname@yahoo.com"
                  type="email"
                />
                <Field
                  label="App Password"
                  value={passwordInput}
                  onChange={setPasswordInput}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  type="password"
                  hint="This is NOT your Yahoo login password — it is an app-specific password"
                />
              </div>

              <button
                onClick={handleConnect}
                disabled={intPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                <Link2 className="w-4 h-4" />
                {intPending ? 'Connecting...' : 'Connect Yahoo Mail'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Monitored Senders ── */}
      <div
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--brand-light)' }}
          >
            <Mail className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Monitored Senders</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Only emails from these senders will be processed</p>
          </div>
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            {senders.filter(s => s.is_active).length} active
          </span>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Warning if no active senders */}
          {senders.filter(s => s.is_active).length === 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--accent-light)] border border-[var(--border)]">
              <AlertTriangle className="w-4 h-4 text-[var(--amber)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--amber)]">
                No active senders configured. Add at least one sender email address to start monitoring emails.
              </p>
            </div>
          )}

          {/* Senders list */}
          {senders.length > 0 && (
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--border)' }}
            >
              {senders.map((sender, idx) => (
                <div
                  key={sender.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderBottom: idx < senders.length - 1 ? '1px solid var(--border)' : undefined,
                    backgroundColor: editingId === sender.id ? 'var(--surface-2)' : undefined,
                  }}
                >
                  {editingId === sender.id ? (
                    /* Edit mode */
                    <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        placeholder="email@example.com"
                      />
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        placeholder="Display name (optional)"
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => saveEdit(sender.id)}
                          disabled={editPending}
                          className="p-1.5 rounded-lg   border border-[var(--border)] hover:bg-[var(--brand-light)] transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-2)]"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${!sender.is_active ? 'opacity-50' : ''}`}
                          style={{ color: 'var(--text)' }}
                        >
                          {sender.email}
                        </p>
                        {sender.name && (
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{sender.name}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Active/inactive badge */}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            sender.is_active
                              ? '  border border-[var(--border)]'
                              : '  border border-[var(--border)]'
                          }`}
                        >
                          {sender.is_active ? 'Active' : 'Inactive'}
                        </span>

                        {/* Toggle */}
                        <button
                          onClick={() => handleToggleSender(sender.id, sender.is_active)}
                          title={sender.is_active ? 'Deactivate sender' : 'Activate sender'}
                          className="p-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-2)]"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                          {sender.is_active
                            ? <ToggleRight className="w-4 h-4 " />
                            : <ToggleLeft className="w-4 h-4" />}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => startEdit(sender)}
                          className="p-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-2)]"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          title="Edit sender"
                        >
                          <PencilLine className="w-4 h-4" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteSender(sender.id)}
                          className="p-1.5 rounded-lg border transition-colors  hover:border-[var(--border)] "
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          title="Delete sender"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add sender form */}
          <div
            className="rounded-xl border p-4 space-y-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Add Sender</p>
            {senderError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg  border border-[var(--border)]">
                <AlertTriangle className="w-4 h-4  shrink-0" />
                <p className="text-sm ">{senderError}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                value={newSenderEmail}
                onChange={e => setNewSenderEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSender() }}
                placeholder="invoices@supplier.com"
                className="px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
              <input
                type="text"
                value={newSenderName}
                onChange={e => setNewSenderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSender() }}
                placeholder="Supplier Name (optional)"
                className="px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>
            <button
              onClick={handleAddSender}
              disabled={senderPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              <Plus className="w-4 h-4" />
              {senderPending ? 'Adding...' : 'Add Sender'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
