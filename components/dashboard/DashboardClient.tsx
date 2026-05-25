'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, ChevronRight, Wallet,
  ArrowLeftRight, ArrowRight
} from 'lucide-react'
import type { Account, Transaction, Profile, BuiltinTypeOverride, Budget } from '@/lib/types'
import { resolveAccountTypeDisplay, EMOJI_MAP } from '@/lib/types'
import { formatCurrency, getRelativeDate, getMonthYear } from '@/lib/utils'
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import TransactionItem from '../transactions/TransactionItem'

const TransactionForm = dynamic(() => import('../transactions/TransactionForm'), { ssr: false })

interface Props {
  accounts: Account[]
  recentTransactions: Transaction[]
  monthlyTransactions: { type: string; amount: number; date: string }[]
  profile: Profile | null
  builtinOverrides?: BuiltinTypeOverride[]
  budgets?: Budget[]
}

export default function DashboardClient({ accounts, recentTransactions, monthlyTransactions, profile, builtinOverrides = [], budgets = [] }: Props) {
  const [txs, setTxs] = useState<Transaction[]>(recentTransactions)
  const [showAddTx, setShowAddTx] = useState(false)

  const assetAccounts = accounts.filter(a => !['credit', 'loan'].includes(a.type) && a.include_in_net_worth)
  const liabilityAccounts = accounts.filter(a => ['credit', 'loan'].includes(a.type) && a.include_in_net_worth)

  const totalAssets = assetAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totalLiabilities = liabilityAccounts.reduce((s, a) => s + Math.abs(a.balance ?? 0), 0)
  const netWorth = totalAssets - totalLiabilities

  const monthlyIncome = monthlyTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const monthlyExpense = monthlyTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const leftover = monthlyIncome - monthlyExpense
  const spendPct = monthlyIncome > 0 ? Math.min((monthlyExpense / monthlyIncome) * 100, 100) : 0

  const chartData = buildChartData(monthlyTransactions)

  const handleTxSaved = (tx: Transaction) => {
    setTxs(prev => [tx, ...prev.slice(0, 9)])
    setShowAddTx(false)
  }

  const getAccountTypeDisplay = (account: Account) => {
    if (account.custom_type_name) {
      return { label: account.custom_type_name, color: account.custom_type_color ?? '#6B7280', bgColor: `${account.custom_type_color ?? '#6B7280'}18` }
    }
    return resolveAccountTypeDisplay(account.type, builtinOverrides)
  }

  // Group recent transactions by date
  const txSlice = txs.slice(0, 8)
  const groupedTxs = txSlice.reduce((acc, tx) => {
    if (!acc[tx.date]) acc[tx.date] = []
    acc[tx.date].push(tx)
    return acc
  }, {} as Record<string, Transaction[]>)
  const sortedDates = Object.keys(groupedTxs).sort().reverse()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Greeting */}
      <div className="fade-in" style={{ animationDelay: '0ms' }}>
        <p className="text-label" style={{ color: 'var(--text-faint)' }}>{getMonthYear()}</p>
        <h1 className="text-heading mt-0.5" style={{ color: 'var(--text)' }}>
          {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]} 👋` : 'Dashboard'}
        </h1>
      </div>

      {/* Net Worth Hero */}
      <div
        className="rounded-2xl p-5 text-white shadow-lg fade-in"
        style={{
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
          boxShadow: '0 8px 32px rgba(99,102,241,0.3)',
          animationDelay: '50ms',
        }}
      >
        <p className="text-label mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Net Worth</p>
        <p className="text-display mb-1">{formatCurrency(netWorth)}</p>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Assets {formatCurrency(totalAssets)} · Debts {formatCurrency(totalLiabilities)}
        </p>
        <div className="rounded-full h-1.5 mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: `${spendPct}%`,
              backgroundColor: spendPct > 90 ? '#FCA5A5' : '#6EE7B7',
            }}
          />
        </div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {spendPct.toFixed(0)}% of income spent this month
        </p>
      </div>

      {/* Monthly Summary — colored left border */}
      <div className="grid grid-cols-3 gap-3 fade-in" style={{ animationDelay: '100ms' }}>
        <div
          className="rounded-2xl p-3.5"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid var(--income)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--income)' }} />
            <p className="text-label" style={{ color: 'var(--income)' }}>Income</p>
          </div>
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>{formatCurrency(monthlyIncome)}</p>
          <p className="text-caption mt-0.5">this month</p>
        </div>

        <div
          className="rounded-2xl p-3.5"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid var(--expense)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown className="w-3.5 h-3.5" style={{ color: 'var(--expense)' }} />
            <p className="text-label" style={{ color: 'var(--expense)' }}>Spent</p>
          </div>
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>{formatCurrency(monthlyExpense)}</p>
          <p className="text-caption mt-0.5">this month</p>
        </div>

        <div
          className="rounded-2xl p-3.5"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: `4px solid ${leftover >= 0 ? 'var(--transfer)' : 'var(--expense)'}`,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowRight className="w-3.5 h-3.5" style={{ color: leftover >= 0 ? 'var(--transfer)' : 'var(--expense)' }} />
            <p className="text-label" style={{ color: leftover >= 0 ? 'var(--transfer)' : 'var(--expense)' }}>Left</p>
          </div>
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>{formatCurrency(Math.abs(leftover))}</p>
          <p className="text-caption mt-0.5">{leftover >= 0 ? 'surplus' : 'deficit'}</p>
        </div>
      </div>

      {/* Cash Flow Chart */}
      {chartData.length > 1 && (
        <div
          className="rounded-2xl p-5 shadow-sm fade-in"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            animationDelay: '150ms',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Cash Flow</p>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--income)' }} />
                <span className="text-caption">In</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--expense)' }} />
                <span className="text-caption">Out</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false} interval={4} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  fontSize: '11px',
                  padding: '6px 10px',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                }}
                formatter={(val: number) => formatCurrency(val)}
              />
              <Area type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} fill="url(#ig)" dot={false} />
              <Area type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} fill="url(#eg)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Accounts */}
      <div className="fade-in" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Accounts</p>
          <Link href="/accounts" className="text-xs font-medium flex items-center gap-0.5" style={{ color: 'var(--brand)' }}>
            All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {accounts.length === 0 ? (
          <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Wallet className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>No accounts yet</p>
            <Link href="/accounts" className="text-sm font-medium" style={{ color: 'var(--brand)' }}>Add account →</Link>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {accounts.map(account => {
              const d = getAccountTypeDisplay(account)
              const balance = account.balance ?? account.initial_balance
              return (
                <Link
                  key={account.id}
                  href={`/transactions?account=${account.id}`}
                  className="shrink-0 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                  style={{
                    minWidth: 160,
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderTop: `3px solid ${account.color || d.color}`,
                  }}
                >
                  <p className="text-label mb-1" style={{ color: 'var(--text-faint)' }}>{d.label}</p>
                  <p className="text-xs font-semibold mb-2 truncate" style={{ color: 'var(--text-muted)' }}>{account.name}</p>
                  <p className="text-lg font-bold" style={{ color: balance < 0 ? 'var(--expense)' : 'var(--text)' }}>
                    {formatCurrency(balance)}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Budget Widget */}
      {budgets.length > 0 && (
        <div className="fade-in" style={{ animationDelay: '210ms' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Budgets</p>
            <Link href="/budgets" className="text-xs font-medium flex items-center gap-0.5" style={{ color: 'var(--brand)' }}>
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div
            className="rounded-2xl overflow-hidden shadow-sm"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {[...budgets].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)).slice(0, 3).map((b, i, arr) => {
              const pct = b.percentage ?? 0
              const barColor = pct < 70 ? 'var(--income)' : pct < 90 ? '#F59E0B' : 'var(--expense)'
              const emoji = EMOJI_MAP[b.category?.icon ?? ''] ?? '💸'
              return (
                <div
                  key={b.id}
                  className="px-4 py-3"
                  style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-2)' : 'none' }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{emoji}</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{b.category?.name ?? 'Budget'}</span>
                      {pct > 100 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--expense)' }}>OVER</span>
                      )}
                    </div>
                    <span className="text-xs tabular-nums" style={{ color: 'var(--text-faint)' }}>
                      {formatCurrency(b.spent ?? 0)} / {formatCurrency(b.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Debts & Liabilities */}
      {liabilityAccounts.length > 0 && (
        <div className="fade-in" style={{ animationDelay: '220ms' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Debts & Liabilities</p>
          <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            {liabilityAccounts.map((account, i) => {
              const balance = Math.abs(account.balance ?? 0)
              const d = getAccountTypeDisplay(account)
              return (
                <div
                  key={account.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: i < liabilityAccounts.length - 1 ? '1px solid var(--border-2)' : 'none' }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: d.bgColor }}>
                    {account.type === 'credit' ? '💳' : '🏛️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{account.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.label}</p>
                  </div>
                  <p className="text-sm font-bold" style={{ color: 'var(--expense)' }}>{formatCurrency(balance)}</p>
                </div>
              )
            })}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderTop: '1px solid rgba(239,68,68,0.12)' }}
            >
              <p className="text-xs font-medium" style={{ color: 'var(--expense)' }}>Total Debt</p>
              <p className="text-sm font-bold" style={{ color: 'var(--expense)' }}>{formatCurrency(totalLiabilities)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Transactions — grouped by date */}
      <div className="fade-in" style={{ animationDelay: '250ms' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recent Transactions</p>
          <Link href="/transactions" className="text-xs font-medium flex items-center gap-0.5" style={{ color: 'var(--brand)' }}>
            All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {txSlice.length === 0 ? (
          <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <ArrowLeftRight className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No transactions yet</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            {sortedDates.map(date => (
              <div key={date}>
                <div
                  className="sticky top-0 px-4 py-1.5 z-10"
                  style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border-2)' }}
                >
                  <span className="text-label" style={{ color: 'var(--text-faint)' }}>
                    {getRelativeDate(date)}
                  </span>
                </div>
                {groupedTxs[date].map((tx, i) => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    isLast={i === groupedTxs[date].length - 1}
                    onEdit={() => {}}
                    onDelete={id => setTxs(prev => prev.filter(t => t.id !== id))}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddTx && (
        <TransactionForm onSaved={handleTxSaved} onClose={() => setShowAddTx(false)} />
      )}
    </div>
  )
}

function buildChartData(transactions: { type: string; amount: number; date: string }[]) {
  const byDay: Record<number, { income: number; expense: number }> = {}
  transactions.forEach(tx => {
    const day = parseInt(tx.date.split('-')[2])
    if (!byDay[day]) byDay[day] = { income: 0, expense: 0 }
    if (tx.type === 'income') byDay[day].income += tx.amount
    else if (tx.type === 'expense') byDay[day].expense += tx.amount
  })
  const today = new Date().getDate()
  return Array.from({ length: today }, (_, i) => ({
    day: String(i + 1),
    income: byDay[i + 1]?.income ?? 0,
    expense: byDay[i + 1]?.expense ?? 0,
  }))
}
