'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, ArrowLeftRight, TrendingUp, TrendingDown, Filter, X, CheckSquare, Square, Trash2 } from 'lucide-react'
import type { Transaction, Account, Category, Payee } from '@/lib/types'
import { formatCurrency, getRelativeDate, accountGroupRank } from '@/lib/utils'
import TransactionItem from './TransactionItem'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

const TransactionForm = dynamic(() => import('./TransactionForm'), { ssr: false })

interface Props {
  initialTransactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  payees: Pick<Payee, 'id' | 'name'>[]
  totalCredits: number
  totalDebits: number
  hideHeader?: boolean
}

type FilterType = 'all' | 'expense' | 'income' | 'transfer'

const DELETED_KEY = 'inex-deleted-tx-ids'

function getDeletedIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DELETED_KEY) || '[]') } catch { return [] }
}
function addDeletedId(id: string) {
  try {
    const ids = getDeletedIds()
    if (!ids.includes(id)) sessionStorage.setItem(DELETED_KEY, JSON.stringify([...ids, id]))
  } catch {}
}

export default function TransactionsClient({ initialTransactions, accounts, categories, payees, totalCredits, totalDebits, hideHeader = false }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const deleted = getDeletedIds()
    return deleted.length ? initialTransactions.filter(t => !deleted.includes(t.id)) : initialTransactions
  })
  const [showForm, setShowForm] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [accountFilter, setAccountFilter] = useState(() => searchParams.get('account') ?? 'all')
  // Advanced filters — pre-fill from URL so deep-links (e.g. from the dashboard
  // ring chart) land with the filter already applied.
  const initPayee    = searchParams.get('payee')    ?? ''
  const initCategory = searchParams.get('category') ?? ''
  const initFrom     = searchParams.get('from')     ?? ''
  const initTo       = searchParams.get('to')       ?? ''
  const [showFilters, setShowFilters] = useState(
    !!(initPayee || initCategory || initFrom || initTo)
  )
  const [filterPayee, setFilterPayee]     = useState<string>(initPayee)
  const [filterCategory, setFilterCategory] = useState<string>(initCategory)
  const [dateFrom, setDateFrom] = useState<string>(initFrom)
  const [dateTo, setDateTo]     = useState<string>(initTo)
  // Multi-select
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const deleted = getDeletedIds()
    setTransactions(
      deleted.length ? initialTransactions.filter(t => !deleted.includes(t.id)) : initialTransactions
    )
  }, [initialTransactions])

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (filter !== 'all' && tx.type !== filter) return false
      if (accountFilter !== 'all' && tx.account_id !== accountFilter && tx.to_account_id !== accountFilter) return false
      if (filterPayee && tx.payee_id !== filterPayee) return false
      if (filterCategory && tx.category_id !== filterCategory) return false
      if (dateFrom && tx.date < dateFrom) return false
      if (dateTo && tx.date > dateTo) return false
      if (search) {
        const q = search.toLowerCase()
        const matchName = tx.name?.toLowerCase().includes(q)
        const matchNotes = tx.notes?.toLowerCase().includes(q)
        const matchCategory = (tx.category as Category | undefined)?.name?.toLowerCase().includes(q)
        const matchAccount = (tx.account as Account | undefined)?.name?.toLowerCase().includes(q)
        const matchPayee = (tx.payee as Payee | undefined)?.name?.toLowerCase().includes(q)
        if (!matchName && !matchNotes && !matchCategory && !matchAccount && !matchPayee) return false
      }
      return true
    })
  }, [transactions, filter, accountFilter, filterPayee, filterCategory, dateFrom, dateTo, search])

  const hasAdvFilters = !!(filterPayee || filterCategory || dateFrom || dateTo)
  const clearAdvFilters = () => {
    setFilterPayee(''); setFilterCategory(''); setDateFrom(''); setDateTo('')
  }

  // Selection helpers
  const toggleSelected = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectAllVisible = useCallback(() => {
    setSelected(prev => {
      const all = filtered.map(t => t.id)
      const allSelected = all.length > 0 && all.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        for (const id of all) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of all) next.add(id)
      return next
    })
  }, [filtered])
  const clearSelection = () => setSelected(new Set())

  async function handleBulkDelete() {
    if (selected.size === 0) return
    if (!await confirmDialog({
      title: `Delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}?`,
      message: 'This cannot be undone. Linked drafts will be unlinked.',
      confirmLabel: 'Delete all',
    })) return
    setDeleting(true)
    const ids = Array.from(selected)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('transactions').delete().in('id', ids)
      if (error) {
        notify(error.message, 'error')
        return
      }
      // Optimistically remove and persist to the deleted-ids guard
      ids.forEach(addDeletedId)
      setTransactions(prev => prev.filter(t => !selected.has(t.id)))
      setSelected(new Set())
      setSelectMode(false)
      notify(`${ids.length} transaction${ids.length === 1 ? '' : 's'} deleted`, 'success')
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    filtered.forEach(tx => {
      const key = tx.date
      if (!groups[key]) groups[key] = []
      groups[key].push(tx)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const handleSaved = useCallback((tx: Transaction) => {
    setTransactions(prev => {
      const exists = prev.find(t => t.id === tx.id)
      if (exists) return prev.map(t => t.id === tx.id ? tx : t)
      return [tx, ...prev]
    })
    setShowForm(false)
    setEditTx(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    addDeletedId(id)
    setTransactions(prev => prev.filter(t => t.id !== id))
    router.refresh()
  }, [router])

  const handleEdit = useCallback((tx: Transaction) => {
    setEditTx(tx)
    setShowForm(true)
  }, [])

  return (
    <div className={hideHeader ? '' : 'max-w-2xl mx-auto px-4 py-6'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        {!hideHeader ? (
          <div>
            <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
            <p className="text-sm text-gray-500">{filtered.length} records</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{filtered.length} records</p>
        )}
        <button
          onClick={() => { setEditTx(null); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-brand-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Summary chips — all-time totals across every transaction */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-green-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />
          <div>
            <p className="text-[10px] text-green-600">Credits</p>
            <p className="text-sm font-bold text-green-700">{formatCurrency(totalCredits)}</p>
          </div>
        </div>
        <div className="flex-1 bg-red-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
          <div>
            <p className="text-[10px] text-red-600">Debits</p>
            <p className="text-sm font-bold text-red-700">{formatCurrency(totalDebits)}</p>
          </div>
        </div>
      </div>

      {/* Search + Filter + Select */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <button
          onClick={() => setShowFilters(s => !s)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium shrink-0"
          style={{
            background: hasAdvFilters ? 'rgba(42,122,80,0.08)' : 'var(--surface)',
            borderColor: hasAdvFilters ? 'var(--brand)' : 'var(--border)',
            color: hasAdvFilters ? 'var(--brand)' : 'var(--text-muted)',
          }}
        >
          <Filter className="w-3.5 h-3.5" />
          {hasAdvFilters ? 'Filtered' : 'Filter'}
        </button>
        <button
          onClick={() => { setSelectMode(s => !s); setSelected(new Set()) }}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium shrink-0"
          style={{
            background: selectMode ? 'rgba(42,122,80,0.08)' : 'var(--surface)',
            borderColor: selectMode ? 'var(--brand)' : 'var(--border)',
            color: selectMode ? 'var(--brand)' : 'var(--text-muted)',
          }}
        >
          {selectMode ? <X className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
          {selectMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      {/* Quick type / account filter row */}
      <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
        {(['all', 'expense', 'income', 'transfer'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
              filter === f
                ? f === 'expense' ? 'bg-red-500 text-white'
                  : f === 'income' ? 'bg-green-500 text-white'
                  : f === 'transfer' ? 'bg-blue-500 text-white'
                  : 'bg-brand-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-gray-200 text-gray-600"
        >
          <option value="all">All Accounts</option>
          {[...accounts].sort((a, b) =>
            (accountGroupRank(a.type, a.custom_type_name) - accountGroupRank(b.type, b.custom_type_name))
            || a.name.localeCompare(b.name)
          ).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="rounded-xl border p-3 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Payee</label>
            <select value={filterPayee} onChange={e => setFilterPayee(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="">All payees</option>
              {payees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="">All categories</option>
              {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
          {hasAdvFilters && (
            <div className="sm:col-span-2 flex justify-end">
              <button onClick={clearAdvFilters} className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <X className="w-3 h-3" /> Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Select-all row + bulk delete bar */}
      {selectMode && (
        <div className="sticky top-3 z-10 mb-3 flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 shadow-sm"
          style={{ background: 'var(--surface)', borderColor: selected.size > 0 ? 'var(--brand)' : 'var(--border)' }}>
          <button onClick={selectAllVisible} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text)' }}>
            {selected.size === filtered.length && filtered.length > 0
              ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              : <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            }
            <span>{selected.size === 0 ? `Select all (${filtered.length})` : `${selected.size} selected`}</span>
          </button>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={clearSelection} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Transaction List */}
      {grouped.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ArrowLeftRight className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No transactions found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search || filter !== 'all' ? 'Try changing your filters' : 'Add your first transaction'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, txs]) => (
            <div key={date}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500">{getRelativeDate(date)}</p>
                <p className="text-xs text-gray-400">
                  {txs.filter(t => t.type === 'income').length > 0 && (
                    <span className="text-green-500 mr-2">
                      +{formatCurrency(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0))}
                    </span>
                  )}
                  {txs.filter(t => t.type === 'expense').length > 0 && (
                    <span className="text-red-500">
                      -{formatCurrency(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))}
                    </span>
                  )}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                {txs.map((tx, i) => (
                  selectMode ? (
                    <div key={tx.id} className="flex items-stretch">
                      <button
                        onClick={() => toggleSelected(tx.id)}
                        className="flex items-center justify-center px-3 shrink-0 border-r"
                        style={{ borderColor: 'var(--border)' }}
                        aria-label={selected.has(tx.id) ? 'Deselect' : 'Select'}
                      >
                        {selected.has(tx.id)
                          ? <CheckSquare className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                          : <Square className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <TransactionItem
                          transaction={tx}
                          isFirst={i === 0}
                          isLast={i === txs.length - 1}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          contextAccountId={accountFilter !== 'all' ? accountFilter : undefined}
                        />
                      </div>
                    </div>
                  ) : (
                    <TransactionItem
                      key={tx.id}
                      transaction={tx}
                      isFirst={i === 0}
                      isLast={i === txs.length - 1}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      contextAccountId={accountFilter !== 'all' ? accountFilter : undefined}
                    />
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TransactionForm
          transaction={editTx}
          accounts={accounts}
          categories={categories}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditTx(null) }}
        />
      )}
    </div>
  )
}
