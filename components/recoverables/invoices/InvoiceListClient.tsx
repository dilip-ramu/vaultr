'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { RecoverableInvoice, InvoiceStatus } from '@/lib/recoverables/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'
import MarkPaidModal from './MarkPaidModal'

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

export default function InvoiceListClient({ invoices: initialInvoices }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<FilterTab>('all')
  const [invoices, setInvoices] = useState(initialInvoices)
  const [modalInvoice, setModalInvoice] = useState<RecoverableInvoice | null>(null)

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

  const grandTotal = useMemo(
    () => enriched.filter(inv => inv.resolvedStatus !== 'cancelled').reduce((s, inv) => s + inv.total, 0),
    [enriched],
  )

  const pendingTotal = useMemo(
    () => enriched.filter(inv => inv.resolvedStatus !== 'paid' && inv.resolvedStatus !== 'cancelled').reduce((s, inv) => s + inv.balance_due, 0),
    [enriched],
  )

  function handlePaidSaved(updated: RecoverableInvoice) {
    setInvoices(prev => prev.map(inv => inv.id === updated.id ? updated : inv))
    setModalInvoice(null)
  }

  const [revertingId, setRevertingId] = useState<string | null>(null)

  async function handleRevert(e: React.MouseEvent, invId: string) {
    e.stopPropagation()
    if (!confirm('Mark this invoice as unpaid? The associated income transaction will also be deleted.')) return
    setRevertingId(invId)
    try {
      const res = await fetch(`/api/recoverables/invoices/${invId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revert: true }),
      })
      if (res.ok) {
        const { invoice: updated } = await res.json()
        setInvoices(prev => prev.map(inv => inv.id === invId ? updated : inv))
      }
    } finally {
      setRevertingId(null)
    }
  }

  return (
    <>
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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

        {/* Totals summary */}
        {enriched.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div
              className="rounded-xl p-3.5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid var(--brand)' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Grand Total</p>
              <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{fmt(grandTotal)}</p>
            </div>
            <div
              className="rounded-xl p-3.5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #F59E0B' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Pending</p>
              <p className="text-base font-bold" style={{ color: '#D97706' }}>{fmt(pendingTotal)}</p>
            </div>
          </div>
        )}

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
              <div
                key={inv.id}
                className="rounded-xl p-4"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                {/* Clickable area */}
                <button
                  onClick={() => router.push(`/recoverables/invoices/${inv.id}`)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                          {inv.invoice_number}
                        </span>
                        <StatusBadge status={inv.resolvedStatus} />
                      </div>
                      <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
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

                {/* Record payment / revert buttons */}
                {inv.resolvedStatus !== 'cancelled' && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-2)' }}>
                    {inv.resolvedStatus === 'paid' ? (
                      <button
                        onClick={e => handleRevert(e, inv.id)}
                        disabled={revertingId === inv.id}
                        className="w-full py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        {revertingId === inv.id ? 'Reverting…' : '↩ Mark as Unpaid'}
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setModalInvoice(inv) }}
                        className="w-full py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }}
                      >
                        ✓ Record Payment
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {modalInvoice && (
      <MarkPaidModal
        invoice={modalInvoice}
        onClose={() => setModalInvoice(null)}
        onSaved={handlePaidSaved}
      />
    )}
    </>
  )
}
