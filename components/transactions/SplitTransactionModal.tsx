'use client'

import { useMemo, useState } from 'react'
import { X, Plus, Trash2, Loader2, Split } from 'lucide-react'
import type { Transaction, Account, Category } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { notify } from '@/components/shared/Toast'

type PartType = 'expense' | 'income' | 'transfer'
interface Part { key: number; type: PartType; amount: string; categoryId: string; toAccountId: string; name: string }

let seq = 0
const r2 = (n: number) => Math.round(n * 100) / 100

interface Props {
  transaction: Transaction
  accounts: Account[]
  categories: Category[]
  onDone: () => void      // original replaced — refresh the list
  onClose: () => void
}

/** Split one transaction into any number of parts. Parts can mix expense,
 *  income and transfer, and must add up to the original amount. */
export default function SplitTransactionModal({ transaction: tx, accounts, categories, onDone, onClose }: Props) {
  const total = r2(Number(tx.amount))
  const [parts, setParts] = useState<Part[]>(() => ([
    { key: ++seq, type: (tx.type as PartType) ?? 'expense', amount: String(total), categoryId: tx.category_id ?? '', toAccountId: tx.to_account_id ?? '', name: tx.name ?? '' },
    { key: ++seq, type: (tx.type as PartType) ?? 'expense', amount: '', categoryId: '', toAccountId: '', name: '' },
  ]))
  const [saving, setSaving] = useState(false)

  const set = (key: number, patch: Partial<Part>) => setParts(p => p.map(x => x.key === key ? { ...x, ...patch } : x))
  const add = () => setParts(p => [...p, { key: ++seq, type: 'expense', amount: '', categoryId: '', toAccountId: '', name: '' }])
  const remove = (key: number) => setParts(p => p.length > 2 ? p.filter(x => x.key !== key) : p)

  const sum = useMemo(() => r2(parts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)), [parts])
  const remaining = r2(total - sum)
  const balanced = Math.abs(remaining) < 0.01

  const invalid = parts.some(p =>
    !(parseFloat(p.amount) > 0) ||
    (p.type === 'transfer' && (!p.toAccountId || p.toAccountId === tx.account_id))
  )

  async function save() {
    if (!balanced || invalid) return
    setSaving(true)
    try {
      const res = await fetch(`/api/transactions/${tx.id}/split`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splits: parts.map(p => ({
            type: p.type,
            amount: parseFloat(p.amount),
            categoryId: p.type === 'transfer' ? null : (p.categoryId || null),
            toAccountId: p.type === 'transfer' ? p.toAccountId : null,
            name: p.name || null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not split', 'error'); return }
      notify(`Split into ${data.count} transactions ✓`, 'success')
      onDone()
    } finally { setSaving(false) }
  }

  const iCls = 'px-2 py-1.5 rounded-lg border text-sm w-full'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const cats = (t: PartType) => categories.filter(c => c.type === t)

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92dvh]" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="font-extrabold flex items-center gap-2" style={{ color: 'var(--text)' }}><Split className="w-4 h-4" /> Split transaction</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tx.name || 'Transaction'} · {formatCurrency(total)} — parts can mix expenses, income and transfers, and must add up to the total.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-2">
          {parts.map(p => (
            <div key={p.key} className="grid gap-2 items-center" style={{ gridTemplateColumns: '110px 110px 1fr 1fr 34px' }}>
              <select value={p.type} onChange={e => set(p.key, { type: e.target.value as PartType, categoryId: '', toAccountId: '' })} className={iCls} style={iStyle}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>

              <input value={p.amount} onChange={e => set(p.key, { amount: e.target.value })} inputMode="decimal" placeholder="0.00" className={iCls + ' text-right'} style={iStyle} />

              {p.type === 'transfer' ? (
                <select value={p.toAccountId} onChange={e => set(p.key, { toAccountId: e.target.value })} className={iCls} style={iStyle}>
                  <option value="">To account…</option>
                  {accounts.filter(a => a.id !== tx.account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              ) : (
                <select value={p.categoryId} onChange={e => set(p.key, { categoryId: e.target.value })} className={iCls} style={iStyle}>
                  <option value="">Category…</option>
                  {cats(p.type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              <input value={p.name} onChange={e => set(p.key, { name: e.target.value })} placeholder="Description (optional)" className={iCls} style={iStyle} />

              <button onClick={() => remove(p.key)} disabled={parts.length <= 2} className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30" style={{ background: 'var(--surface-2)' }}>
                <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
              </button>
            </div>
          ))}

          <button onClick={add} className="flex items-center gap-1.5 text-[12px] font-bold mt-1" style={{ color: 'var(--brand)' }}><Plus className="w-3.5 h-3.5" /> Add part</button>
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-3 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Allocated </span>
            <b style={{ color: 'var(--text)' }}>{formatCurrency(sum)}</b>
            <span style={{ color: 'var(--text-muted)' }}> of {formatCurrency(total)} · </span>
            <b style={{ color: balanced ? 'var(--income)' : 'var(--expense)' }}>
              {balanced ? 'Balanced' : `${remaining > 0 ? 'Remaining' : 'Over by'} ${formatCurrency(Math.abs(remaining))}`}
            </b>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
            <button onClick={save} disabled={!balanced || invalid || saving} className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5" style={{ background: 'var(--brand)' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Splitting…' : 'Split transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
