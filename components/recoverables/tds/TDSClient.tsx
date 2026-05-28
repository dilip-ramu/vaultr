'use client'

import { useMemo } from 'react'
import Link from 'next/link'

interface TDSEntry {
  id: string
  invoice_id: string | null
  invoice_number: string
  customer_name: string
  invoice_total: number
  paid_amount: number
  tds_amount: number
  adjustment_amount: number
  adjustment_notes: string | null
  payment_date: string
  created_at: string
}

interface Props {
  entries: TDSEntry[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function TDSClient({ entries }: Props) {
  const totalTDS = useMemo(
    () => entries.reduce((s, e) => s + e.tds_amount, 0),
    [entries],
  )
  const totalAdj = useMemo(
    () => entries.reduce((s, e) => s + e.adjustment_amount, 0),
    [entries],
  )

  // Group by customer
  const byCustomer = useMemo(() => {
    const map = new Map<string, { entries: TDSEntry[]; tds: number; adj: number }>()
    for (const e of entries) {
      const existing = map.get(e.customer_name) ?? { entries: [], tds: 0, adj: 0 }
      existing.entries.push(e)
      existing.tds += e.tds_amount
      existing.adj += e.adjustment_amount
      map.set(e.customer_name, existing)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].tds - a[1].tds)
  }, [entries])

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>TDS Tracker</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Tax deducted at source — amounts owed to you
            </p>
          </div>
          <Link
            href="/recoverables/invoices"
            className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ← Invoices
          </Link>
        </div>

        {/* Summary cards */}
        {entries.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #D97706' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Total TDS Owed</p>
              <p className="text-xl font-bold" style={{ color: '#D97706' }}>{fmt(totalTDS)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>claimable as credit</p>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #6366F1' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Total Adjustments</p>
              <p className="text-xl font-bold" style={{ color: '#6366F1' }}>{fmt(totalAdj)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>debit notes & offsets</p>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-4xl mb-3">🧾</p>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>No TDS entries yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              When you record a payment with TDS or an adjustment, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {byCustomer.map(([customer, group]) => (
              <div key={customer}>
                {/* Customer header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{customer}</p>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    {group.tds > 0 && (
                      <span style={{ color: '#D97706' }}>TDS {fmt(group.tds)}</span>
                    )}
                    {group.adj > 0 && (
                      <span style={{ color: '#6366F1' }}>Adj {fmt(group.adj)}</span>
                    )}
                  </div>
                </div>

                {/* Entries */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  {group.entries.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="px-4 py-3"
                      style={{ borderBottom: i < group.entries.length - 1 ? '1px solid var(--border-2)' : 'none' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {entry.invoice_id ? (
                              <Link
                                href={`/recoverables/invoices/${entry.invoice_id}`}
                                className="text-sm font-semibold hover:underline"
                                style={{ color: 'var(--brand)' }}
                              >
                                {entry.invoice_number}
                              </Link>
                            ) : (
                              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                                {entry.invoice_number}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {fmtDate(entry.payment_date)}
                            </span>
                          </div>
                          {entry.adjustment_notes && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                              {entry.adjustment_notes}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0 space-y-0.5">
                          {entry.paid_amount > 0 && (
                            <p className="text-xs" style={{ color: '#16a34a' }}>
                              Received {fmt(entry.paid_amount)}
                            </p>
                          )}
                          {entry.tds_amount > 0 && (
                            <p className="text-xs font-semibold" style={{ color: '#D97706' }}>
                              TDS {fmt(entry.tds_amount)}
                            </p>
                          )}
                          {entry.adjustment_amount > 0 && (
                            <p className="text-xs font-semibold" style={{ color: '#6366F1' }}>
                              Adj {fmt(entry.adjustment_amount)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Invoice total context */}
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        Invoice total {fmt(entry.invoice_total)}
                        {entry.tds_amount > 0 && (
                          <span style={{ color: '#D97706' }}>
                            {' · '}TDS {((entry.tds_amount / entry.invoice_total) * 100).toFixed(1)}%
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
