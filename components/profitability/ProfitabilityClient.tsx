'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Scale } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  summarize, monthlyHistory,
  type ProfitLine, type ProfitSummary,
} from '@/lib/profitability'
import PeriodPills, { type PeriodValue } from '@/components/shared/PeriodPills'
import { bounds } from '@/lib/budget-insights/period'

interface Props {
  lines: ProfitLine[]
}

const iso = (d: Date) => d.toISOString().split('T')[0]

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

const fmt = (n: number) => formatCurrency(n)

function NetBadge({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span
      className="inline-flex items-center gap-1 text-sm font-semibold"
      style={{ color: positive ? 'var(--income)' : 'var(--expense)' }}
    >
      {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {fmt(value)}
    </span>
  )
}

// ── Summary cards (Expected | Actual | Outstanding) ─────────────────────────

function SummaryCards({ s }: { s: ProfitSummary }) {
  const cards = [
    {
      title: 'Expected', sub: 'Booked — realised + unrealised',
      income: s.expectedIncome, expense: s.expectedExpense, net: s.expectedNet,
    },
    {
      title: 'Actual', sub: 'Realised — transactions only',
      income: s.actualIncome, expense: s.actualExpense, net: s.actualNet,
    },
    {
      title: 'Outstanding', sub: 'Expected − Actual',
      income: s.outstandingIncome, expense: s.outstandingExpense, net: s.outstandingNet,
    },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map(c => (
        <div key={c.title} className="card p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              <h2 className="text-heading" style={{ color: 'var(--text)' }}>{c.title}</h2>
            </div>
            <p className="text-caption">{c.sub}</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Inwards</span>
              <span className="amount-income font-medium">{fmt(c.income)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Outwards</span>
              <span className="amount-expense font-medium">{fmt(c.expense)}</span>
            </div>
            <div
              className="flex justify-between pt-2 mt-1"
              style={{ borderTop: '1px solid var(--border-2)' }}
            >
              <span className="font-medium" style={{ color: 'var(--text)' }}>Net</span>
              <NetBadge value={c.net} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Expected source breakdown ────────────────────────────────────────────────

function Breakdown({ s }: { s: ProfitSummary }) {
  const b = s.breakdown
  const rows = ([
    { label: 'Customer invoices', amount: b.customerInvoices, side: 'in' },
    { label: 'Incoming (commission)', amount: b.commission, side: 'in' },
    { label: 'Payroll income', amount: b.payrollIncome, side: 'in' },
    { label: 'Direct income (transactions)', amount: b.directIncome, side: 'in' },
    { label: 'Supplier invoices', amount: b.supplierInvoices, side: 'out' },
    { label: 'Payroll salaries', amount: b.payrollSalaries, side: 'out' },
    { label: 'Direct expenses (transactions)', amount: b.directExpense, side: 'out' },
  ] as { label: string; amount: number; side: 'in' | 'out' }[]).filter(r => r.amount !== 0)

  if (rows.length === 0) return null

  return (
    <div className="card p-4">
      <h3 className="text-heading mb-3" style={{ color: 'var(--text)' }}>
        Expected — by source
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
            <span className={r.side === 'in' ? 'amount-income' : 'amount-expense'}>
              {r.side === 'out' ? '−' : ''}{fmt(r.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ProfitabilityClient({ lines }: Props) {
  const [preset, setPreset] = useState<PeriodValue>('month')
  const [customFrom, setCustomFrom] = useState(() => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [customTo, setCustomTo] = useState(() => iso(new Date()))

  const range = bounds(preset, customFrom, customTo)

  const summary = useMemo(
    () => summarize(lines, range.from, range.to),
    [lines, range.from, range.to],
  )
  // History shows only COMPLETED months (current month lives in the cards above)
  const months = useMemo(() => {
    const currentKey = iso(new Date()).slice(0, 7)
    return monthlyHistory(lines).filter(m => m.month < currentKey)
  }, [lines])

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Profitability</h1>
        <p className="text-caption">Expected vs actual earnings — inwards, outwards and what&apos;s outstanding</p>
      </div>

      {/* Filter bar */}
      <div className="card p-3 space-y-3">
        <PeriodPills
          value={preset}
          onChange={p => setPreset(p)}
          customFrom={customFrom}
          customTo={customTo}
          onApplyCustom={(from, to) => { setCustomFrom(from); setCustomTo(to); setPreset('custom') }}
        />
        <p className="text-caption">
          Showing {range.from} → {range.to} · Expected is dated by due date; Actual by transaction date
        </p>
      </div>

      {/* Hero: earned vs should-have, and how deep/high you are */}
      <div className="card p-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-caption">{preset === 'month' ? 'This month till date — earned' : 'Earned (actual net)'}</p>
          <p
            className="text-display"
            style={{ color: summary.actualNet >= 0 ? 'var(--income)' : 'var(--expense)' }}
          >
            {fmt(summary.actualNet)}
          </p>
        </div>
        <div>
          <p className="text-caption">Should have (expected net)</p>
          <p
            className="text-heading"
            style={{ color: summary.expectedNet >= 0 ? 'var(--income)' : 'var(--expense)' }}
          >
            {fmt(summary.expectedNet)}
          </p>
        </div>
        <div>
          <p className="text-caption">Still outstanding</p>
          <p className="text-heading" style={{ color: 'var(--text)' }}>{fmt(summary.outstandingNet)}</p>
        </div>
      </div>

      {/* Side-by-side summary */}
      <SummaryCards s={summary} />

      {/* Source breakdown for the selected range */}
      <Breakdown s={summary} />

      {/* Monthly history */}
      <div className="space-y-3">
        <div>
          <h2 className="text-heading" style={{ color: 'var(--text)' }}>Monthly profitability</h2>
          <p className="text-caption">Completed months only, newest first</p>
        </div>

        {/* Desktop table */}
        <div className="card overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Month</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Expected In</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Expected Out</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Expected Net</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Actual In</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Actual Out</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Actual Net</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month} style={{ borderBottom: '1px solid var(--border-2)' }}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text)' }}>
                    {monthLabel(m.month)}
                  </td>
                  <td className="px-4 py-3 text-right amount-income">{fmt(m.expectedIncome)}</td>
                  <td className="px-4 py-3 text-right amount-expense">{fmt(m.expectedExpense)}</td>
                  <td className="px-4 py-3 text-right font-medium"
                      style={{ color: m.expectedNet >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                    {fmt(m.expectedNet)}
                  </td>
                  <td className="px-4 py-3 text-right amount-income">{fmt(m.actualIncome)}</td>
                  <td className="px-4 py-3 text-right amount-expense">{fmt(m.actualExpense)}</td>
                  <td className="px-4 py-3 text-right font-medium"
                      style={{ color: m.actualNet >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                    {fmt(m.actualNet)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text)' }}>
                    {fmt(m.outstandingNet)}
                  </td>
                </tr>
              ))}
              {months.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    No data yet — add transactions or invoices to see profitability.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {months.map(m => (
            <div key={m.month} className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{monthLabel(m.month)}</span>
                <NetBadge value={m.actualNet} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Expected net</span>
                <span className="text-right font-medium"
                      style={{ color: m.expectedNet >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {fmt(m.expectedNet)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>Actual net</span>
                <span className="text-right font-medium"
                      style={{ color: m.actualNet >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {fmt(m.actualNet)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>Outstanding</span>
                <span className="text-right font-medium" style={{ color: 'var(--text)' }}>
                  {fmt(m.outstandingNet)}
                </span>
              </div>
            </div>
          ))}
          {months.length === 0 && (
            <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No data yet — add transactions or invoices to see profitability.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
