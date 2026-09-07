'use client'

// A company's bank accounts.
//
// A company can hold several — a domestic current account, an export account,
// an EEFC account — and which one appears on a document is chosen per document.
// One is marked default and is used when a document does not name one.

import { useCallback, useEffect, useState } from 'react'
import { Plus, Star, Trash2, Pencil, X } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import type { CompanyBankAccount } from '@/lib/companies/bankAccounts'
import { accountLabel } from '@/lib/companies/bankAccounts'

type Draft = Partial<CompanyBankAccount> & { id?: string }

export default function BankAccountsPanel({ companyId }: { companyId: string }) {
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([])
  const [editing, setEditing] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/companies/bank-accounts?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) setAccounts(body.accounts ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function save(draft: Draft) {
    const isNew = !draft.id
    const res = await fetch('/api/companies/bank-accounts', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, company_id: companyId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { notify(body?.error ?? 'Could not save the account', 'error'); return }
    setEditing(null)
    await load()
    notify(isNew ? 'Bank account added' : 'Bank account updated', 'success')
  }

  async function makeDefault(id: string) {
    const res = await fetch('/api/companies/bank-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_default: true }),
    })
    if (!res.ok) { notify('Could not change the default', 'error'); return }
    await load()
  }

  async function remove(a: CompanyBankAccount) {
    const ok = await confirmDialog(
      `Delete ${accountLabel(a)}? Documents already issued with it will fall back to this company's default account.\n\n`
      + 'To keep old documents exactly as they were, mark it inactive instead — it leaves the picker but stays on its history.',
    )
    if (!ok) return
    const res = await fetch(`/api/companies/bank-accounts?id=${a.id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Could not delete', 'error'); return }
    await load()
    notify('Bank account deleted')
  }

  if (loading) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Bank accounts</p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            The default is used on documents that do not name one.
          </p>
        </div>
        <button type="button" onClick={() => setEditing({})}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Plus className="w-3.5 h-3.5" /> Add account
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-xs py-3" style={{ color: 'var(--text-faint)' }}>
          No bank accounts yet. Documents from this company will print no bank details
          until one is added — deliberately, so an invoice never shows another
          company&apos;s account.
        </p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {accounts.map((a, i) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: a.is_active ? 1 : 0.55 }}>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  {accountLabel(a)}
                  {a.is_default && (
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                      style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }}>
                      Default
                    </span>
                  )}
                  {!a.is_active && (
                    <span className="text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>inactive</span>
                  )}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {[a.account_number, a.ifsc].filter(Boolean).join(' · ') || 'No account number on file'}
                </p>
              </div>
              {!a.is_default && a.is_active && (
                <button type="button" onClick={() => makeDefault(a.id)} title="Make default"
                  className="p-1.5" style={{ color: 'var(--text-faint)' }}><Star className="w-3.5 h-3.5" /></button>
              )}
              <button type="button" onClick={() => setEditing(a)} className="p-1.5" style={{ color: 'var(--text-faint)' }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => remove(a)} className="p-1.5" style={{ color: 'var(--expense)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && <AccountForm draft={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function AccountForm({
  draft, onCancel, onSave,
}: { draft: Draft; onCancel: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(draft)
  const set = (k: keyof CompanyBankAccount, v: unknown) => setD(p => ({ ...p, [k]: v }))
  const input = 'w-full px-3 py-2 rounded-lg text-sm outline-none'
  const style = { background: 'var(--surface-2, var(--bg))', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onCancel}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-2.5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>
            {d.id ? 'Edit bank account' : 'Add bank account'}
          </p>
          <button type="button" onClick={onCancel} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        <input className={input} style={style} placeholder="Label — e.g. HDFC Current, IOB Exports"
          value={d.label ?? ''} onChange={e => set('label', e.target.value)} />
        <input className={input} style={style} placeholder="Bank name"
          value={d.bank_name ?? ''} onChange={e => set('bank_name', e.target.value)} />
        <input className={input} style={style} placeholder="Branch"
          value={d.branch ?? ''} onChange={e => set('branch', e.target.value)} />
        <input className={input} style={style} placeholder="Account name"
          value={d.account_name ?? ''} onChange={e => set('account_name', e.target.value)} />
        <input className={input} style={style} placeholder="Account number"
          value={d.account_number ?? ''} onChange={e => set('account_number', e.target.value)} />
        <div className="grid grid-cols-2 gap-2.5">
          <input className={input} style={style} placeholder="IFSC"
            value={d.ifsc ?? ''} onChange={e => set('ifsc', e.target.value.toUpperCase())} />
          <input className={input} style={style} placeholder="SWIFT (optional)"
            value={d.swift_code ?? ''} onChange={e => set('swift_code', e.target.value.toUpperCase())} />
        </div>

        <label className="flex items-center gap-2 pt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={Boolean(d.is_default)} onChange={e => set('is_default', e.target.checked)} />
          Use this account by default
        </label>
        {d.id && (
          <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={d.is_active !== false} onChange={e => set('is_active', e.target.checked)} />
            Active — appears in the picker on new documents
          </label>
        )}

        <button type="button" onClick={() => onSave(d)}
          className="w-full py-2.5 rounded-xl text-sm font-extrabold text-white mt-1"
          style={{ background: 'var(--brand)' }}>
          {d.id ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </div>
  )
}
