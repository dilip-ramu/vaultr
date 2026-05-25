'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, AlertCircle, Package } from 'lucide-react'
import { formatCurrency, formatDate, getDaysUntil } from '@/lib/utils'
import AWBProfitabilityTable from './AWBProfitabilityTable'

// ── Exported data types (imported by analytics page) ──────
export interface MonthlyDataPoint {
  yearMonth: string
  label: string
  courierSpend: number
  billed: number
  margin: number
  marginPct: number
}
export interface ProviderDataPoint { provider: string; amount: number }
export interface CustomerDataPoint { customerId: string; name: string; totalBilled: number; invoiceCount: number }
export interface OutstandingInvoiceData {
  id: string; invoiceNumber: string; customerName: string
  amount: number; dueDate: string | null; status: 'sent' | 'overdue'
}
export interface UnallocatedAWBData {
  id: string; awbNumber: string; courierId: string; courierProvider: string
  shipmentDate: string | null; totalCharge: number; totalPieces: number
}

interface Props {
  monthlyData: MonthlyDataPoint[]
  providerBreakdown: ProviderDataPoint[]
  topCustomers: CustomerDataPoint[]
  outstandingInvoices: OutstandingInvoiceData[]
  unallocatedAWBs: UnallocatedAWBData[]
  thisMonthSpend: number
  thisMonthBilled: number
  thisMonthMargin: number
  thisMonthMarginPct: number
  totalOutstanding: number
  currency?: string
}

// ── Inline SVG bar chart ───────────────────────────────────
function SpendBilledChart({ data }: { data: MonthlyDataPoint[] }) {
  const W = 560, H = 180, padL = 8, padR = 8, padT = 8, padB = 28
  const chartH = H - padT - padB
  const maxVal = Math.max(...data.flatMap(d => [d.courierSpend, d.billed]), 1)
  const groupW = (W - padL - padR) / data.length
  const bw = Math.floor(Math.min(22, (groupW - 10) / 2))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} aria-hidden>
      {/* Baseline */}
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH}
            stroke="var(--border)" strokeWidth="1" />
      {data.map((d, i) => {
        const cx = padL + i * groupW + groupW / 2
        const h1 = maxVal > 0 ? (d.courierSpend / maxVal) * chartH : 0
        const h2 = maxVal > 0 ? (d.billed / maxVal) * chartH : 0
        return (
          <g key={d.yearMonth}>
            {h1 > 0 && (
              <rect x={cx - bw - 2} y={padT + chartH - h1} width={bw} height={h1}
                    fill="var(--brand)" rx="2" opacity="0.85" />
            )}
            {h2 > 0 && (
              <rect x={cx + 2} y={padT + chartH - h2} width={bw} height={h2}
                    fill="var(--income)" rx="2" opacity="0.85" />
            )}
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-faint)">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Inline SVG margin % line chart ────────────────────────
function MarginLineChart({ data }: { data: MonthlyDataPoint[] }) {
  const W = 560, H = 180, padL = 8, padR = 8, padT = 16, padB = 28
  const chartH = H - padT - padB
  const n = data.length
  if (n < 2) return null

  const maxAbs = Math.max(...data.map(d => Math.abs(d.marginPct)), 10)
  const toX = (i: number) => padL + (i / (n - 1)) * (W - padL - padR)
  const toY = (pct: number) => padT + chartH / 2 - (pct / maxAbs) * (chartH / 2)
  const zeroY = toY(0)
  const pts = data.map((d, i) => `${toX(i)},${toY(d.marginPct)}`).join(' ')

  function marginDotColor(pct: number) {
    if (pct >= 15) return 'var(--income)'
    if (pct >= 5)  return 'var(--status-warning)'
    return 'var(--expense)'
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} aria-hidden>
      {/* Zero baseline */}
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
      {/* 0% label */}
      <text x={padL} y={zeroY - 3} fontSize="8" fill="var(--text-faint)">0%</text>

      {/* Line */}
      <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />

      {/* Points + labels */}
      {data.map((d, i) => (
        <g key={d.yearMonth}>
          <circle cx={toX(i)} cy={toY(d.marginPct)} r="4"
                  fill={marginDotColor(d.marginPct)} stroke="var(--surface)" strokeWidth="1.5" />
          {/* Value label */}
          <text x={toX(i)} y={toY(d.marginPct) - 8} textAnchor="middle"
                fontSize="9" fill={marginDotColor(d.marginPct)} fontWeight="600">
            {d.marginPct.toFixed(0)}%
          </text>
          <text x={toX(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-faint)">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── Main dashboard ─────────────────────────────────────────
export default function LogisticsDashboard({
  monthlyData,
  providerBreakdown,
  topCustomers,
  outstandingInvoices,
  unallocatedAWBs,
  thisMonthSpend,
  thisMonthBilled,
  thisMonthMargin,
  thisMonthMarginPct,
  totalOutstanding,
  currency = 'INR',
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  const marginColor = thisMonthMarginPct >= 15
    ? 'var(--income)' : thisMonthMarginPct >= 5 ? 'var(--status-warning)' : 'var(--expense)'

  const maxProviderAmount = Math.max(...providerBreakdown.map(p => p.amount), 1)
  const today = new Date().toISOString().split('T')[0]

  const isEmpty = monthlyData.every(d => d.courierSpend === 0 && d.billed === 0)

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/logistics" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Analytics</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Last 6 months · Logistics profitability</p>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand-light)' }}>
            <TrendingUp className="w-7 h-7" style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No data yet</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Upload your first courier invoice to start tracking profitability.
            </p>
          </div>
          <Link
            href="/logistics/courier-invoices/new"
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Upload Invoice
          </Link>
        </div>
      )}

      {/* ── Summary cards ──────────────────────────────────── */}
      {!isEmpty && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Courier Spend', value: formatCurrency(thisMonthSpend, currency), color: 'var(--expense)', sub: 'This month' },
            { label: 'Total Billed', value: formatCurrency(thisMonthBilled, currency), color: 'var(--income)', sub: 'This month' },
            { label: 'Gross Margin', value: `${formatCurrency(thisMonthMargin, currency)} (${thisMonthMarginPct.toFixed(1)}%)`, color: marginColor, sub: 'This month' },
            { label: 'Outstanding', value: formatCurrency(totalOutstanding, currency), color: totalOutstanding > 0 ? 'var(--status-warning)' : 'var(--income)', sub: `${outstandingInvoices.length} invoice${outstandingInvoices.length !== 1 ? 's' : ''}` },
          ].map(c => (
            <div key={c.label} className="card p-4">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
              <p className="text-base font-bold tabular-nums leading-tight" style={{ color: c.color }}>{c.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts ─────────────────────────────────────────── */}
      {!isEmpty && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Bar chart: Spend vs Billed */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Spend vs Billed</p>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--brand)' }} />
                  Spend
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--income)' }} />
                  Billed
                </span>
              </div>
            </div>
            <SpendBilledChart data={monthlyData} />
          </div>

          {/* Line chart: Margin % */}
          <div className="card p-4 space-y-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Margin % by Month</p>
            <MarginLineChart data={monthlyData} />
          </div>
        </div>
      )}

      {/* ── Month drill-down ───────────────────────────────── */}
      {!isEmpty && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>AWB Profitability</p>
          <div className="flex gap-1.5 flex-wrap">
            {monthlyData.map(m => (
              <button
                key={m.yearMonth}
                type="button"
                onClick={() => setSelectedMonth(prev => prev === m.yearMonth ? null : m.yearMonth)}
                className="tap-scale px-2.5 py-1.5 rounded-lg text-xs font-semibold min-h-[36px]"
                style={{
                  backgroundColor: selectedMonth === m.yearMonth ? 'var(--brand)' : 'var(--surface-2)',
                  color: selectedMonth === m.yearMonth ? '#fff' : 'var(--text-muted)',
                }}
              >
                {m.label}
              </button>
            ))}
            {selectedMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}
              >
                Clear
              </button>
            )}
          </div>
          {selectedMonth
            ? <AWBProfitabilityTable month={selectedMonth} currency={currency} />
            : (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>
                Select a month above to see AWB details.
              </p>
            )
          }
        </div>
      )}

      {/* ── Provider breakdown ─────────────────────────────── */}
      {!isEmpty && providerBreakdown.length > 0 && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>By Courier (6 months)</p>
          <div className="space-y-2.5">
            {providerBreakdown.map(p => (
              <div key={p.provider}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium capitalize" style={{ color: 'var(--text)' }}>{p.provider}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {formatCurrency(p.amount, currency)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(p.amount / maxProviderAmount) * 100}%`,
                      backgroundColor: 'var(--brand)',
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top customers ──────────────────────────────────── */}
      {topCustomers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Top Customers (6 months)</p>
          </div>
          <div
            className="grid gap-2 px-4 py-2 text-xs font-semibold"
            style={{ gridTemplateColumns: '1fr 50px 90px', backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            <span>Customer</span>
            <span className="text-center">Invoices</span>
            <span className="text-right">Billed</span>
          </div>
          {topCustomers.map((c, i) => (
            <div
              key={c.customerId}
              className={`grid gap-2 px-4 py-3 items-center text-sm ${i > 0 ? 'border-t' : ''}`}
              style={{ gridTemplateColumns: '1fr 50px 90px', borderColor: 'var(--border)' }}
            >
              <span className="font-medium truncate" style={{ color: 'var(--text)' }}>{c.name}</span>
              <span className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>{c.invoiceCount}</span>
              <span className="text-right font-semibold tabular-nums" style={{ color: 'var(--income)' }}>
                {formatCurrency(c.totalBilled, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Outstanding invoices ───────────────────────────── */}
      {outstandingInvoices.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <AlertCircle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Outstanding ({outstandingInvoices.length})
            </p>
            <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: 'var(--status-warning)' }}>
              {formatCurrency(totalOutstanding, currency)}
            </span>
          </div>
          {outstandingInvoices.map((inv, i) => {
            const daysUntil = inv.dueDate ? getDaysUntil(inv.dueDate) : null
            const isOverdue = inv.status === 'overdue' || (daysUntil !== null && daysUntil < 0)
            return (
              <Link
                key={inv.id}
                href={`/logistics/supplier-invoices/${inv.id}`}
                className={`tap-scale flex items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t' : ''}`}
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs font-bold" style={{ color: 'var(--text)' }}>
                      {inv.invoiceNumber}
                    </p>
                    {isOverdue && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--status-overdue-bg)', color: 'var(--status-overdue-text)' }}>
                        OVERDUE
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {inv.customerName}
                    {inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: isOverdue ? 'var(--expense)' : 'var(--text)' }}>
                  {formatCurrency(inv.amount, currency)}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── Unallocated AWBs ───────────────────────────────── */}
      {unallocatedAWBs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Unallocated AWBs ({unallocatedAWBs.length})
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              These shipments have no supplier allocations — revenue not tracked.
            </p>
          </div>
          {unallocatedAWBs.map((awb, i) => (
            <div
              key={awb.id}
              className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`}
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--surface-2)' }}>
                <Package className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-bold" style={{ color: 'var(--text)' }}>{awb.awbNumber}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {awb.courierProvider}
                  {awb.shipmentDate ? ` · ${formatDate(awb.shipmentDate)}` : ''}
                  {` · ${awb.totalPieces} PCS`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm tabular-nums" style={{ color: 'var(--expense)' }}>
                  {formatCurrency(awb.totalCharge, currency)}
                </p>
                <Link
                  href={`/logistics/courier-invoices/${awb.courierId}/awbs/${awb.id}/allocate`}
                  className="text-xs font-semibold mt-0.5 inline-block"
                  style={{ color: 'var(--brand)' }}
                >
                  Allocate →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state for each section */}
      {!isEmpty && outstandingInvoices.length === 0 && unallocatedAWBs.length === 0 && topCustomers.length === 0 && (
        <div className="card p-6 text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--income)' }}>All caught up!</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            No outstanding invoices and all AWBs are allocated.
          </p>
        </div>
      )}
    </div>
  )
}
