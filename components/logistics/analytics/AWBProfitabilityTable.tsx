'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'

interface AWBRow {
  id: string
  awb_number: string
  shipment_date: string | null
  destination_country: string | null
  destination_city: string | null
  awb_cost: number
  total_pieces: number
  allocated_pieces: number
  courier_provider: string
  courier_invoice_id: string
  courier_invoice_number: string
  invoice_date: string
  total_billed: number
  gross_margin: number
  margin_pct: number
  user_id: string
}

type SortKey = 'awb_number' | 'awb_cost' | 'total_billed' | 'gross_margin' | 'margin_pct' | 'shipment_date'

function marginColor(pct: number): string {
  if (pct >= 15) return 'var(--income)'
  if (pct >= 5)  return 'var(--status-warning)'
  return 'var(--expense)'
}

interface Props {
  month: string    // YYYY-MM
  currency?: string
}

export default function AWBProfitabilityTable({ month, currency = 'INR' }: Props) {
  const [rows, setRows] = useState<AWBRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('awb_cost')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const monthStart = `${month}-01`
      const nextMonth = new Date(`${month}-01`)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const monthEnd = nextMonth.toISOString().split('T')[0]

      const { data, error: dbErr } = await supabase
        .from('logistics_awb_profitability' as never)
        .select('*')
        .eq('user_id', user.id)
        .gte('invoice_date', monthStart)
        .lt('invoice_date', monthEnd)
        .order('awb_cost', { ascending: false })

      if (dbErr) throw new Error(dbErr.message)
      setRows((data ?? []) as AWBRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { fetchRows() }, [fetchRows])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? ''
    const bv = b[sortKey] ?? ''
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const SortIcon = ({ k }: { k: SortKey }) => (
    sortKey === k
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />)
      : null
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading AWBs…</span>
      </div>
    )
  }

  if (error) {
    const isMissingView = error.toLowerCase().includes('relation') || error.toLowerCase().includes('does not exist')
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface-2)' }}>
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--expense)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {isMissingView ? 'Analytics view not set up' : 'Error loading data'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isMissingView
              ? 'Run supabase/migration_v8b_analytics_view.sql in the Supabase SQL editor.'
              : error}
          </p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
        No AWBs found for this month.
      </p>
    )
  }

  const totals = rows.reduce(
    (acc, r) => ({ cost: acc.cost + r.awb_cost, billed: acc.billed + r.total_billed, margin: acc.margin + r.gross_margin }),
    { cost: 0, billed: 0, margin: 0 }
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 640 }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            {(
              [
                { key: 'awb_number', label: 'AWB #' },
                { key: null,         label: 'Courier' },
                { key: null,         label: 'Destination' },
                { key: null,         label: 'PCS' },
                { key: 'awb_cost',   label: 'Cost' },
                { key: 'total_billed', label: 'Billed' },
                { key: 'gross_margin', label: 'Margin' },
                { key: 'margin_pct', label: 'Margin %' },
              ] as { key: SortKey | null; label: string }[]
            ).map(({ key, label }) => (
              <th
                key={label}
                onClick={key ? () => handleSort(key) : undefined}
                className={`px-3 py-2 text-left font-semibold text-xs ${key ? 'cursor-pointer select-none' : ''}`}
              >
                {label}{key && <SortIcon k={key} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.id}
              className={i % 2 === 0 ? '' : ''}
              style={{
                borderTop: '1px solid var(--border)',
                backgroundColor: i % 2 === 1 ? 'var(--surface-2)' : undefined,
              }}
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/logistics/courier-invoices/${row.courier_invoice_id}/awbs/${row.id}`}
                  className="font-mono font-bold text-xs hover:underline"
                  style={{ color: 'var(--brand)' }}
                >
                  {row.awb_number}
                </Link>
                {row.shipment_date && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {formatDate(row.shipment_date)}
                  </p>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                {row.courier_provider}
              </td>
              <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                {[row.destination_city, row.destination_country].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-3 py-2.5 text-center font-mono text-xs" style={{ color: 'var(--text)' }}>
                {row.total_pieces}
                {row.allocated_pieces < row.total_pieces && (
                  <span className="ml-1 text-[10px]" style={{ color: 'var(--status-warning)' }}>
                    ({row.allocated_pieces}/{row.total_pieces})
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: 'var(--expense)' }}>
                {formatCurrency(row.awb_cost, currency)}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-right font-semibold" style={{ color: 'var(--income)' }}>
                {formatCurrency(row.total_billed, currency)}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: marginColor(row.margin_pct) }}>
                {formatCurrency(row.gross_margin, currency)}
              </td>
              <td className="px-3 py-2.5 text-right">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-xs font-bold tabular-nums"
                  style={{
                    backgroundColor: row.margin_pct >= 15 ? 'var(--status-paid-bg)' : row.margin_pct >= 5 ? 'var(--status-pending-bg)' : 'var(--status-cancelled-bg)',
                    color: marginColor(row.margin_pct),
                  }}
                >
                  {row.margin_pct.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--border)', backgroundColor: 'var(--surface-2)' }}>
            <td colSpan={4} className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {rows.length} AWBs
            </td>
            <td className="px-3 py-2 tabular-nums text-right text-sm font-bold" style={{ color: 'var(--expense)' }}>
              {formatCurrency(totals.cost, currency)}
            </td>
            <td className="px-3 py-2 tabular-nums text-right text-sm font-bold" style={{ color: 'var(--income)' }}>
              {formatCurrency(totals.billed, currency)}
            </td>
            <td className="px-3 py-2 tabular-nums text-right text-sm font-bold" style={{ color: marginColor(totals.cost > 0 ? (totals.margin / totals.cost) * 100 : 0) }}>
              {formatCurrency(totals.margin, currency)}
            </td>
            <td className="px-3 py-2 text-right">
              {totals.cost > 0 && (
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-xs font-bold"
                  style={{
                    backgroundColor: (totals.margin / totals.cost) * 100 >= 15 ? 'var(--status-paid-bg)' : 'var(--status-pending-bg)',
                    color: marginColor((totals.margin / totals.cost) * 100),
                  }}
                >
                  {((totals.margin / totals.cost) * 100).toFixed(1)}%
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
