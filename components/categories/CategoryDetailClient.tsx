'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronLeft, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react'
import type { Category, Transaction } from '@/lib/types'
import { getCategoryEmoji } from '@/lib/types'
import { formatCurrency, getRelativeDate } from '@/lib/utils'
import TransactionItem from '@/components/transactions/TransactionItem'

const TransactionForm = dynamic(() => import('@/components/transactions/TransactionForm'), { ssr: false })

type Period = 'this_month' | 'last_month' | '3m' | '6m' | 'this_year' | 'all' | 'custom'

const PERIOD_LABEL: Record<Period, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  this_year: 'This year',
  all: 'All time',
  custom: 'Custom range',
}

function periodBounds(p: Period, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (p === 'all') return { from: null, to: null }
  if (p === 'this_month')  return { from: fmt(new Date(y, m, 1)),     to: fmt(new Date(y, m + 1, 0)) }
  if (p === 'last_month')  return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
  if (p === '3m')          return { from: fmt(new Date(y, m - 2, 1)), to: fmt(new Date(y, m + 1, 0)) }
  if (p === '6m')          return { from: fmt(new Date(y, m - 5, 1)), to: fmt(new Date(y, m + 1, 0)) }
  if (p === 'this_year')   return { from: fmt(new Date(y, 0, 1)),     to: fmt(new Date(y, 11, 31)) }
  return { from: customFrom || null, to: customTo || null }
}

interface Props {
  category: Category
  transactions: Transaction[]
  /** Assets this category's spend could build up on. */
  assets?: { id: string; name: string }[]
}

export default function CategoryDetailClient({ category, transactions: initial, assets = [] }: Props) {
  const router = useRouter()
  const sb = createClient()
  // Which asset this category funds. The one click there is in the whole
  // feature: set it once here, and every transaction afterwards counts towards
  // that asset by itself. See lib/assets/construction.ts.
  const [assetId, setAssetId] = useState<string>((category as { asset_id?: string | null }).asset_id ?? '')
  const [linking, setLinking] = useState(false)

  async function linkAsset(next: string) {
    const was = assetId
    setAssetId(next)
    setLinking(true)
    const { error } = await sb.from('categories').update({ asset_id: next || null }).eq('id', category.id)
    setLinking(false)
    if (error) { setAssetId(was); notify(error.message, 'error'); return }
    notify(next
      ? `Spend here now builds up on ${assets.find(a => a.id === next)?.name ?? 'the asset'}`
      : 'No longer building up on an asset', 'success')
    router.refresh()
  }
  const [transactions, setTransactions] = useState<Transaction[]>(initial)
  const [period, setPeriod] = useState<Period>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { from, to } = useMemo(() => periodBounds(period, customFrom, customTo), [period, customFrom, customTo])

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (from && tx.date < from) return false
      if (to && tx.date > to) return false
      return true
    })
  }, [transactions, from, to])

  // Totals: net spend (expense minus income/refunds) and counts
  const totals = useMemo(() => {
    let expense = 0, income = 0, transfer = 0
    for (const tx of filtered) {
      if (tx.type === 'expense')  expense += Number(tx.amount) || 0
      else if (tx.type === 'income')   income  += Number(tx.amount) || 0
      else                              transfer += Number(tx.amount) || 0
    }
    const net = expense - income
    return { expense, income, transfer, net, count: filtered.length }
  }, [filtered])

  // Group by date for the list
  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    for (const tx of filtered) {
      (groups[tx.date] ??= []).push(tx)
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const handleSaved = useCallback((tx: Transaction) => {
    setTransactions(prev => {
      const exists = prev.find(t => t.id === tx.id)
      if (exists) return prev.map(t => t.id === tx.id ? tx : t)
      // If the saved tx is no longer in this category, drop it
      if (tx.category_id !== category.id) return prev
      return [tx, ...prev]
    })
    setShowForm(false)
    setEditTx(null)
  }, [category.id])

  const handleDelete = useCallback((id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleEdit = useCallback((tx: Transaction) => {
    setEditTx(tx)
    setShowForm(true)
  }, [])

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/categories" className="w-9 h-9 rounded-xl flex items-center justify-center -ml-1" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          {category.avatar_url ? (
            <img src={category.avatar_url} alt={category.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: `${category.color}18` }}
            >
              {getCategoryEmoji(category.icon)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight truncate" style={{ color: 'var(--text)' }}>{category.name}</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {totals.count} transaction{totals.count !== 1 ? 's' : ''} in {PERIOD_LABEL[period].toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      {/* ── Where this spend builds up ────────────────────────────────────
          Set once. Every transaction filed here afterwards counts towards that
          asset with nothing to click, because the asset's figure IS the sum of
          these transactions rather than a copy of them. */}
      {category.type === 'expense' && assets.length > 0 && (
        <div className="rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <span className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Spend here builds up on</span>
          <select value={assetId} disabled={linking} onChange={e => linkAsset(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-[13px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
            <option value="">nothing — it is just an expense</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {assetId && (
            <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
              Every transaction here counts towards it. Fold it onto another asset when the work is done.
            </span>
          )}
        </div>
      )}

      {/* Period filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={period}
          onChange={e => setPeriod(e.target.value as Period)}
          className="px-3 py-2 rounded-xl border text-sm outline-none"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          {(Object.keys(PERIOD_LABEL) as Period[]).map(p => (
            <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
          ))}
        </select>
        {period === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-2 rounded-xl border text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </>
        )}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Net spend</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: totals.net >= 0 ? 'var(--expense)' : 'var(--income)' }}>
            {totals.net >= 0 ? '' : '−'}{formatCurrency(Math.abs(totals.net))}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>expense minus refunds</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <TrendingDown className="w-3 h-3" /> Expense
          </p>
          <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(totals.expense)}</p>
        </div>
        <div className="rounded-2xl p-4 col-span-2 md:col-span-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <TrendingUp className="w-3 h-3" /> Income / refund
          </p>
          <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{formatCurrency(totals.income)}</p>
        </div>
      </div>

      {/* Transaction list, grouped by date */}
      {grouped.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--surface-2)' }}>
            <ArrowLeftRight className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No transactions in this period</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, txs]) => (
            <div key={date}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>{getRelativeDate(date)}</p>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {txs.map((tx, idx) => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    isFirst={idx === 0}
                    isLast={idx === txs.length - 1}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TransactionForm
          transaction={editTx}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditTx(null) }}
        />
      )}
    </div>
  )
}
