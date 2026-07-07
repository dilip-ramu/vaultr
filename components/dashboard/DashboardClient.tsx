'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ChevronRight, Plus,
  ArrowLeftRight, AlertTriangle, Clock, Wallet, Scale, CreditCard,
} from 'lucide-react'
import type { ProfitSummary } from '@/lib/profitability'
import type { CardDue } from '@/app/(app)/dashboard/page'
import { creditSummary, isLiability } from '@/lib/account-metrics'
import type { Account, Transaction, Profile, BuiltinTypeOverride, Budget, Bill } from '@/lib/types'
import { resolveAccountTypeDisplay, EMOJI_MAP, getCategoryEmoji } from '@/lib/types'
import type { Insight } from '@/lib/insights'
import { formatCurrency, getRelativeDate, accountGroupRank } from '@/lib/utils'
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import TransactionItem from '../transactions/TransactionItem'
import PayeeSpendRings, { type PayeeRing } from './PayeeSpendRings'
import MarkCardPaidModal from './MarkCardPaidModal'

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
  profitMTD?: ProfitSummary
  cardDues?: CardDue[]
  payeeRings?: PayeeRing[]
}

// ── Pulse-band segment (Command layout) ───────────────────────────────────────

function PulseSeg({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="pt-4 md:pt-0 md:px-5 md:border-l first:md:border-l-0" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</p>
      <p className="text-xl font-extrabold tracking-tight" style={{ color: tint ?? '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
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
  profitMTD,
  cardDues = [],
  payeeRings = [],
}: Props) {
  const [txs, setTxs] = useState<Transaction[]>(recentTransactions)
  const [showAddTx, setShowAddTx] = useState(false)
  const [payCard, setPayCard] = useState<CardDue | null>(null)

  // ── Money math ──────────────────────────────────────────────────────────────

  const assetAccounts      = accounts.filter(a => !isLiability(a.type) && a.include_in_net_worth)
  const liabilityAccounts  = accounts.filter(a =>  isLiability(a.type) && a.include_in_net_worth)
  const totalAssets        = assetAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totalLiabilities   = liabilityAccounts.reduce((s, a) => s + Math.abs(a.balance ?? 0), 0)
  const credit             = creditSummary(accounts)
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

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[23px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{monthLabel} overview</p>
          </div>
          <button
            onClick={() => setShowAddTx(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0 transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-lg)' }}
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add transaction</span>
          </button>
        </div>

        {/* ── Pulse band: Net Worth · Income · Expenses · Leftover · Profit ── */}
        <div
          className="rounded-3xl p-5 md:p-6"
          style={{ background: 'linear-gradient(135deg, var(--brand-deep) 0%, var(--brand-dark) 100%)', boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="grid grid-cols-2 md:grid-cols-5">
            {/* Net Worth — prominent */}
            <div className="col-span-2 md:col-span-1 pb-4 md:pb-0 md:pr-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Net Worth</p>
              <p className="text-3xl font-extrabold text-white tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {netWorth >= 0 ? '₹' : '−₹'}{fmt(netWorth)}
              </p>
              <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                assets ₹{fmt(totalAssets)}{totalLiabilities > 0 ? ` · debt ₹${fmt(totalLiabilities)}` : ''}
              </p>
            </div>
            <PulseSeg label="Income" value={`₹${fmt(monthlyIncome)}`} tint="#86EFAC" />
            <PulseSeg label="Expenses" value={`₹${fmt(monthlyExpense)}`} tint="#FCA5A5" />
            <PulseSeg label="Leftover" value={`${leftover >= 0 ? '₹' : '−₹'}${fmt(leftover)}`} tint={leftover >= 0 ? '#86EFAC' : '#FCA5A5'} />
            <PulseSeg label="Profit · MTD" value={profitMTD ? `${profitMTD.actualNet < 0 ? '−₹' : '₹'}${fmt(profitMTD.actualNet)}` : '—'} tint={profitMTD && profitMTD.actualNet < 0 ? '#FCA5A5' : '#F6D08A'} />
          </div>
        </div>

        {/* ── Profitability — this month till date ───────────────────────── */}
        {profitMTD && (
          <Link
            href="/profitability"
            className="block rounded-2xl p-4 md:p-5 transition-opacity hover:opacity-90"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Profitability — {monthLabel} till date
                </p>
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Realised (actual)
                </p>
                <p
                  className="text-xl font-bold tracking-tight"
                  style={{ color: profitMTD.actualNet >= 0 ? 'var(--income)' : 'var(--expense)' }}
                >
                  {profitMTD.actualNet < 0 ? '−₹' : '₹'}{fmt(profitMTD.actualNet)}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  in ₹{fmt(profitMTD.actualIncome)} · out ₹{fmt(profitMTD.actualExpense)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Expected (booked)
                </p>
                <p
                  className="text-xl font-bold tracking-tight"
                  style={{ color: profitMTD.expectedNet >= 0 ? 'var(--income)' : 'var(--expense)' }}
                >
                  {profitMTD.expectedNet < 0 ? '−₹' : '₹'}{fmt(profitMTD.expectedNet)}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  in ₹{fmt(profitMTD.expectedIncome)} · out ₹{fmt(profitMTD.expectedExpense)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Unrealised
                </p>
                <p
                  className="text-xl font-bold tracking-tight"
                  style={{ color: 'var(--text)' }}
                >
                  {profitMTD.outstandingNet < 0 ? '−₹' : '₹'}{fmt(profitMTD.outstandingNet)}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>expected − actual</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  To collect
                </p>
                <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--income)' }}>
                  ₹{fmt(Math.max(profitMTD.outstandingIncome, 0))}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  to pay ₹{fmt(Math.max(profitMTD.outstandingExpense, 0))}
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* ── Credit overview ────────────────────────────────────────────── */}
        {(credit.totalLimit > 0 || credit.totalOutstanding > 0) && (
          <Link
            href="/accounts"
            className="block rounded-2xl p-4 md:p-5 transition-opacity hover:opacity-90"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Credit</p>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Available credit</p>
                <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--income)' }}>₹{fmt(credit.totalAvailable)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Total owed</p>
                <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--expense)' }}>₹{fmt(credit.totalOutstanding)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  cards ₹{fmt(credit.totalCardOutstanding)}{credit.totalLoanOutstanding > 0 ? ` · loans ₹${fmt(credit.totalLoanOutstanding)}` : ''}
                </p>
              </div>
              {credit.overallUtilisation != null && (
                <div className="col-span-2 md:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Card utilisation</p>
                  <p className="text-xl font-bold tracking-tight" style={{
                    color: credit.overallUtilisation >= 0.9 ? 'var(--expense)' : credit.overallUtilisation >= 0.5 ? '#F59E0B' : 'var(--text)',
                  }}>{Math.round(credit.overallUtilisation * 100)}%</p>
                  <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(credit.overallUtilisation * 100, 100)}%`,
                      background: credit.overallUtilisation >= 0.9 ? 'var(--expense)' : credit.overallUtilisation >= 0.5 ? '#F59E0B' : 'var(--income)',
                    }} />
                  </div>
                </div>
              )}
            </div>
          </Link>
        )}

        {/* ── Card payments due ──────────────────────────────────────────── */}
        {cardDues.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
              Card payments due
            </p>
            {/* Mobile: horizontal swipe with snap so each card lines up.
                ≥md: even grid that fits up to 4 across with wrapping. */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible">
              {cardDues.map(cd => {
                const daysLeft = Math.ceil((new Date(cd.dueDate).getTime() - Date.now()) / 86400000)
                const urgent = daysLeft <= 5
                const color = cd.color ?? '#6366f1'
                return (
                  <div
                    key={cd.id}
                    className="snap-start shrink-0 w-[72%] sm:w-56 md:w-auto rounded-xl p-3 md:p-4 flex flex-col gap-2"
                    style={{
                      background: urgent ? 'rgba(239,68,68,0.07)' : 'var(--surface)',
                      border: `1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                      borderLeft: `3px solid ${urgent ? '#ef4444' : color}`,
                    }}
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest truncate flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <CreditCard className="w-3 h-3 shrink-0" /> {cd.name}
                      </p>
                      <p className="text-lg font-bold" style={{ color: urgent ? '#ef4444' : 'var(--text)' }}>
                        ₹{fmt(cd.amount)}
                      </p>
                      <p className="text-[10px]" style={{ color: urgent ? '#ef4444' : 'var(--text-faint)' }}>
                        due {new Date(cd.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {daysLeft >= 0 ? ` · ${daysLeft === 0 ? 'today' : `${daysLeft}d left`}` : ` · ${-daysLeft}d overdue`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-auto">
                      <button
                        type="button"
                        onClick={() => setPayCard(cd)}
                        className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white"
                        style={{ background: urgent ? '#ef4444' : 'var(--brand)' }}
                      >
                        Mark Paid
                      </button>
                      <Link
                        href="/cards"
                        className="text-xs font-medium px-2 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 5-Month spending trend ─────────────────────────────────────── */}
        <div>
          {/* Spending trend chart */}
          <div
            className="rounded-2xl p-5"
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
        </div>

        {/* ── Spend by Payee (one ring per payee, coloured by category) ──── */}
        <PayeeSpendRings rings={payeeRings} />

        {/* ── Budgets ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4">

          {/* Budgets */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Budgets</p>
              <Link href="/budget-insights" className="flex items-center gap-0.5 text-xs font-medium" style={{ color: 'var(--brand)' }}>
                All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {activeBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active budgets</p>
                <Link href="/budget-insights" className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Set one up →</Link>
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

        </div>

      </div>

      {/* Version stamp */}
      <p className="text-center text-[10px] pb-4" style={{ color: 'var(--text-faint)' }}>
        v3.0
      </p>

      {showAddTx && (
        <TransactionForm onSaved={tx => { setTxs(prev => [tx, ...prev.slice(0,7)]); setShowAddTx(false) }} onClose={() => setShowAddTx(false)} />
      )}

      {payCard && (
        <MarkCardPaidModal
          cardId={payCard.id}
          cardName={payCard.name}
          remainingDue={payCard.amount}
          accounts={accounts}
          onClose={() => setPayCard(null)}
        />
      )}
    </div>
  )
}
