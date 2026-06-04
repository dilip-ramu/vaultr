'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, ChevronRight,
  ArrowLeftRight, AlertTriangle, Clock, Wallet,
} from 'lucide-react'
import type { Account, Transaction, Profile, BuiltinTypeOverride, Budget, Bill } from '@/lib/types'
import { resolveAccountTypeDisplay, EMOJI_MAP, getCategoryEmoji } from '@/lib/types'
import type { Insight } from '@/lib/insights'
import { formatCurrency, getRelativeDate } from '@/lib/utils'
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import TransactionItem from '../transactions/TransactionItem'

const TransactionForm = dynamic(() => import('../transactions/TransactionForm'), { ssr: false })

type UnbilledInvoice = {
  id: string
  amount: number
  invoice_date: string
  linked_customer_name: string | null
  supplier: { name: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(n))
}

function fmtFull(n: number) {
  return formatCurrency(Math.abs(n))
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildChartData(transactions: { type: string; amount: number; date: string }[]) {
  const byMonth: Record<string, { income: number; expense: number; label: string }> = {}
  transactions.forEach(tx => {
    const d = new Date(tx.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!byMonth[key]) byMonth[key] = { income: 0, expense: 0, label: MONTHS[d.getMonth()] }
    if (tx.type === 'income')  byMonth[key].income  += tx.amount
    if (tx.type === 'expense') byMonth[key].expense += tx.amount
  })
  return Object.values(byMonth).slice(-5)
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  accounts: Account[]
  recentTransactions: Transaction[]
  monthlyTransactions: { type: string; amount: number; date: string }[]
  chartTransactions?: { type: string; amount: number; date: string }[]
  profile: Profile | null
  builtinOverrides?: BuiltinTypeOverride[]
  budgets?: Budget[]
  upcomingSubs?: Bill[]
  subMonthlyTotal?: number
  topInsights?: Insight[]
  totalReceivables?: number
  unbilledInvoices?: UnbilledInvoice[]
  commissionPending?: number
  commissionPendingCount?: number
  commissionDueTotal?: number
  commissionDueCount?: number
  billsDueTotal?: number
  billsDueCount?: number
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, icon, onClick,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  icon?: React.ReactNode
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className="rounded-2xl p-4 md:p-5 flex flex-col gap-1 text-left w-full"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
        {icon && <span style={{ color: accent ?? 'var(--text-faint)' }}>{icon}</span>}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ color: accent ?? 'var(--text)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </Tag>
  )
}

// ── Business metric chip ──────────────────────────────────────────────────────

function BizChip({
  label, amount, count, color, href, urgent, unit = 'invoice',
}: {
  label: string
  amount: number
  count: number
  color: string
  href: string
  urgent?: boolean
  unit?: string
}) {
  return (
    <Link
      href={href}
      className="flex-1 min-w-0 rounded-xl p-3 md:p-4 flex flex-col gap-0.5 transition-opacity hover:opacity-80"
      style={{
        background: urgent ? `${color}12` : 'var(--surface)',
        border: `1px solid ${urgent ? color + '40' : 'var(--border)'}`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-lg font-bold" style={{ color }}>{count > 0 ? `₹${fmt(amount)}` : '—'}</p>
      <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{count} {unit}{count !== 1 ? 's' : ''}</p>
    </Link>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardClient({
  accounts,
  recentTransactions,
  monthlyTransactions,
  chartTransactions,
  profile,
  builtinOverrides = [],
  budgets = [],
  upcomingSubs = [],
  totalReceivables = 0,
  unbilledInvoices = [],
  commissionPending = 0,
  commissionPendingCount = 0,
  commissionDueTotal = 0,
  commissionDueCount = 0,
  billsDueTotal = 0,
  billsDueCount = 0,
}: Props) {
  const [txs, setTxs] = useState<Transaction[]>(recentTransactions)
  const [showAddTx, setShowAddTx] = useState(false)

  // ── Money math ──────────────────────────────────────────────────────────────

  const assetAccounts      = accounts.filter(a => !['credit','loan'].includes(a.type) && a.include_in_net_worth)
  const liabilityAccounts  = accounts.filter(a =>  ['credit','loan'].includes(a.type) && a.include_in_net_worth)
  const totalAssets        = assetAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totalLiabilities   = liabilityAccounts.reduce((s, a) => s + Math.abs(a.balance ?? 0), 0)
  const netWorth           = totalAssets - totalLiabilities
  const monthlyIncome      = monthlyTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const monthlyExpense     = monthlyTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const leftover           = monthlyIncome - monthlyExpense

  // Business metrics from supplier invoices
  const supplierDue        = unbilledInvoices.reduce((s, i) => s + i.amount, 0)
  const supplierDueCount   = unbilledInvoices.length

  // ── Chart ───────────────────────────────────────────────────────────────────

  // Use 5-month history for chart; fall back to current month if not provided
  const chartData = useMemo(
    () => buildChartData(chartTransactions ?? monthlyTransactions),
    [chartTransactions, monthlyTransactions]
  )

  // ── Recent transactions grouped by date ────────────────────────────────────

  const txSlice = txs.slice(0, 8)
  const groupedTxs = useMemo(() => {
    return txSlice.reduce<Record<string, Transaction[]>>((acc, tx) => {
      const d = tx.date.split('T')[0]
      ;(acc[d] = acc[d] ?? []).push(tx)
      return acc
    }, {})
  }, [txSlice])
  const sortedDates = Object.keys(groupedTxs).sort((a, b) => b.localeCompare(a))

  // ── Greeting ────────────────────────────────────────────────────────────────

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  // ── Upcoming bills ──────────────────────────────────────────────────────────

  const now = new Date()
  const upcoming = upcomingSubs
    .filter(b => {
      if (!b.due_date) return false
      const due = new Date(b.due_date)
      return due >= now
    })
    .slice(0, 3)

  // ── Budget summary ──────────────────────────────────────────────────────────

  const activeBudgets = budgets.filter(b => b.percentage !== undefined).slice(0, 4)

  // ── Render ──────────────────────────────────────────────────────────────────

  const now2 = new Date()
  const monthLabel = `${MONTHS[now2.getMonth()]} ${now2.getFullYear()}`

  return (
    <div className="min-h-full" style={{ background: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Due alerts banner (gone after refresh once paid/received) ──── */}
        {(commissionDueCount > 0 || billsDueCount > 0) && (
          <div className="space-y-2">
            {commissionDueCount > 0 && (
              <Link
                href="/customers/commission"
                className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-opacity hover:opacity-90"
                style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#d97706' }} />
                <p className="text-sm flex-1 min-w-0" style={{ color: '#92400e' }}>
                  <span className="font-semibold">₹{fmt(commissionDueTotal)} commission payment due</span>
                  {' '}· {commissionDueCount} style{commissionDueCount !== 1 ? 's' : ''} past expected payment date
                </p>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#d97706' }} />
              </Link>
            )}
            {billsDueCount > 0 && (
              <Link
                href="/bills"
                className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-opacity hover:opacity-90"
                style={{ background: 'rgba(200,55,42,0.08)', border: '1px solid rgba(200,55,42,0.30)' }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--expense)' }} />
                <p className="text-sm flex-1 min-w-0" style={{ color: 'var(--expense)' }}>
                  <span className="font-semibold">{billsDueCount} bill{billsDueCount !== 1 ? 's' : ''} due</span>
                  {' '}· ₹{fmt(billsDueTotal)} unpaid
                </p>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--expense)' }} />
              </Link>
            )}
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{monthLabel} overview</p>
          </div>
        </div>

        {/* ── Row 1: Net worth + monthly summary ─────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Net Worth — spans 2 on mobile to be prominent */}
          <div
            className="col-span-2 lg:col-span-1 rounded-2xl p-5 flex flex-col"
            style={{
              background: 'var(--brand-dark, #1F5C3A)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Net Worth
            </p>
            <p className="text-3xl font-bold text-white tracking-tight">
              {netWorth >= 0 ? '₹' : '−₹'}{fmt(netWorth)}
            </p>
            <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <div>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Assets</p>
                <p className="text-sm font-semibold text-white">₹{fmt(totalAssets)}</p>
              </div>
              {totalLiabilities > 0 && (
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Debt</p>
                  <p className="text-sm font-semibold" style={{ color: '#FCA5A5' }}>₹{fmt(totalLiabilities)}</p>
                </div>
              )}
            </div>
          </div>

          {/* This month — Income */}
          <StatCard
            label="Income"
            value={`₹${fmt(monthlyIncome)}`}
            sub={monthLabel}
            accent="var(--income)"
            icon={<TrendingUp className="w-4 h-4" />}
          />

          {/* This month — Expenses */}
          <StatCard
            label="Expenses"
            value={`₹${fmt(monthlyExpense)}`}
            sub={monthLabel}
            accent="var(--expense)"
            icon={<TrendingDown className="w-4 h-4" />}
          />

          {/* Leftover — full width on mobile so no empty column */}
          <div
            className="col-span-2 lg:col-span-1 rounded-2xl p-4 md:p-5 flex flex-col gap-1"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Leftover</p>
            <p
              className="text-2xl font-bold tracking-tight"
              style={{ color: leftover >= 0 ? 'var(--income)' : 'var(--expense)' }}
            >
              {leftover >= 0 ? '₹' : '−₹'}{fmt(leftover)}
            </p>
            {monthlyIncome > 0 && (
              <>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min((monthlyExpense / monthlyIncome) * 100, 100)}%`,
                      background: monthlyExpense / monthlyIncome > 0.85 ? 'var(--expense)' : 'var(--brand)',
                    }}
                  />
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {Math.round((monthlyExpense / monthlyIncome) * 100)}% of income spent
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Row 2: Business overview ────────────────────────────────────── */}
        {(supplierDueCount > 0 || totalReceivables > 0 || commissionPendingCount > 0) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
              Business
            </p>
            <div className="flex gap-3 flex-wrap sm:flex-nowrap">
              {supplierDueCount > 0 && (
                <BizChip
                  label="Recoverable — Pending Billing"
                  amount={supplierDue}
                  count={supplierDueCount}
                  color="#f59e0b"
                  href="/suppliers/invoices"
                />
              )}
              {totalReceivables > 0 && (
                <BizChip
                  label="Customer Receivables"
                  amount={totalReceivables}
                  count={0}
                  color="var(--income)"
                  href="/recoverables/invoices"
                />
              )}
              {commissionPendingCount > 0 && (
                <BizChip
                  label="Commission Pending"
                  amount={commissionPending}
                  count={commissionPendingCount}
                  unit="style"
                  color="#3b82f6"
                  href="/customers/commission"
                />
              )}
            </div>
          </div>
        )}

        {/* ── Row 3: Chart + Recent Transactions ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Spending trend chart */}
          <div
            className="lg:col-span-2 rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>5-Month Trend</p>
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--income)' }} />
                  Income
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--expense)' }} />
                  Expense
                </span>
              </div>
            </div>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--income)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--income)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--expense)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--expense)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
                    formatter={(v: number) => [`₹${fmt(v)}`, '']}
                  />
                  <Area type="monotone" dataKey="income"  stroke="var(--income)"  strokeWidth={2} fill="url(#gIncome)"  dot={false} />
                  <Area type="monotone" dataKey="expense" stroke="var(--expense)" strokeWidth={2} fill="url(#gExpense)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Not enough data yet</p>
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="lg:col-span-3 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recent</p>
              <Link href="/transactions" className="flex items-center gap-0.5 text-xs font-medium" style={{ color: 'var(--brand)' }}>
                All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {txSlice.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <ArrowLeftRight className="w-6 h-6" style={{ color: 'var(--text-faint)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No transactions yet</p>
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                {sortedDates.map(date => (
                  <div key={date}>
                    <div
                      className="px-5 py-1.5 sticky top-0"
                      style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-2)' }}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
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
        </div>

        {/* ── Row 4: Accounts + Budgets + Bills ──────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Accounts */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Accounts</p>
              </div>
              <Link href="/accounts" className="flex items-center gap-0.5 text-xs font-medium" style={{ color: 'var(--brand)' }}>
                All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {accounts.filter(a => a.include_in_net_worth).slice(0, 6).map(account => {
                const d = account.custom_type_name
                  ? { label: account.custom_type_name, color: account.custom_type_color ?? '#6B7280', bgColor: `${account.custom_type_color ?? '#6B7280'}18` }
                  : resolveAccountTypeDisplay(account.type, builtinOverrides)
                const isDebt = ['credit', 'loan'].includes(account.type)
                const balance = account.balance ?? 0
                return (
                  <div key={account.id} className="flex items-center gap-3 px-5 py-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ background: d.bgColor, color: d.color }}
                    >
                      {account.icon && /\p{Emoji_Presentation}/u.test(account.icon)
                        ? account.icon
                        : account.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{account.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{d.label}</p>
                    </div>
                    <p
                      className="text-sm font-bold shrink-0"
                      style={{ color: isDebt ? 'var(--expense)' : balance >= 0 ? 'var(--text)' : 'var(--expense)' }}
                    >
                      {balance < 0 ? '−' : ''}₹{fmt(balance)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Budgets */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Budgets</p>
              <Link href="/budgets" className="flex items-center gap-0.5 text-xs font-medium" style={{ color: 'var(--brand)' }}>
                All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {activeBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active budgets</p>
                <Link href="/budgets" className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Set one up →</Link>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {activeBudgets.map(b => {
                  const pct  = Math.min(b.percentage ?? 0, 100)
                  const over = (b.percentage ?? 0) > 100
                  const cat  = b.category as { name?: string; icon?: string } | null
                  return (
                    <div key={b.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {cat?.icon && <span className="text-sm">{getCategoryEmoji(cat.icon)}</span>}
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{cat?.name ?? 'Budget'}</p>
                        </div>
                        <p className="text-xs shrink-0 ml-2" style={{ color: over ? 'var(--expense)' : 'var(--text-muted)' }}>
                          ₹{fmt(b.spent ?? 0)} / ₹{fmt(b.amount)}
                        </p>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: over ? 'var(--expense)' : pct > 80 ? '#f59e0b' : 'var(--brand)',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Upcoming bills */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Upcoming Bills</p>
              <Link href="/bills" className="flex items-center gap-0.5 text-xs font-medium" style={{ color: 'var(--brand)' }}>
                All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No upcoming bills</p>
              </div>
            ) : (
              <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
                {upcoming.map(bill => {
                  const dueDate  = bill.due_date ? new Date(bill.due_date) : null
                  const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86400000) : null
                  const urgent   = daysLeft !== null && daysLeft <= 3
                  return (
                    <div key={bill.id} className="flex items-center gap-3 px-5 py-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm"
                        style={{ background: urgent ? 'rgba(200,55,42,0.1)' : 'var(--surface-2)' }}
                      >
                        {urgent
                          ? <AlertTriangle className="w-4 h-4" style={{ color: 'var(--expense)' }} />
                          : <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{bill.name}</p>
                        <p className="text-[10px]" style={{ color: urgent ? 'var(--expense)' : 'var(--text-muted)' }}>
                          {daysLeft === 0 ? 'Due today' : daysLeft === 1 ? 'Due tomorrow' : dueDate ? `${dueDate.getDate()} ${MONTHS[dueDate.getMonth()]}` : '—'}
                        </p>
                      </div>
                      <p className="text-sm font-bold shrink-0" style={{ color: 'var(--expense)' }}>
                        ₹{fmt(bill.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Version stamp */}
      <p className="text-center text-[10px] pb-4" style={{ color: 'var(--text-faint)' }}>
        v2.6
      </p>

      {showAddTx && (
        <TransactionForm onSaved={tx => { setTxs(prev => [tx, ...prev.slice(0,7)]); setShowAddTx(false) }} onClose={() => setShowAddTx(false)} />
      )}
    </div>
  )
}
