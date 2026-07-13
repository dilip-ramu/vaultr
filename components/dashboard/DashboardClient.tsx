'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, ChevronDown, Plus,
  ArrowLeftRight, AlertTriangle, Clock, Wallet, Scale, CreditCard, Building2,
} from 'lucide-react'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'
import type { ProfitSummary } from '@/lib/profitability'
import type { CardDue } from '@/app/(app)/dashboard/page'
import { creditSummary } from '@/lib/account-metrics'
import type { Account, Transaction, Profile, BuiltinTypeOverride, Budget, Bill } from '@/lib/types'
import { resolveAccountTypeDisplay, EMOJI_MAP, getCategoryEmoji } from '@/lib/types'
import type { Insight } from '@/lib/insights'
import { formatCurrency, getRelativeDate, accountGroupRank } from '@/lib/utils'
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import TransactionItem from '../transactions/TransactionItem'
import PayeeSpendRings, { type PayeeRing } from './PayeeSpendRings'
import TopSpendCard from './TopSpendCard'
import MarkCardPaidModal from './MarkCardPaidModal'
import type { GrandNetWorth } from '@/lib/networth'

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
  /** Market rates so foreign-currency accounts can be totalled. */
  recentTransactions: Transaction[]
  monthlyTransactions: { type: string; amount: number; date: string }[]
  chartTransactions?: { type: string; amount: number; date: string }[]
  period?: string
  periodLabel?: string
  periodFrom?: string
  periodTo?: string
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
  /** Personal + your share of each company. Computed on the server, one source. */
  netWorth: GrandNetWorth
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
  period = 'month',
  periodLabel,
  periodFrom = '',
  periodTo = '',
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
  netWorth: nw,
  cardDues = [],
  payeeRings = []}: Props) {
  const [txs, setTxs] = useState<Transaction[]>(recentTransactions)
  const [showAddTx, setShowAddTx] = useState(false)
  const [payCard, setPayCard] = useState<CardDue | null>(null)
  const [showCompanies, setShowCompanies] = useState(false)
  const router = useRouter()
  const [showCustom, setShowCustom] = useState(period === 'custom')
  const [customFrom, setCustomFrom] = useState(periodFrom)
  const [customTo, setCustomTo] = useState(periodTo)
  const goPeriod = (p: string) => router.push(p === 'month' ? '/dashboard' : `/dashboard?period=${p}`)

  // ── Money math ──────────────────────────────────────────────────────────────

  // Net worth itself is computed on the SERVER now (lib/networth), because it
  // needs assets, invoices, bills and company stakes — not just the accounts this
  // component happens to have. The currency conversion, the "unknown is not zero"
  // exclusions and the inter-company netting all live there, in one tested place,
  // rather than being re-derived slightly differently on every screen.
  const credit             = creditSummary(accounts)
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

  // Compact ₹ (₹48.2L / ₹1.42Cr / ₹7.85L) for the pulse band
  const fmtC = (n: number) => {
    const abs = Math.abs(n)
    const sign = n < 0 ? '−' : ''
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1).replace(/\.?0+$/, '')}K`
    return `${sign}₹${abs.toFixed(0)}`
  }
  // App-wide hide-balances state (toggle lives in the sidebar). mc() masks the
  // pulse-band totals.
  const { hidden: hideBalances } = useBalanceVisibility()
  const mc = (n: number) => (hideBalances ? '••••••' : fmtC(n))
  const profitMtdVal = profitMTD ? profitMTD.actualNet : null

  return (
    <div className="min-h-full" style={{ background: 'var(--bg)' }}>
      <div className="w-full px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[23px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{periodLabel ?? monthLabel} overview</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period toggle */}
            <div className="flex rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
              {([['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']] as const).map(([p, label]) => (
                <button key={p} onClick={() => { setShowCustom(false); goPeriod(p) }} className="text-[12.5px] font-bold px-3 py-1.5 rounded-lg transition-colors" style={period === p ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' } : { color: 'var(--text-muted)' }}>{label}</button>
              ))}
              <button onClick={() => setShowCustom(s => !s)} className="text-[12.5px] font-bold px-3 py-1.5 rounded-lg transition-colors" style={period === 'custom' ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' } : { color: 'var(--text-muted)' }}>Custom</button>
            </div>
            <button
              onClick={() => setShowAddTx(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0 transition-opacity hover:opacity-90"
              style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-lg)' }}
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add transaction</span>
            </button>
          </div>
        </div>
        {showCustom && (
          <div className="flex flex-wrap items-end gap-2 -mt-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>From</p>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>To</p>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <button onClick={() => customFrom && customTo && router.push(`/dashboard?period=custom&from=${customFrom}&to=${customTo}`)} className="text-white text-sm font-bold px-4 py-2 rounded-lg" style={{ background: 'var(--brand)' }}>Apply</button>
          </div>
        )}

        {/* ── Pulse band: Net Worth · Income/Expenses · Leftover/Profit ────── */}
        <div
          className="rounded-3xl p-6 md:p-7"
          style={{ background: 'linear-gradient(135deg, var(--brand-deep) 0%, var(--brand-dark) 100%)', boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="grid grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr] gap-y-6 gap-x-4 md:gap-x-8">
            {/* ── Net Worth ────────────────────────────────────────────────
                You, plus your SHARE of each company — not the companies' gross
                cash. Cash and Assets are personal; Business is Σ (stake% × the
                company's equity). Receivables and payables live INSIDE that
                equity rather than standing next to it as separate tiles, because
                a tile you can add to cash is a tile that double-counts every
                invoice you ever raised. Expand to see how each one gets there. */}
            <div className="col-span-2 md:col-span-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Net Worth</p>
              <div className="flex items-end gap-2 mt-1">
                <p className="text-4xl font-extrabold text-white tracking-tight leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{mc(nw.grand)}</p>
              </div>

              {/* The three things it is made of. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <span>Cash <span className="font-bold text-white">{mc(nw.personal.cash)}</span></span>
                <span>Assets <span className="font-bold text-white">{mc(nw.personal.assets)}</span></span>
                {nw.companies.length > 0 && (
                  <button
                    onClick={() => setShowCompanies(v => !v)}
                    className="flex items-center gap-1 hover:opacity-100"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    Business <span className="font-bold" style={{ color: nw.business < 0 ? '#FCA5A5' : '#FFFFFF' }}>{mc(nw.business)}</span>
                    {showCompanies
                      ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.6)' }} />
                      : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.6)' }} />}
                  </button>
                )}
                {nw.personal.debt > 0 && (
                  <span>Debt <span className="font-bold" style={{ color: '#FCA5A5' }}>{mc(nw.personal.debt)}</span></span>
                )}
                {nw.ownerLoans !== 0 && (
                  <span title="Money you lent your companies. It is a receivable to you and a payable inside them — counted once, on both sides.">
                    {nw.ownerLoans > 0 ? 'Owed to you' : 'You owe'}{' '}
                    <span className="font-bold" style={{ color: nw.ownerLoans > 0 ? '#7FD9A4' : '#FCA5A5' }}>{mc(Math.abs(nw.ownerLoans))}</span>
                  </span>
                )}
              </div>

              {/* ── Per company ─────────────────────────────────────────────── */}
              {showCompanies && nw.companies.length > 0 && (
                <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.16)' }}>
                  {nw.companies.map(c => (
                    <Link
                      key={c.company.id}
                      href={`/organization/companies/${c.company.id}`}
                      className="flex items-center gap-3 px-3.5 py-2.5"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: c.company.color ?? 'rgba(255,255,255,0.5)' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-bold text-white truncate">
                          {c.company.name}
                          {c.company.ownershipPct !== 100 && (
                            <span className="ml-1.5 font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>
                              {c.company.ownershipPct}%
                            </span>
                          )}
                        </p>
                        {/* Where the equity comes from. Cash + assets + owed to it,
                            less what it owes. This is the drill-down, not a set of
                            numbers you are invited to add to your own cash.
                            No account simply means no cash — you'd have made one
                            if there were any — so it reads as ₹0, not as a warning. */}
                        <p className="text-[10.5px] truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          Cash {fmt(c.sheet.cash)} · Assets {fmt(c.sheet.assets)} · In {fmt(c.sheet.receivables)} · Out {fmt(c.sheet.debt + c.sheet.payables)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-extrabold" style={{ color: c.yourShare < 0 ? '#FCA5A5' : '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                          {mc(c.yourShare)}
                        </p>
                        {c.company.ownershipPct !== 100 && (
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>of {fmt(c.equity)}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Money we CANNOT value is NOT in the total above. Saying so is the
                  whole point — a silent zero would just delete it. */}
              {nw.excluded.length > 0 && (
                <p className="text-[10.5px] mt-2" style={{ color: '#FCD34D' }}>
                  Not counted: {nw.excluded.map(e => `${e.what} (${e.why})`).join(' · ')}
                </p>
              )}

              {/* Counted, but at what it COST — not today's market price. A real
                  number, just not the one you think you're reading. */}
              {nw.caveats.length > 0 && (
                <p className="text-[10.5px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  At cost: {nw.caveats.map(c => c.what).join(' · ')} — no live price
                </p>
              )}
            </div>

            {/* Income / Expenses */}
            <div className="flex flex-col gap-4 md:pl-8" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Income</p>
                <p className="text-2xl font-extrabold text-white tracking-tight mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>{mc(monthlyIncome)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Expenses</p>
                <p className="text-2xl font-extrabold tracking-tight mt-1" style={{ color: '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>{mc(monthlyExpense)}</p>
              </div>
            </div>

            {/* Leftover / Profit MTD */}
            <div className="flex flex-col gap-4 md:pl-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Leftover</p>
                <p className="text-2xl font-extrabold tracking-tight mt-1" style={{ color: leftover >= 0 ? '#7FD9A4' : '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>{leftover >= 0 ? '+' : '−'}{mc(Math.abs(leftover))}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Profit MTD</p>
                <p className="text-2xl font-extrabold tracking-tight mt-1" style={{ color: profitMtdVal != null && profitMtdVal < 0 ? '#FCA5A5' : '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{profitMtdVal != null ? mc(profitMtdVal) : '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bento grid (Command layout) ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Needs attention — tall left column */}
          <div className="lg:row-span-2 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Needs attention</p>
            </div>
            <div className="space-y-2.5">
              {cardDues.slice(0, 3).map(cd => {
                const daysLeft = Math.ceil((new Date(cd.dueDate).getTime() - Date.now()) / 86400000)
                const urgent = daysLeft <= 5
                return (
                  <div key={cd.id} className="rounded-xl p-3" style={{ background: urgent ? 'rgba(200,55,42,0.06)' : 'var(--surface-2)', border: `1px solid ${urgent ? 'rgba(200,55,42,0.2)' : 'var(--border)'}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{cd.name} card due</p>
                      <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color: urgent ? 'var(--expense)' : 'var(--text-muted)' }}>{daysLeft >= 0 ? `${daysLeft}d` : `${-daysLeft}d`}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>₹{fmt(cd.amount)} payment due {new Date(cd.dueDate).toLocaleDateString('en-IN', { weekday: 'long' })}</p>
                    <button onClick={() => setPayCard(cd)} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--expense)' }}>Mark paid</button>
                  </div>
                )
              })}
              {unbilledInvoices.length > 0 && (
                <div className="rounded-xl p-3" style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{unbilledInvoices.length} unbilled invoice{unbilledInvoices.length !== 1 ? 's' : ''}</p>
                    <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color: 'var(--accent)' }}>₹{fmt(supplierDue)}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Ready to bill</p>
                  <Link href="/customers/invoices" className="mt-2 inline-block text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>Review &amp; send</Link>
                </div>
              )}
              {activeBudgets.filter(b => (b.percentage ?? 0) > 100).slice(0, 1).map(b => {
                const cat = b.category as { name?: string } | null
                return (
                  <div key={b.id} className="rounded-xl p-3" style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{cat?.name ?? 'Budget'} over</p>
                      <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color: 'var(--expense)' }}>{Math.round(b.percentage ?? 0)}%</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>₹{fmt((b.spent ?? 0) - (b.amount ?? 0))} above your monthly cap</p>
                    <Link href="/budget-insights" className="mt-2 inline-block text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>View budget</Link>
                  </div>
                )
              })}
              {cardDues.length === 0 && unbilledInvoices.length === 0 && activeBudgets.every(b => (b.percentage ?? 0) <= 100) && (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>All clear — nothing needs attention.</p>
              )}
            </div>
          </div>

          {/* 5-month trend */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>5-month trend</p>
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--income)' }} />In</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--expense)' }} />Out</span>
              </div>
            </div>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--income)" stopOpacity={0.2} /><stop offset="95%" stopColor="var(--income)" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--expense)" stopOpacity={0.15} /><stop offset="95%" stopColor="var(--expense)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }} formatter={(v: number) => [`₹${fmt(v)}`, '']} />
                  <Area type="monotone" dataKey="income" stroke="var(--income)" strokeWidth={2} fill="url(#gIncome)" dot={false} />
                  <Area type="monotone" dataKey="expense" stroke="var(--expense)" strokeWidth={2} fill="url(#gExpense)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-36 flex items-center justify-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Not enough data yet</p></div>
            )}
          </div>

          {/* Credit gauge */}
          <div className="rounded-2xl p-5 flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <p className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Credit</p>
            {credit.overallUtilisation != null ? (
              <div className="flex flex-col items-center flex-1 justify-center">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
                    <circle cx="50" cy="50" r="42" fill="none" strokeLinecap="round" strokeWidth="10"
                      stroke={credit.overallUtilisation >= 0.9 ? 'var(--expense)' : 'var(--brand)'}
                      strokeDasharray={`${Math.min(credit.overallUtilisation, 1) * 263.9} 263.9`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold" style={{ color: 'var(--text)' }}>{Math.round(credit.overallUtilisation * 100)}%</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>utilised</span>
                  </div>
                </div>
                <div className="flex gap-8 mt-3 text-center">
                  <div><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Available</p><p className="text-sm font-bold" style={{ color: 'var(--income)' }}>₹{fmt(credit.totalAvailable)}</p></div>
                  <div><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Owed</p><p className="text-sm font-bold" style={{ color: 'var(--expense)' }}>₹{fmt(credit.totalOutstanding)}</p></div>
                </div>
              </div>
            ) : <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>No credit cards</p>}
          </div>

          {/* Top spend — single ring with payee picker */}
          <TopSpendCard rings={payeeRings} />

          {/* Budgets */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Budgets</p>
              <Link href="/budget-insights" className="text-xs font-medium" style={{ color: 'var(--brand)' }}>All</Link>
            </div>
            {activeBudgets.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>No active budgets</p>
            ) : (
              <div className="space-y-3">
                {activeBudgets.map(b => {
                  const pct = Math.min(b.percentage ?? 0, 100)
                  const over = (b.percentage ?? 0) > 100
                  const cat = b.category as { name?: string; icon?: string } | null
                  return (
                    <div key={b.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {cat?.icon && <span className="text-sm">{getCategoryEmoji(cat.icon)}</span>}
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{cat?.name ?? 'Budget'}</p>
                        </div>
                        <p className="text-xs shrink-0 ml-2" style={{ color: over ? 'var(--expense)' : 'var(--text-muted)' }}>{Math.round(b.percentage ?? 0)}%</p>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? 'var(--expense)' : pct > 80 ? 'var(--amber)' : 'var(--brand)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent transactions (full width) ────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Recent transactions</p>
            <Link href="/transactions" className="text-xs font-medium" style={{ color: 'var(--brand)' }}>View all</Link>
          </div>
          {txSlice.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>No transactions yet</p>
          ) : (
            <div className="grid sm:grid-cols-2">
              {txSlice.map((tx, i) => {
                const acct = tx.account as { name?: string } | undefined
                const cat = tx.category as { name?: string; icon?: string } | undefined
                const income = tx.type === 'income'
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderTop: i >= 2 ? '1px solid var(--border)' : 'none' }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base shrink-0">{tx.type === 'transfer' ? '↔️' : getCategoryEmoji(cat?.icon)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{tx.name || cat?.name || 'Uncategorised'}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{acct?.name ?? ''}{acct?.name ? ' · ' : ''}{getRelativeDate(tx.date)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold shrink-0" style={{ color: income ? 'var(--income)' : 'var(--expense)' }}>{income ? '+' : '−'}₹{fmt(tx.amount)}</p>
                  </div>
                )
              })}
            </div>
          )}
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
          statementDate={payCard.statementDate}
          remainingDue={payCard.amount}
          accounts={accounts}
          onClose={() => setPayCard(null)}
        />
      )}
    </div>
  )
}
