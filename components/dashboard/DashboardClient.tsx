'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, ChevronRight, Wallet,
  ArrowLeftRight, CreditCard, Landmark, ArrowRight
} from 'lucide-react'
import type { Account, Transaction, Profile } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, EMOJI_MAP } from '@/lib/types'
import { formatCurrency, getRelativeDate, getMonthYear } from '@/lib/utils'
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import TransactionItem from '../transactions/TransactionItem'
import TransactionForm from '../transactions/TransactionForm'

interface Props {
  accounts: Account[]
  recentTransactions: Transaction[]
  monthlyTransactions: { type: string; amount: number; date: string }[]
  profile: Profile | null
}

export default function DashboardClient({ accounts, recentTransactions, monthlyTransactions, profile }: Props) {
  const [txs, setTxs] = useState<Transaction[]>(recentTransactions)
  const [showAddTx, setShowAddTx] = useState(false)

  // ── Calculations ──────────────────────────────────────────────
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Greeting */}
      <div>
        <p className="text-xs text-gray-400 font-medium">{getMonthYear()}</p>
        <h1 className="text-xl font-bold text-gray-900">
          {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]} 👋` : 'Dashboard'}
        </h1>
      </div>

      {/* Net Worth Hero */}
      <div className="bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200">
        <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Net Worth</p>
        <p className="text-4xl font-bold mb-1">{formatCurrency(netWorth)}</p>
        <p className="text-indigo-300 text-xs mb-4">
          Assets {formatCurrency(totalAssets)} · Debts {formatCurrency(totalLiabilities)}
        </p>
        {/* Spend bar */}
        <div className="bg-white/20 rounded-full h-1.5 mb-3">
          <div
            className={`h-1.5 rounded-full transition-all ${spendPct > 90 ? 'bg-red-300' : 'bg-green-300'}`}
            style={{ width: `${spendPct}%` }}
          />
        </div>
        <p className="text-indigo-200 text-xs">
          {spendPct.toFixed(0)}% of income spent this month
        </p>
      </div>

      {/* Monthly Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            <p className="text-[10px] text-green-600 font-medium uppercase tracking-wide">Income</p>
          </div>
          <p className="text-base font-bold text-green-700 leading-tight">{formatCurrency(monthlyIncome)}</p>
          <p className="text-[10px] text-green-500 mt-0.5">this month</p>
        </div>

        <div className="bg-red-50 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            <p className="text-[10px] text-red-600 font-medium uppercase tracking-wide">Spent</p>
          </div>
          <p className="text-base font-bold text-red-700 leading-tight">{formatCurrency(monthlyExpense)}</p>
          <p className="text-[10px] text-red-500 mt-0.5">this month</p>
        </div>

        <div className={`rounded-2xl p-3.5 ${leftover >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowRight className={`w-3.5 h-3.5 ${leftover >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
            <p className={`text-[10px] font-medium uppercase tracking-wide ${leftover >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              Left
            </p>
          </div>
          <p className={`text-base font-bold leading-tight ${leftover >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatCurrency(Math.abs(leftover))}
          </p>
          <p className={`text-[10px] mt-0.5 ${leftover >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
            {leftover >= 0 ? 'surplus' : 'deficit'}
          </p>
        </div>
      </div>

      {/* Cash Flow Chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-900">Cash Flow</p>
            <div className="flex gap-3">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400" /><span className="text-[10px] text-gray-400">In</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-[10px] text-gray-400">Out</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} interval={4} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '11px', padding: '6px 10px' }}
                formatter={(val: number) => formatCurrency(val)}
              />
              <Area type="monotone" dataKey="income" stroke="#10B981" strokeWidth={1.5} fill="url(#ig)" dot={false} />
              <Area type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={1.5} fill="url(#eg)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900">Accounts</p>
          <Link href="/accounts" className="text-xs text-brand-500 font-medium flex items-center gap-0.5">
            All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {accounts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
            <Wallet className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No accounts yet</p>
            <Link href="/accounts" className="text-brand-500 text-sm font-medium">Add account →</Link>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {accounts.map(account => {
              const config = ACCOUNT_TYPE_CONFIG[account.type]
              const balance = account.balance ?? account.initial_balance
              return (
                <Link
                  key={account.id}
                  href={`/transactions?account=${account.id}`}
                  className="min-w-40 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm shrink-0 hover:shadow-md transition-shadow"
                  style={{ borderTopWidth: '3px', borderTopColor: account.color || config.color }}
                >
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">{config.label}</p>
                  <p className="font-semibold text-xs text-gray-700 mb-2 truncate">{account.name}</p>
                  <p className={`text-lg font-bold ${balance < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                    {formatCurrency(balance)}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Debts & Liabilities */}
      {liabilityAccounts.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-3">Debts & Liabilities</p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {liabilityAccounts.map((account, i) => {
              const balance = Math.abs(account.balance ?? 0)
              const config = ACCOUNT_TYPE_CONFIG[account.type]
              return (
                <div key={account.id} className={`flex items-center gap-3 px-4 py-3.5 ${i < liabilityAccounts.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: config.bgColor }}>
                    {account.type === 'credit' ? '💳' : '🏛️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                    <p className="text-xs text-gray-400">{config.label}</p>
                  </div>
                  <p className="text-sm font-bold text-red-500">{formatCurrency(balance)}</p>
                </div>
              )
            })}
            <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex items-center justify-between">
              <p className="text-xs font-medium text-red-600">Total Debt</p>
              <p className="text-sm font-bold text-red-600">{formatCurrency(totalLiabilities)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900">Recent Transactions</p>
          <Link href="/transactions" className="text-xs text-brand-500 font-medium flex items-center gap-0.5">
            All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {txs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
            <ArrowLeftRight className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No transactions yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {txs.slice(0, 8).map((tx, i) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                isLast={i === Math.min(txs.length, 8) - 1}
                onEdit={() => {}}
                onDelete={id => setTxs(prev => prev.filter(t => t.id !== id))}
              />
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
