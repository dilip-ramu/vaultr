'use client'

import { TrendingUp, TrendingDown, Wallet, AlertTriangle, FileText, Truck, Users, CreditCard, Receipt, DollarSign } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { Forecast, ForecastItem } from '@/lib/forecast'

const fmt = (n: number) => formatCurrency(n)

const KIND_META: Record<ForecastItem['kind'], { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  customer_invoice: { label: 'Customer invoice', icon: FileText },
  commission:       { label: 'Commission',       icon: DollarSign },
  supplier_invoice: { label: 'Supplier invoice', icon: Truck },
  bill:             { label: 'Bill',             icon: Receipt },
  payroll:          { label: 'Payroll',          icon: Users },
  card_due:         { label: 'Card payment',     icon: CreditCard },
}

export default function ForecastClient({ forecast }: { forecast: Forecast }) {
  const anyTight = forecast.weeks.some(w => w.tight)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-heading" style={{ color: 'var(--text)' }}>30-Day Forecast</h1>
        <p className="text-caption">Where your bank balance is heading, from everything due in and out</p>
      </div>

      {/* Headline */}
      <div className="card p-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-caption">In the bank today</p>
          <p className="text-display" style={{ color: 'var(--text)' }}>{fmt(forecast.startingBalance)}</p>
        </div>
        <div>
          <p className="text-caption">Expected in</p>
          <p className="text-heading amount-income">+{fmt(forecast.totalIn)}</p>
        </div>
        <div>
          <p className="text-caption">Expected out</p>
          <p className="text-heading amount-expense">−{fmt(forecast.totalOut)}</p>
        </div>
        <div>
          <p className="text-caption">Projected in 30 days</p>
          <p
            className="text-heading"
            style={{ color: forecast.endBalance >= 0 ? 'var(--income)' : 'var(--expense)' }}
          >
            {fmt(forecast.endBalance)}
          </p>
        </div>
      </div>

      {anyTight && (
        <div
          className="card p-3 flex items-center gap-2 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--expense)' }} />
          <span style={{ color: 'var(--text)' }}>
            Heads up — the balance dips below zero in a highlighted week. Chase the inflows or shift an outflow.
          </span>
        </div>
      )}

      {/* Weeks */}
      {forecast.weeks.map(week => (
        <div
          key={week.label}
          className="card p-4 space-y-3"
          style={week.tight ? { borderColor: 'rgba(239,68,68,0.4)' } : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-heading" style={{ color: week.tight ? 'var(--expense)' : 'var(--text)' }}>
                {week.label}
              </h2>
              <span className="text-caption">
                {week.label === 'Overdue'
                  ? 'should have already moved'
                  : `${formatDateShort(week.from)} – ${formatDateShort(week.to)}`}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {week.inflow > 0 && <span className="amount-income">+{fmt(week.inflow)}</span>}
              {week.outflow > 0 && <span className="amount-expense">−{fmt(week.outflow)}</span>}
              <span className="flex items-center gap-1 font-medium" style={{ color: week.projectedBalance >= 0 ? 'var(--text)' : 'var(--expense)' }}>
                <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
                {fmt(week.projectedBalance)}
              </span>
            </div>
          </div>

          {week.items.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Nothing due this week.</p>
          ) : (
            <div className="space-y-1.5">
              {week.items.map((it, i) => {
                const meta = KIND_META[it.kind]
                const Icon = meta.icon
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
                    <span className="w-14 shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatDateShort(it.date)}
                    </span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{it.label}</span>
                    <span className={it.direction === 'in' ? 'amount-income' : 'amount-expense'}>
                      {it.direction === 'in' ? '+' : '−'}{fmt(it.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      <p className="text-caption flex items-center gap-1">
        {forecast.endBalance >= forecast.startingBalance
          ? <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--income)' }} />
          : <TrendingDown className="w-3.5 h-3.5" style={{ color: 'var(--expense)' }} />}
        Based on due dates of unpaid invoices, bills, finalized payroll and card statements. Items without due dates use their document date.
      </p>
    </div>
  )
}
