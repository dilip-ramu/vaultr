'use client'

import Link from 'next/link'
import { generateInsights, type Insight } from '@/lib/insights'
import type { Transaction, Account, Budget, Bill, Category } from '@/lib/types'
import { formatCurrency, getMonthYear } from '@/lib/utils'

interface Props {
  transactions: Transaction[]
  accounts: Account[]
  budgets: Budget[]
  bills: Bill[]
  currentMonth: string
  hideHeader?: boolean
  // Optional explicit period. When provided, all "this period" summary numbers
  // and insight copy use it instead of the calendar month.
  periodStart?: string
  periodEnd?: string
  periodLabel?: string
}

const TYPE_STYLE: Record<Insight['type'], { bg: string; border: string; dot: string }> = {
  positive: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', dot: 'var(--income)' },
  warning:  { bg: 'color-mix(in srgb, var(--amber) 8%, transparent)', border: 'color-mix(in srgb, var(--amber) 20%, transparent)', dot: 'var(--amber)' },
  info:     { bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.15)', dot: 'var(--brand)' },
  alert:    { bg: 'color-mix(in srgb, var(--expense) 7%, transparent)',  border: 'color-mix(in srgb, var(--expense) 20%, transparent)',   dot: 'var(--expense)' },
}

export default function InsightsClient({ transactions, accounts, budgets, bills, currentMonth, hideHeader = false, periodStart, periodEnd, periodLabel }: Props) {
  const now = new Date(currentMonth)
  const insights = generateInsights({ transactions, accounts, budgets, bills, currentMonth: now, periodStart, periodEnd, periodLabel })

  // ── Summary computations ──────────────────────────────────
  const cy = now.getFullYear()
  const cm = now.getMonth()
  const thisStart = periodStart ?? `${cy}-${String(cm + 1).padStart(2, '0')}-01`
  const thisEnd   = periodEnd   ?? new Date(cy, cm + 1, 0).toISOString().split('T')[0]

  const thisTx = transactions.filter(t => t.date >= thisStart && t.date <= thisEnd)
  const thisIncome  = thisTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const thisExpense = thisTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netWorth = accounts.filter(a => a.include_in_net_worth).reduce((s, a) => s + (a.balance ?? 0), 0)
  const netChange = thisIncome - thisExpense

  // Top 3 spending categories (with color)
  const catMap: Record<string, { name: string; color: string; total: number }> = {}
  for (const tx of thisTx.filter(t => t.type === 'expense')) {
    const cat = tx.category as Category | undefined
    if (!cat) continue
    if (!catMap[cat.id]) catMap[cat.id] = { name: cat.name, color: cat.color, total: 0 }
    catMap[cat.id].total += tx.amount
  }
  const topCats = Object.values(catMap).sort((a, b) => b.total - a.total).slice(0, 3)
  const maxCatTotal = topCats[0]?.total ?? 1

  return (
    <div className={hideHeader ? 'space-y-5' : 'w-full px-4 md:px-8 py-6 space-y-5'}>

      {/* Header */}
      {!hideHeader ? (
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Your Financial Pulse</h1>
          <p className="text-caption">{periodLabel ?? getMonthYear(now)}</p>
        </div>
      ) : (
        <p className="text-caption">Insights — {periodLabel ?? getMonthYear(now)}</p>
      )}

      {/* Insight cards */}
      {insights.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-2xl mb-3">✨</p>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No insights yet</p>
          <p className="text-caption">Add transactions and budgets to unlock personalized insights.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const s = TYPE_STYLE[insight.type]
            return (
              <div
                key={insight.id}
                className="rounded-2xl p-4 fade-in"
                style={{
                  backgroundColor: s.bg,
                  border: `1px solid ${s.border}`,
                  animationDelay: `${i * 60}ms`,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon circle */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${s.dot}18` }}
                  >
                    {insight.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>
                      {insight.title}
                    </p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {insight.body}
                    </p>
                    {insight.action && (
                      <Link
                        href={insight.action.href}
                        className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-lg border transition-colors"
                        style={{ color: s.dot, borderColor: `${s.dot}40`, backgroundColor: `${s.dot}08` }}
                      >
                        {insight.action.label} →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Financial summary footer */}
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-label" style={{ color: 'var(--text-faint)' }}>Month Summary</p>

        {/* Net worth + change */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Net Worth</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>
              {formatCurrency(netWorth)}
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor: netChange >= 0 ? 'rgba(16,185,129,0.1)' : 'color-mix(in srgb, var(--expense) 10%, transparent)',
              color: netChange >= 0 ? 'var(--income)' : 'var(--expense)',
            }}
          >
            {netChange >= 0 ? '+' : ''}{formatCurrency(netChange)} this month
          </div>
        </div>

        {/* Income vs Expense */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}
          >
            <p className="text-label mb-1" style={{ color: 'var(--income)' }}>Income</p>
            <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text)' }}>
              {formatCurrency(thisIncome)}
            </p>
          </div>
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--expense) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--expense) 15%, transparent)' }}
          >
            <p className="text-label mb-1" style={{ color: 'var(--expense)' }}>Expenses</p>
            <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text)' }}>
              {formatCurrency(thisExpense)}
            </p>
          </div>
        </div>

        {/* Top 3 spending categories — CSS bar chart */}
        {topCats.length > 0 && (
          <div className="space-y-3">
            <p className="text-label" style={{ color: 'var(--text-faint)' }}>Top Spending</p>
            {topCats.map(cat => (
              <div key={cat.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{cat.name}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                    {formatCurrency(cat.total)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${(cat.total / maxCatTotal) * 100}%`,
                      backgroundColor: cat.color || 'var(--brand)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
