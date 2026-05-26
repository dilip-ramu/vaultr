'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { RecoverableInvoice, InvoiceStatus } from '@/lib/recoverables/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'

interface Props {
  invoices: RecoverableInvoice[]
}

type FilterTab = 'all' | InvoiceStatus

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'sent',      label: 'Sent' },
  { key: 'overdue',   label: 'Overdue' },
  { key: 'paid',      label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
]

function resolveStatus(inv: RecoverableInvoice): InvoiceStatus {
  if (inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date()) {
    return 'overdue'
  }
  return inv.status
}

function fmt(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function InvoiceListClient({ invoices }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<FilterTab>('all')

  const enriched = useMemo(
    () => invoices.map(inv => ({ ...inv, resolvedStatus: resolveStatus(inv) })),
    [invoices],
  )

  const filtered = useMemo(() => {
    if (tab === 'all') return enriched
    return enriched.filter(inv => inv.resolvedStatus === tab)
  }, [enriched, tab])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: enriched.length }
    for (const inv of enriched) {
      c[inv.resolvedStatus] = (c[inv.resolvedStatus] ?? 0) + 1
    }
    return c
  }, [enriched])

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Invoices</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {enriched.length} invoice{enriched.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => router.push('/recoverables/invoices/new')}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--brand)', color: '#fff' }}
          >
            + New Invoice
          </button>
        </div>

        {/* Filter tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-5 overflow-x-auto"
          style={{ background: 'var(--surface-2)' }}
        >
          {TABS.map(t => {
            const count = counts[t.key] ?? 0
            if (t.key !== 'all' && count === 0) return null
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
                style={
                  tab === t.key
                    ? { background: 'var(--background)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {t.label}
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: tab === t.key ? 'var(--brand)' : 'var(--border)',
                    color:      tab === t.key ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Invoice cards */}
        {filtered.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            <p className="text-4xl mb-3">📄</p>
            <p className="font-medium">No invoices yet</p>
            <p className="text-sm mt-1">Create your first invoice to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(inv => (
              <button
                key={inv.id}
                onClick={() => router.push(`/recoverables/invoices/${inv.id}`)}
                className="rounded-xl p-4 text-left transition-opacity hover:opacity-80 active:opacity-60"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                        {inv.invoice_number}
                      </span>
                      <StatusBadge status={inv.resolvedStatus} />
                    </div>
                    <p
                      className="text-sm mt-0.5 truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {inv.customer_name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                      {fmt(inv.total)}
                    </p>
                    {inv.resolvedStatus === 'paid' ? (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--income, #16a34a)' }}>Paid</p>
                    ) : (
                      <p className="text-xs mt-0.5" style={{ color: inv.resolvedStatus === 'overdue' ? '#b45309' : 'var(--text-muted)' }}>
                        Due {inv.due_date ? fmtDate(inv.due_date) : '—'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fmtDate(inv.invoice_date)}
                  </span>
                  {inv.resolvedStatus !== 'paid' && inv.resolvedStatus !== 'cancelled' && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Balance: {fmt(inv.balance_due)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
