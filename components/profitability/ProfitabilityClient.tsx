'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Scale, CalendarRange } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  summarize, monthlyHistory,
  type ProfitabilityData, type ProfitSummary,
} from '@/lib/profitability'

interface Props {
  data: ProfitabilityData
}

type Preset = '1m' | '3m' | '6m' | '1y' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: '1m', label: '1 Month' },
  { key: '3m', label: '3 Months' },
  { key: '6m', label: '6 Months' },
  { key: '1y', label: '1 Year' },
  { key: 'custom', label: 'Custom' },
]

const iso = (d: Date) => d.toISOString().split('T')[0]

function presetRange(preset: Preset): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  const months = preset === '1m' ? 1 : preset === '3m' ? 3 : preset === '6m' ? 6 : 12
  from.setMonth(from.getMonth() - months)
  return { from: iso(from), to: iso(to) }
}

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

export default function ProfitabilityClient({ data }: Props) {
  const [preset, setPreset] = useState<Preset>('1m')
  const [customFrom, setCustomFrom] = useState(() => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [customTo, setCustomTo] = useState(() => iso(new Date()))

  const range = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset)

  const summary = useMemo(
    () => summarize(data, range.from, range.to),
    [data, range.from, range.to],
  )
  const months = useMemo(() => monthlyHistory(data), [data])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-heading" style={{ color: 'var(--text)' }}>Profitability</h1>
        <p className="text-caption">Expected vs actual earnings — inwards, outwards and what&apos;s outstanding</p>
      </div>

      {/* Filter bar */}
      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-base"
              style={preset === p.key
                ? { background: 'var(--brand)', color: '#fff' }
                : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CalendarRange className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="date" value={customFrom} max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>to</span>
            <input
              type="date" value={customTo} min={customFrom}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </div>
        )}
        <p className="text-caption">
          Showing {range.from} → {range.to} · Expected is dated by due date; Actual by transaction date
        </p>
      </div>

      {/* Side-by-side summary */}
      <SummaryCards s={summary} />

      {/* Source breakdown for the selected range */}
      <Breakdown s={summary} />

      {/* Monthly history */}
      <div className="space-y-3">
        <div>
          <h2 className="text-heading" style={{ color: 'var(--text)' }}>Monthly profitability</h2>
          <p className="text-caption">1st → last day of each month, newest first</p>
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
