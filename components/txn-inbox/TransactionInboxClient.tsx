'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Check, X, Inbox, AlertTriangle, Plus, Trash2, ChevronDown, Paperclip } from 'lucide-react'
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
    <div className={hideHeader ? 'space-y-4' : 'max-w-3xl mx-auto px-4 py-6 space-y-4'}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {!hideHeader && <Inbox className="w-5 h-5" style={{ color: 'var(--brand)' }} />}
          <div>
            {!hideHeader && <h1 className="text-heading" style={{ color: 'var(--text)' }}>Transaction Inbox</h1>}
            <p className="text-caption">
              {drafts.length} draft{drafts.length !== 1 ? 's' : ''} to review
              {integration?.last_checked_at && ` · last fetched ${new Date(integration.last_checked_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSenders(s => !s)} className="px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            Senders ({senders.length})
          </button>
          <button onClick={rescan} disabled={fetching} title="Clear un-approved drafts and re-fetch (for tuning)"
            className="px-3 py-2 rounded-xl text-sm disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            Re-scan
          </button>
          <button onClick={fetchNow} disabled={fetching} className="btn-brand px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} /> {fetching ? 'Fetching…' : 'Fetch now'}
          </button>
        </div>
      </div>

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
        <div className="card p-10 text-center space-y-2">
          <Inbox className="w-8 h-8 mx-auto" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No drafts to review. Hit &quot;Fetch now&quot; to pull in new bank alerts.</p>
        </div>
      ) : (
        drafts.map(d => {
          const needsAccount = !d.matched_account_id
          return (
            <div key={d.id} className="card p-4 space-y-3" style={needsAccount ? { borderColor: 'rgba(245,158,11,0.4)' } : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    value={d.name ?? ''}
                    onChange={e => patch(d.id, { name: e.target.value })}
                    placeholder="Description"
                    className="w-full bg-transparent text-base font-medium outline-none"
                    style={{ color: 'var(--text)' }}
                  />
                  <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-semibold" style={{ color: d.direction === 'credit' ? 'var(--income)' : 'var(--expense)' }}>
                      {d.direction === 'credit' ? '+' : '−'}{d.currency && d.currency !== 'INR' ? `${d.currency} ` : ''}{d.amount != null ? (d.currency === 'INR' ? fmt(d.amount) : d.amount.toLocaleString('en-IN')) : '?'}
                    </span>
                    {d.txn_date && <span>· {d.txn_date}</span>}
                    {d.partial_account && <span>· a/c ••{d.partial_account}</span>}
                    {d.sender_email && <span className="truncate">· {d.sender_email}</span>}
                    {/* v68 — attachment pin. Click 📎 button to attach; when
                        one exists, shows filename + X to remove. On approve,
                        the file follows into the transaction. */}
                    {d.attachment_path ? (
                      <span
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(59,74,199,0.10)', color: '#3B4AC7' }}
                        title={`${d.attachment_name}${d.attachment_size ? ` (${Math.round(d.attachment_size / 1024)} KB)` : ''}. Follows the transaction on approve.`}
                      >
                        <Paperclip className="w-3 h-3" />
                        <span className="truncate max-w-[140px]">{d.attachment_name}</span>
                        <button
                          onClick={() => removeAttachment(d.id, d.attachment_path!)}
                          disabled={busy === d.id}
                          title="Remove attachment"
                          className="hover:opacity-70 disabled:opacity-40"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : (
                      <label
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                        title="Attach a receipt or invoice — will follow the transaction on approve."
                      >
                        <Paperclip className="w-3 h-3" />
                        <span>Attach</span>
                        <input
                          type="file"
                          className="hidden"
                          disabled={busy === d.id}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) attachFile(d.id, file)
                            // Reset so re-selecting the same file re-fires onChange
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Select label="Account" value={d.matched_account_id ?? ''} onChange={v => patch(d.id, { matched_account_id: v || null })}
                  options={[{ value: '', label: needsAccount ? '⚠ Pick account' : 'Account' }, ...accounts.map(a => ({ value: a.id, label: a.custom_type_name ? `${a.name}` : a.name }))]} warn={needsAccount} />
                <Select label="Category" value={d.category_id ?? ''} onChange={v => patch(d.id, { category_id: v || null })}
                  options={[{ value: '', label: 'Category' }, ...expenseCats.map(c => ({ value: c.id, label: c.name }))]} />
                <Select label="Payee" value={d.payee_id ?? ''} onChange={v => patch(d.id, { payee_id: v || null })}
                  options={[{ value: '', label: 'Payee' }, ...payees.map(p => ({ value: p.id, label: p.name }))]} />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button onClick={() => dismiss(d)} disabled={busy === d.id}
                  className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <X className="w-3.5 h-3.5" /> Dismiss
                </button>
                <button onClick={() => approve(d)} disabled={busy === d.id || needsAccount}
                  className="btn-brand px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 disabled:opacity-40">
                  <Check className="w-3.5 h-3.5" /> {busy === d.id ? 'Adding…' : 'Approve'}
                </button>
              </div>
            </div>
          )
        })
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
