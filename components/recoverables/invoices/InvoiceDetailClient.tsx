'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RecoverableInvoice, RecoverableInvoiceLine, InvoiceStatus } from '@/lib/recoverables/types'
import type { Customer } from '@/lib/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'
import MarkPaidModal from './MarkPaidModal'

interface SellerInfo {
  company_name: string | null
  company_address: string | null
  company_gstin: string | null
  company_phone: string | null
  company_email: string | null
}

interface Props {
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  customer: Customer | null
  sellerInfo: SellerInfo | null
}

function fmt(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function resolveStatus(inv: RecoverableInvoice): InvoiceStatus {
  if (inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date()) {
    return 'overdue'
  }
  return inv.status
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm text-right" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

export default function InvoiceDetailClient({ invoice: initialInvoice, lines, customer, sellerInfo }: Props) {
  const router = useRouter()
  const [invoice, setInvoice] = useState(initialInvoice)
  const [busy, setBusy] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)

  const resolvedStatus = resolveStatus(invoice)
  const canMarkPaid   = resolvedStatus === 'sent' || resolvedStatus === 'overdue' || resolvedStatus === 'draft'
  const canRevert     = resolvedStatus === 'paid'
  const canDelete     = resolvedStatus !== 'paid'

  async function handleRevert() {
    if (!confirm('Mark this invoice as unpaid? The income transaction will remain — delete it manually from Transactions if needed.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/recoverables/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revert: true }),
      })
      const data = await res.json() as { invoice?: RecoverableInvoice; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to revert')
      if (data.invoice) setInvoice(data.invoice)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  function handlePaidSaved(updated: RecoverableInvoice) {
    setInvoice(updated)
    setShowPayModal(false)
  }

  async function deleteInvoice() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/recoverables/invoices/${invoice.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        throw new Error(j.error ?? 'Failed to delete')
      }
      router.push('/recoverables/invoices')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            ← Back
          </button>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
              {invoice.invoice_number}
            </h1>
            <StatusBadge status={resolvedStatus} />
          </div>
        </div>

        {/* Action buttons */}
        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: '#fee2e2', color: '#b91c1c' }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {canMarkPaid && (
            <button
              onClick={() => setShowPayModal(true)}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--income, #16a34a)', color: '#fff' }}
            >
              ✓ Record Payment
            </button>
          )}
          {canRevert && (
            <button
              onClick={handleRevert}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              {busy ? 'Reverting…' : '↩ Mark as Unpaid'}
            </button>
          )}
          <button
            onClick={() => router.push(`/recoverables/invoices/${invoice.id}/print`)}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            Print / Download PDF
          </button>
          {canDelete && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#fee2e2', color: '#b91c1c' }}
            >
              Delete
            </button>
          )}
          {showDeleteConfirm && (
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Delete invoice?</span>
              <button
                onClick={deleteInvoice}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: '#b91c1c', color: '#fff' }}
              >
                {busy ? '…' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Summary card */}
        <div
          className="rounded-xl p-4 mb-5"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Bill To
              </p>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{invoice.customer_name}</p>
              {invoice.customer_address && (
                <p className="text-sm whitespace-pre-wrap mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {invoice.customer_address}
                </p>
              )}
              {invoice.customer_gstin && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  GSTIN: {invoice.customer_gstin}
                </p>
              )}
              {invoice.customer_state && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  State: {invoice.customer_state}
                </p>
              )}
            </div>
            <div>
              {sellerInfo?.company_name && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                    From
                  </p>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>{sellerInfo.company_name}</p>
                  {sellerInfo.company_address && (
                    <p className="text-sm whitespace-pre-wrap mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {sellerInfo.company_address}
                    </p>
                  )}
                  {sellerInfo.company_gstin && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      GSTIN: {sellerInfo.company_gstin}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Row label="Invoice Date"    value={fmtDate(invoice.invoice_date)} />
            <Row label="Due Date"        value={fmtDate(invoice.due_date)} />
            {invoice.payment_terms && (
              <Row label="Payment Terms" value={invoice.payment_terms.replace('_', ' ').toUpperCase()} />
            )}
            {invoice.paid_at && (
              <Row label="Paid On" value={fmtDate(invoice.paid_at)} />
            )}
          </div>
        </div>

        {/* Line items */}
        <div
          className="rounded-xl overflow-hidden mb-5"
          style={{ border: '1px solid var(--border)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <th className="text-left px-4 py-2.5 font-medium">#</th>
                <th className="text-left px-4 py-2.5 font-medium">AWB</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-right px-4 py-2.5 font-medium">Pcs</th>
                <th className="text-right px-4 py-2.5 font-medium">Rate</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr
                  key={line.id}
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{line.line_number}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{line.awb}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{fmtDate(line.shipment_date)}</td>
                  <td className="px-4 py-2.5 text-right">{line.qty}</td>
                  <td className="px-4 py-2.5 text-right">
                    {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(line.rate)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmt(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* GST totals */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <Row label="Subtotal"                                          value={fmt(invoice.subtotal)} />
          <Row label={`CGST @ ${invoice.cgst_rate}%`}                   value={fmt(invoice.cgst_amount)} />
          <Row label={`SGST @ ${invoice.sgst_rate}%`}                   value={fmt(invoice.sgst_amount)} />
          <div className="flex justify-between gap-4 pt-2 mt-1">
            <span className="font-bold" style={{ color: 'var(--text)' }}>Total</span>
            <span className="font-bold text-lg" style={{ color: 'var(--text)' }}>{fmt(invoice.total)}</span>
          </div>
          {invoice.paid_amount > 0 && (
            <>
              <Row
                label="Amount Paid"
                value={<span style={{ color: 'var(--income, #16a34a)' }}>{fmt(invoice.paid_amount)}</span>}
              />
              <div className="flex justify-between gap-4 pt-1">
                <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Balance Due</span>
                <span className="font-semibold text-sm" style={{ color: invoice.balance_due > 0 ? '#b91c1c' : 'var(--text-muted)' }}>
                  {fmt(invoice.balance_due)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{invoice.notes}</p>
          </div>
        )}
      </div>

      {showPayModal && (
        <MarkPaidModal
          invoice={invoice}
          onClose={() => setShowPayModal(false)}
          onSaved={handlePaidSaved}
        />
      )}
    </div>
  )
}
