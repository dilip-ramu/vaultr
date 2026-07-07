'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RefreshCw, Check, X, Inbox, Plus, Trash2, ChevronDown, Paperclip, Mail, ArrowLeftRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

interface Draft {
  id: string
  merchant: string | null
  name: string | null
  amount: number | null
  currency: string
  direction: 'debit' | 'credit'
  txn_date: string | null
  partial_account: string | null
  confidence: number | null
  matched_account_id: string | null
  category_id: string | null
  payee_id: string | null
  status: string
  sender_email: string | null
  // v68 — attachment staged from the bank-alert email. Rendered as a
  // Paperclip pin on the draft row; carried onto the transaction on approve.
  attachment_name:         string | null
  attachment_path:         string | null
  attachment_size:         number | null
  attachment_content_type: string | null
}
interface Account { id: string; name: string; type: string; custom_type_name?: string | null }
interface Category { id: string; name: string; type: string }
interface Payee { id: string; name: string }
interface Sender { id: string; email: string; name: string | null; is_active: boolean; default_account_id: string | null }

interface Props {
  drafts: Draft[]
  accounts: Account[]
  categories: Category[]
  payees: Payee[]
  senders: Sender[]
  integration: { email_address: string; last_checked_at: string | null } | null
  hideHeader?: boolean
}

const fmt = (n: number) => formatCurrency(n)

export default function TransactionInboxClient({ drafts: initial, accounts, categories, payees, senders: initialSenders, integration, hideHeader = false }: Props) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[]>(initial)
  const [senders, setSenders] = useState<Sender[]>(initialSenders)
  const [fetching, setFetching] = useState(false)
  const [showSenders, setShowSenders] = useState(false)
  const [newSender, setNewSender] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const patch = (id: string, fields: Partial<Draft>) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...fields } : d))
    fetch(`/api/txn-inbox/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    })
  }

  async function fetchNow() {
    if (!integration) { notify('Connect your email first under Setup → Email.', 'error'); return }
    if (senders.length === 0) { notify('Add at least one bank-alert sender below first.', 'info'); setShowSenders(true); return }
    setFetching(true)
    notify('Fetching new alerts… this runs in the background, refresh in ~20s.', 'info')
    await fetch('/api/txn-inbox/check', { method: 'POST' })
    setTimeout(() => { setFetching(false); router.refresh() }, 18000)
  }

  // Clear pending/dismissed drafts and re-pull their emails (for tuning parsers)
  async function rescan() {
    if (!await confirmDialog({
      title: 'Re-scan emails?',
      message: 'Clears all un-approved drafts (including dismissed ones) and re-fetches them from email. Approved transactions are untouched. Useful after a parser update.',
      confirmLabel: 'Clear & re-fetch',
    })) return
    setFetching(true)
    await fetch('/api/txn-inbox/rescan', { method: 'POST' })
    setDrafts([])
    await fetch('/api/txn-inbox/check', { method: 'POST' })
    notify('Re-fetching… refresh in ~20s.', 'info')
    setTimeout(() => { setFetching(false); router.refresh() }, 18000)
  }

  async function approve(d: Draft, force = false) {
    if (!d.matched_account_id) { notify('Pick an account for this draft first.', 'info'); return }
    setBusy(d.id)
    const res = await fetch(`/api/txn-inbox/${d.id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
    })
    const data = await res.json()
    setBusy(null)
    if (res.status === 409 && data.duplicate) {
      if (await confirmDialog({ title: 'Possible duplicate', message: data.message + ' Add it anyway as a separate transaction?', confirmLabel: 'Add anyway' })) {
        approve(d, true)
      }
      return
    }
    if (!res.ok) { notify(data.error ?? 'Approve failed', 'error'); return }
    setDrafts(prev => prev.filter(x => x.id !== d.id))
    notify('Added to transactions ✓', 'success')
  }

  async function dismiss(d: Draft) {
    setBusy(d.id)
    await fetch(`/api/txn-inbox/${d.id}`, { method: 'DELETE' })
    setBusy(null)
    setDrafts(prev => prev.filter(x => x.id !== d.id))
  }

  /** v68 — attach a file to a draft manually. On approve, the attachment
   *  follows the transaction (existing approve API already handles the
   *  attachments-table insert). Uploads directly to the private
   *  vaultr-attachments bucket via the Supabase client. */
  async function attachFile(draftId: string, file: File) {
    setBusy(draftId)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { notify('Session expired', 'error'); return }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path     = `${user.id}/txn-drafts/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage
        .from('vaultr-attachments')
        .upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
      if (upErr) { notify(`Upload failed: ${upErr.message}`, 'error'); return }

      const patchFields: Partial<Draft> = {
        attachment_name:         file.name,
        attachment_path:         path,
        attachment_size:         file.size,
        attachment_content_type: file.type || null,
      }
      // Optimistic UI + persist. patch() calls the API which does the DB write.
      patch(draftId, patchFields)
    } finally {
      setBusy(null)
    }
  }

  /** Remove a manually-attached file from a draft. Deletes the storage
   *  object and clears the draft columns. Safe pre-approve; if the user
   *  already approved and the file was linked into `attachments`, that
   *  row survives independently. */
  async function removeAttachment(draftId: string, path: string) {
    if (!await confirmDialog({
      title: 'Remove attachment?',
      message: 'The file will be deleted from storage. This can\'t be undone.',
      confirmLabel: 'Remove',
    })) return
    setBusy(draftId)
    try {
      const supabase = createClient()
      await supabase.storage.from('vaultr-attachments').remove([path])
      patch(draftId, {
        attachment_name: null, attachment_path: null,
        attachment_size: null, attachment_content_type: null,
      })
    } finally {
      setBusy(null)
    }
  }

  async function addSender() {
    const email = newSender.trim().toLowerCase()
    if (!email.includes('@')) { notify('Enter a valid email address.', 'error'); return }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('monitored_senders')
      .insert({ user_id: user!.id, email, kind: 'bank_alert', is_active: true })
      .select('id, email, name, is_active, default_account_id').single()
    if (error) { notify(error.message, 'error'); return }
    setSenders(prev => [...prev, data as Sender])
    setNewSender('')
  }

  async function setSenderAccount(id: string, accountId: string | null) {
    setSenders(prev => prev.map(s => s.id === id ? { ...s, default_account_id: accountId } : s))
    const supabase = createClient()
    await supabase.from('monitored_senders').update({ default_account_id: accountId }).eq('id', id)
  }

  async function removeSender(id: string) {
    const supabase = createClient()
    await supabase.from('monitored_senders').delete().eq('id', id)
    setSenders(prev => prev.filter(s => s.id !== id))
  }

  const expenseCats = categories.filter(c => c.type === 'expense')

  return (
    <div className={hideHeader ? 'w-full space-y-4' : 'w-full px-4 md:px-6 py-6 space-y-4'}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {!hideHeader && <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Fetch Transactions</h1>}
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {drafts.length} draft{drafts.length !== 1 ? 's' : ''} waiting · from bank-alert emails
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={rescan} disabled={fetching} title="Clear un-approved drafts and re-fetch (for tuning)"
            className="text-sm font-bold px-3.5 py-2 rounded-xl disabled:opacity-50" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Re-scan
          </button>
          <button onClick={fetchNow} disabled={fetching} className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} /> {fetching ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-0.5 p-1 rounded-xl" style={{ background: 'var(--surface-2)' }}>
        <Link href="/transactions" className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeftRight className="w-3.5 h-3.5" /> All transactions
        </Link>
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-1.5 rounded-lg" style={{ color: 'var(--text)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
          <Inbox className="w-3.5 h-3.5" /> Fetch
        </span>
      </div>

      {/* Forwarding banner */}
      <button onClick={() => setShowSenders(s => !s)} className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left" style={{ background: 'var(--brand-light)', border: '1px solid color-mix(in srgb, var(--brand) 25%, transparent)' }}>
        <Mail className="w-[18px] h-[18px] shrink-0" style={{ color: 'var(--brand)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-bold truncate" style={{ color: 'var(--text)' }}>
            {integration ? `Forwarding to ${integration.email_address}` : 'Connect your email under Setup → Email'}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {integration?.last_checked_at ? `Last checked ${new Date(integration.last_checked_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not checked yet'} · {senders.length} monitored sender{senders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span className="text-[11.5px] font-bold px-3 py-1.5 rounded-lg shrink-0" style={{ color: 'var(--brand)', background: 'var(--surface)', border: '1px solid var(--border)' }}>Manage senders</span>
      </button>

      {/* Sender management */}
      {showSenders && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Bank-alert sender addresses</p>
          <p className="text-caption">Emails are fetched only from these addresses (inbox and spam). The default account is used when the email has no account number (e.g. Amazon Pay); for banks that show the last-4, leave it on Auto.</p>
          {senders.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{s.email}</span>
              <select value={s.default_account_id ?? ''} onChange={e => setSenderAccount(s.id, e.target.value || null)}
                className="px-2 py-1 rounded-lg text-xs max-w-[40%]" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <option value="">Auto (by last-4)</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button onClick={() => removeSender(s.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newSender} onChange={e => setNewSender(e.target.value)} placeholder="alerts@yourbank.com"
              className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
            <button onClick={addSender} className="btn-brand px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Plus className="w-4 h-4" /> Add</button>
          </div>
          {!integration && <p className="text-xs" style={{ color: 'var(--expense)' }}>No email connected yet — set it up under Setup → Email first.</p>}
        </div>
      )}

      {/* Drafts */}
      {drafts.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No drafts to review. Hit &quot;Check now&quot; to pull in new bank alerts.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map(d => {
            const needsAccount = !d.matched_account_id
            const credit = d.direction === 'credit'
            const color = credit ? 'var(--income)' : 'var(--expense)'
            const acctName = accounts.find(a => a.id === d.matched_account_id)?.name
            const amountStr = d.amount != null ? (d.currency === 'INR' ? fmt(d.amount) : `${d.currency} ${d.amount.toLocaleString('en-IN')}`) : '?'
            return (
              <div key={d.id} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${needsAccount ? 'color-mix(in srgb, var(--amber) 30%, transparent)' : 'var(--border)'}` }}>
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `color-mix(in srgb, ${color} 13%, transparent)` }}>{credit ? '💰' : '🧾'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input value={d.name ?? ''} onChange={e => patch(d.id, { name: e.target.value })} placeholder="Description" className="bg-transparent text-[13.5px] font-bold outline-none min-w-0 flex-1" style={{ color: 'var(--text)' }} />
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ color: needsAccount ? 'var(--amber)' : 'var(--income)', background: needsAccount ? 'var(--accent-light)' : 'color-mix(in srgb, var(--income) 12%, transparent)' }}>{needsAccount ? 'Needs account' : (d.confidence != null ? `${Math.round(d.confidence * 100)}% match` : 'Draft')}</span>
                      {d.attachment_path && <Paperclip className="w-3 h-3 shrink-0" style={{ color: 'var(--text-faint)' }} />}
                    </div>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-faint)' }}>
                      {[acctName || (d.partial_account ? `a/c ••${d.partial_account}` : ''), d.txn_date, d.sender_email ? `from ${d.sender_email}` : ''].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="text-[15px] font-extrabold shrink-0 text-right" style={{ color, width: '96px' }}>{credit ? '+' : '−'}{amountStr}</span>
                  <button onClick={() => approve(d)} disabled={busy === d.id || needsAccount} className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0 disabled:cursor-not-allowed" style={{ background: needsAccount ? 'var(--surface-2)' : 'var(--brand)', color: needsAccount ? 'var(--text-faint)' : '#fff', border: needsAccount ? '1px solid var(--border)' : 'none' }} title="Approve"><Check className="w-4 h-4" /></button>
                  <button onClick={() => dismiss(d)} disabled={busy === d.id} className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }} title="Dismiss"><X className="w-4 h-4" /></button>
                </div>

                {/* pickers */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                  <Select label="Account" value={d.matched_account_id ?? ''} onChange={v => patch(d.id, { matched_account_id: v || null })}
                    options={[{ value: '', label: needsAccount ? '⚠ Pick account' : 'Account' }, ...accounts.map(a => ({ value: a.id, label: a.name }))]} warn={needsAccount} />
                  <Select label="Category" value={d.category_id ?? ''} onChange={v => patch(d.id, { category_id: v || null })}
                    options={[{ value: '', label: 'Category' }, ...expenseCats.map(c => ({ value: c.id, label: c.name }))]} />
                  <Select label="Payee" value={d.payee_id ?? ''} onChange={v => patch(d.id, { payee_id: v || null })}
                    options={[{ value: '', label: 'Payee' }, ...payees.map(p => ({ value: p.id, label: p.name }))]} />
                </div>

                {/* attachment control */}
                <div className="mt-2 text-xs">
                  {d.attachment_path ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }} title={d.attachment_name ?? ''}>
                      <Paperclip className="w-3 h-3" /><span className="truncate max-w-[160px]">{d.attachment_name}</span>
                      <button onClick={() => removeAttachment(d.id, d.attachment_path!)} disabled={busy === d.id} className="hover:opacity-70 disabled:opacity-40"><X className="w-3 h-3" /></button>
                    </span>
                  ) : (
                    <label className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                      <Paperclip className="w-3 h-3" /><span>Attach receipt</span>
                      <input type="file" className="hidden" disabled={busy === d.id} onChange={e => { const file = e.target.files?.[0]; if (file) attachFile(d.id, file); e.currentTarget.value = '' }} />
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Select({ label, value, onChange, options, warn }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; warn?: boolean
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
        className="w-full appearance-none px-3 py-2 pr-7 rounded-lg text-sm"
        style={{ background: 'var(--surface-2)', color: 'var(--text)', border: `1px solid ${warn ? 'rgba(245,158,11,0.5)' : 'var(--border)'}` }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
    </div>
  )
}
