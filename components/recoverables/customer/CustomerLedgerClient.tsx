'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, User } from 'lucide-react'
import type { RecoverableAllocation, ImportBatch, RecoverableInvoice, InvoiceStatus } from '@/lib/recoverables/types'
import type { Customer } from '@/lib/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'

interface ShipmentRef { id: string; reference: string; shipment_date: string | null }

interface Props {
  customerName: string
  allocations: RecoverableAllocation[]
  invoices: RecoverableInvoice[]
  customer: Customer | null
  batches: ImportBatch[]
  shipments: ShipmentRef[]
}

function round2(n: number) { return Math.round(n * 100) / 100 }

function fmtInr(n: number) {
  return '₹' + round2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function resolveStatus(inv: RecoverableInvoice, today: string): InvoiceStatus {
  if (inv.status === 'sent' && inv.due_date && inv.due_date < today) return 'overdue'
  return inv.status
}

export default function CustomerLedgerClient({
  customerName, allocations, invoices, customer, batches, shipments,
}: Props) {
  const router = useRouter()

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const batchMap    = useMemo(() => new Map(batches.map(b => [b.id, b])), [batches])
  const shipmentMap = useMemo(() => new Map(shipments.map(s => [s.id, s])), [shipments])

  // ── Summary card values ──────────────────────────────────
  const unbilled = useMemo(
    () => round2(allocations.filter(a => a.status === 'pending').reduce((s, a) => s + Number(a.recoverable_amount), 0)),
    [allocations],
  )
  const billed = useMemo(
    () => round2(invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.balance_due), 0)),
    [invoices],
  )
  const overdue = useMemo(
    () => round2(invoices.filter(i => i.status === 'sent' && i.due_date !== null && i.due_date < today).reduce((s, i) => s + Number(i.balance_due), 0)),
    [invoices, today],
  )
  const settled = useMemo(
    () => round2(invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0)),
    [invoices],
  )

  // ── Profitability ────────────────────────────────────────
  const { revenue, cost, profit, margin } = useMemo(() => {
    const revenue = invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + Number(i.subtotal), 0)
    const cost    = allocations.reduce((s, a) => s + Number(a.base_cost), 0)
    const profit  = revenue - cost
    const margin  = revenue > 0 ? (profit / revenue) * 100 : null
    return { revenue, cost, profit, margin }
  }, [invoices, allocations])

  // ── Pending allocations ──────────────────────────────────
  const pendingAllocations = useMemo(
    () => allocations.filter(a => a.status === 'pending'),
    [allocations],
  )

  return (
    <div className="page-enter w-full px-4 md:px-8 py-6 space-y-6">

      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      {/* Header */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text)' }}>
              {customerName}
            </h1>
            {customer && (
              <Link
                href={`/customers/${customer.id}`}
                className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
              >
                <User className="w-3 h-3" />
                {customer.name}
              </Link>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Unbilled',  value: unbilled,  color: 'var(--brand)' },
            { label: 'Billed',    value: billed,    color: 'var(--text)' },
            { label: 'Overdue',   value: overdue,   color: '#b45309' },
            { label: 'Settled',   value: settled,   color: 'var(--income, #16a34a)' },
          ].map(c => (
            <div
              key={c.label}
              className="rounded-xl p-3"
              style={{ background: 'var(--surface-2)' }}
            >
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
              <p className="font-bold text-sm" style={{ color: c.color }}>
                {fmtInr(c.value)}
              </p>
            </div>
          ))}
        </div>

        {/* Profitability */}
        {revenue > 0 && (
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Profitability
              </p>
              <p className="text-sm font-bold" style={{ color: profit >= 0 ? 'var(--income, #16a34a)' : '#b91c1c' }}>
                {fmtInr(profit)} profit
                {margin !== null && (
                  <span className="ml-1 font-normal text-xs" style={{ color: 'var(--text-muted)' }}>
                    ({margin.toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>
            <div className="text-right text-xs" style={{ color: 'var(--text-muted)' }}>
              <div>Revenue: {fmtInr(revenue)}</div>
              <div>Cost: {fmtInr(cost)}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Invoices section ─────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Invoices ({invoices.length})
          </h2>
          <Link
            href={`/recoverables/invoices/new?customer=${encodeURIComponent(customerName)}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--brand)', color: '#fff' }}
          >
            + New Invoice
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            No invoices yet for this customer.
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Invoice', 'Date', 'Amount', 'Status', 'Due', 'Terms'].map(h => (
                    <th key={h} className="py-2 px-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const rs = resolveStatus(inv, today)
                  const daysOverdue = rs === 'overdue' && inv.due_date
                    ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86_400_000)
                    : 0
                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 px-3">
                        <Link
                          href={`/recoverables/invoices/${inv.id}`}
                          className="font-semibold text-xs hover:underline"
                          style={{ color: 'var(--brand)' }}
                        >
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {fmtDate(inv.invoice_date)}
                      </td>
                      <td className="py-3 px-3 text-xs font-semibold" style={{ color: 'var(--text)' }}>
                        {fmtInr(inv.total)}
                      </td>
                      <td className="py-3 px-3"><StatusBadge status={rs} /></td>
                      <td className="py-3 px-3 text-xs" style={{ color: rs === 'overdue' ? '#b45309' : 'var(--text-muted)' }}>
                        {fmtDate(inv.due_date)}
                        {rs === 'overdue' && daysOverdue > 0 && (
                          <div className="text-xs font-medium" style={{ color: '#b91c1c' }}>
                            {daysOverdue}d overdue
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {inv.payment_terms?.replace('_', ' ').toUpperCase() ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="md:hidden divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {invoices.map(inv => {
                const rs = resolveStatus(inv, today)
                const daysOverdue = rs === 'overdue' && inv.due_date
                  ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86_400_000)
                  : 0
                return (
                  <Link
                    key={inv.id}
                    href={`/recoverables/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
                          {inv.invoice_number}
                        </span>
                        <StatusBadge status={rs} />
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {fmtDate(inv.invoice_date)}
                      </div>
                      {rs === 'overdue' && daysOverdue > 0 && (
                        <div className="text-xs font-medium mt-0.5" style={{ color: '#b91c1c' }}>
                          {daysOverdue}d overdue
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-sm shrink-0" style={{ color: 'var(--text)' }}>
                      {fmtInr(inv.total)}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Unbilled AWBs section ─────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Unbilled AWBs ({pendingAllocations.length})
          </h2>
          {pendingAllocations.length > 0 && (
            <Link
              href={`/recoverables/invoices/new?customer=${encodeURIComponent(customerName)}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface-2)', color: 'var(--brand)', border: '1px solid var(--brand)' }}
            >
              Create Invoice
            </Link>
          )}
        </div>

        {pendingAllocations.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            All shipments have been invoiced.
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['AWB', 'Batch', 'Date', 'PCS', 'Amount'].map(h => (
                    <th key={h} className="py-2 px-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingAllocations.map(a => {
                  const shipment = shipmentMap.get(a.shipment_id)
                  const batch    = batchMap.get(a.batch_id)
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 px-3 font-mono text-xs" style={{ color: 'var(--text)' }}>
                        {shipment?.reference ?? a.shipment_id.slice(0, 8) + '…'}
                      </td>
                      <td className="py-3 px-3">
                        {batch ? (
                          <Link
                            href={`/recoverables/batches/${batch.id}`}
                            className="text-xs font-medium hover:underline"
                            style={{ color: 'var(--brand)' }}
                          >
                            {batch.name}
                          </Link>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {fmtDate(shipment?.shipment_date ?? null)}
                      </td>
                      <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{a.pieces}</td>
                      <td className="py-3 px-3 text-xs font-semibold" style={{ color: 'var(--text)' }}>
                        {fmtInr(Number(a.recoverable_amount))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="md:hidden divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {pendingAllocations.map(a => {
                const shipment = shipmentMap.get(a.shipment_id)
                const batch    = batchMap.get(a.batch_id)
                return (
                  <div key={a.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text)' }}>
                        {shipment?.reference ?? a.shipment_id.slice(0, 8) + '…'}
                      </span>
                      <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>
                        {fmtInr(Number(a.recoverable_amount))}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>{fmtDate(shipment?.shipment_date ?? null)}</span>
                      <span>{a.pieces} pcs</span>
                      {batch && (
                        <Link
                          href={`/recoverables/batches/${batch.id}`}
                          className="hover:underline"
                          style={{ color: 'var(--brand)' }}
                        >
                          {batch.name}
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
