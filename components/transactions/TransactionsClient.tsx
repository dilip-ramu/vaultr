'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, Filter, ArrowLeftRight, TrendingUp, TrendingDown } from 'lucide-react'
import type { Transaction, Account, Category } from '@/lib/types'
import { formatCurrency, getRelativeDate } from '@/lib/utils'
import TransactionForm from './TransactionForm'
import TransactionItem from './TransactionItem'

interface Props {
  initialTransactions: Transaction[]
  accounts: Account[]
  categories: Category[]
}

type FilterType = 'all' | 'expense' | 'income' | 'transfer'

const DELETED_KEY = 'vaultr-deleted-tx-ids'

function getDeletedIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DELETED_KEY) || '[]') } catch { return [] }
}
function addDeletedId(id: string) {
  try {
    const ids = getDeletedIds()
    if (!ids.includes(id)) sessionStorage.setItem(DELETED_KEY, JSON.stringify([...ids, id]))
  } catch {}
}

export default function TransactionsClient({ initialTransactions, accounts, categories }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialise filtering out anything already deleted this session
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const deleted = getDeletedIds()
    return deleted.length ? initialTransactions.filter(t => !deleted.includes(t.id)) : initialTransactions
  })
  const [showForm, setShowForm] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  // Pre-filter by account if navigated from account detail page (?account=<id>)
  const [accountFilter, setAccountFilter] = useState(() => searchParams.get('account') ?? 'all')

  // When server delivers fresh data (after router.refresh or back-navigation),
  // re-apply the sessionStorage deleted filter so stale cache never wins.
  useEffect(() => {
    const deleted = getDeletedIds()
    setTransactions(
      deleted.length ? initialTransactions.filter(t => !deleted.includes(t.id)) : initialTransactions
    )
  }, [initialTransactions])

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (filter !== 'all' && tx.type !== filter) return false
      if (accountFilter !== 'all' && tx.account_id !== accountFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchNotes = tx.notes?.toLowerCase().includes(q)
        const matchCategory = (tx.category as Category | undefined)?.name?.toLowerCase().includes(q)
        const matchAccount = (tx.account as Account | undefined)?.name?.toLowerCase().includes(q)
        if (!matchNotes && !matchCategory && !matchAccount) return false
      }
      return true
    })
  }, [transactions, filter, accountFilter, search])

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    filtered.forEach(tx => {
      const key = tx.date
      if (!groups[key]) groups[key] = []
      groups[key].push(tx)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const handleSaved = (tx: Transaction) => {
    setTransactions(prev => {
      const exists = prev.find(t => t.id === tx.id)
      if (exists) return prev.map(t => t.id === tx.id ? tx : t)
      return [tx, ...prev]
    })
    setShowForm(false)
    setEditTx(null)
  }

  const handleDelete = (id: string) => {
    addDeletedId(id)                                       // persists across navigation
    setTransactions(prev => prev.filter(t => t.id !== id)) // instant UI update
    router.refresh()                                       // ask server to revalidate
  }

  const handleEdit = (tx: Transaction) => {
    setEditTx(tx)
    setShowForm(true)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500">{filtered.length} records</p>
        </div>
        <button
          onClick={() => { setEditTx(null); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-brand-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-green-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />
          <div>
            <p className="text-[10px] text-green-600">Income</p>
            <p className="text-sm font-bold text-green-700">{formatCurrency(totalIncome)}</p>
          </div>
        </div>
        <div className="flex-1 bg-red-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
          <div>
            <p className="text-[10px] text-red-600">Expenses</p>
            <p className="text-sm font-bold text-red-700">{formatCurrency(totalExpense)}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search transactions..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
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
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

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
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {txs.map((tx, i) => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    isLast={i === txs.length - 1}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
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
