'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SupplierInvoice, SupplierInvoiceLine } from '@/lib/logistics/types'
import type { Customer, Account } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import { getInvoicePDFUrl, generateAndStorePDF } from '@/lib/logistics/pdf/pdf-renderer'
import { useToast } from '@/components/shared/Toast'

interface Props {
  invoice: SupplierInvoice
  lines: SupplierInvoiceLine[]
  customer: Customer
  accounts: Account[]
  currency?: string
}

export default function SupplierInvoiceDetail({
  invoice: initialInvoice,
  lines,
  customer,
  accounts,
  currency = 'INR',
}: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [invoice, setInvoice] = useState(initialInvoice)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [showPaidModal, setShowPaidModal] = useState(false)
  const [paidAmount, setPaidAmount] = useState(invoice.total_amount.toString())
  const [paidAccountId, setPaidAccountId] = useState(accounts[0]?.id ?? '')
  const [createTx, setCreateTx] = useState(true)

  const inputStyle = {
    backgroundColor: 'var(--surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }

  const doAction = async (action: string, handler: () => Promise<void>, successMsg?: string) => {
    setLoading(action)
    setError('')
    try {
      await handler()
      if (successMsg) showToast(successMsg, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(null)
    }
  }

  const handleMarkSent = () =>
    doAction('sent', async () => {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('supplier_invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', invoice.id)
        .select('*')
        .single()
      if (err) throw new Error(err.message)
      setInvoice(data as SupplierInvoice)
    }, 'Invoice marked as sent')

  const handleMarkPaid = () =>
    doAction('paid', async () => {
      const supabase = createClient()
      const { markInvoicePaid } = await import('@/lib/logistics/invoice-generator')
      await markInvoicePaid({
        supabase,
        invoiceId: invoice.id,
        paidAmount: parseFloat(paidAmount) || invoice.total_amount,
        accountId: paidAccountId,
        createTransaction: createTx,
      })
      const { data } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('id', invoice.id)
        .single()
      if (data) setInvoice(data as SupplierInvoice)
      setShowPaidModal(false)
    }, 'Invoice marked as paid')

  const handleCancel = () =>
    doAction('cancel', async () => {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('supplier_invoices')
        .update({ status: 'cancelled' })
        .eq('id', invoice.id)
        .select('*')
        .single()
      if (err) throw new Error(err.message)
      setInvoice(data as SupplierInvoice)
    }, 'Invoice cancelled')

  const handleDownloadPDF = async () => {
    setPdfLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let url = await getInvoicePDFUrl({ supabase, invoiceId: invoice.id })
      if (!url) {
        url = await generateAndStorePDF({ supabase, invoiceId: invoice.id, userId: user.id })
      }

      // Trigger download via blob URL (works on iOS PWA and desktop)
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${invoice.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      showToast('PDF downloaded', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setPdfLoading(false)
    }
  }

  const canMarkSent = invoice.status === 'draft'
  const canMarkPaid = invoice.status === 'sent' || invoice.status === 'overdue' || invoice.status === 'draft'
  const canCancel = invoice.status !== 'paid' && invoice.status !== 'cancelled'

  return (
    <div className="page-enter space-y-5">
      {/* Invoice header */}
      <div className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
              {invoice.invoice_number}
            </p>
            <InvoiceStatusBadge status={invoice.status} className="mt-1" />
          </div>
          <div className="text-right text-sm space-y-0.5">
            <p className="font-bold tabular-nums text-base" style={{ color: 'var(--income)' }}>
              {formatCurrency(invoice.total_amount, currency)}
            </p>
            <p style={{ color: 'var(--text-muted)' }}>{formatDate(invoice.invoice_date)}</p>
            {invoice.due_date && (
              <p style={{ color: 'var(--text-faint)' }}>Due {formatDate(invoice.due_date)}</p>
            )}
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />

        <div>
          <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>Bill To</p>
          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{customer.name}</p>
          {customer.email && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{customer.email}</p>
          )}
          {customer.gst_number && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
              GST: {customer.gst_number}
            </p>
          )}
          {customer.address && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{customer.address}</p>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="card overflow-hidden">
        {/* Desktop header */}
        <div
          className="hidden md:grid gap-2 px-4 py-2 text-xs font-semibold"
          style={{
            gridTemplateColumns: '1fr 50px 90px 90px 90px',
            backgroundColor: 'var(--surface-2)',
            color: 'var(--text-muted)',
          }}
        >
          <span>Description</span>
          <span className="text-center">PCS</span>
          <span className="text-right">Destination</span>
          <span className="text-right">Unit Price</span>
          <span className="text-right">Amount</span>
        </div>

        {lines.map((line, i) => (
          <div
            key={line.id}
            className={`px-4 py-3 ${i > 0 ? 'border-t' : ''}`}
            style={{ borderColor: 'var(--border)' }}
          >
            {/* Desktop row */}
            <div
              className="hidden md:grid gap-2 items-center text-sm"
              style={{ gridTemplateColumns: '1fr 50px 90px 90px 90px' }}
            >
              <div className="min-w-0">
                <p className="font-medium truncate" style={{ color: 'var(--text)' }}>
                  {line.description}
                </p>
                {line.shipment_date && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {formatDate(line.shipment_date)}
                  </p>
                )}
              </div>
              <span className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>
                {line.pieces ?? '—'}
              </span>
              <span className="text-right text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {line.destination ?? '—'}
              </span>
              <span className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {line.unit_price !== null ? formatCurrency(line.unit_price, currency) : '—'}
              </span>
              <span className="text-right font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                {formatCurrency(line.line_total, currency)}
              </span>
            </div>

            {/* Mobile row */}
            <div className="md:hidden flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{line.description}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {line.pieces ? `${line.pieces} PCS` : ''}
                  {line.destination ? ` · ${line.destination}` : ''}
                  {line.shipment_date ? ` · ${formatDate(line.shipment_date)}` : ''}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>
                {formatCurrency(line.line_total, currency)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="card p-4 space-y-2.5">
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
          <span className="tabular-nums font-medium" style={{ color: 'var(--text)' }}>
            {formatCurrency(invoice.subtotal, currency)}
          </span>
        </div>
        {invoice.tax_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>
              Tax{invoice.tax_rate ? ` (${invoice.tax_rate}%)` : ''}
            </span>
            <span className="tabular-nums" style={{ color: 'var(--text)' }}>
              {formatCurrency(invoice.tax_amount, currency)}
            </span>
          </div>
        )}
        <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />
        <div className="flex justify-between">
          <span className="font-semibold" style={{ color: 'var(--text)' }}>Total</span>
          <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--income)' }}>
            {formatCurrency(invoice.total_amount, currency)}
          </span>
        </div>
        {invoice.paid_amount > 0 && invoice.status === 'paid' && (
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Paid</span>
            <span className="tabular-nums font-medium" style={{ color: 'var(--income)' }}>
              {formatCurrency(invoice.paid_amount, currency)}
            </span>
          </div>
        )}
      </div>

      {/* Footer: notes + payment terms */}
      {(invoice.notes || invoice.payment_terms) && (
        <div className="space-y-1 px-1">
          {invoice.payment_terms && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold">Payment terms:</span> {invoice.payment_terms}
            </p>
          )}
          {invoice.notes && (
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{invoice.notes}</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm px-1" style={{ color: 'var(--expense)' }}>{error}</p>}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {/* Download PDF */}
        <button
          type="button"
          disabled={pdfLoading || !!loading}
          onClick={handleDownloadPDF}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-60"
          style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
        >
          {pdfLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4" />}
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </button>

        {canMarkSent && (
          <button
            type="button"
            disabled={loading === 'sent'}
            onClick={handleMarkSent}
            className="tap-scale flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--status-sent-bg)', color: 'var(--status-sent-text)' }}
          >
            {loading === 'sent' && <Loader2 className="w-4 h-4 animate-spin" />}
            Mark as Sent
          </button>
        )}
        {canMarkPaid && (
          <button
            type="button"
            disabled={!!loading}
            onClick={() => setShowPaidModal(true)}
            className="tap-scale flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--income)' }}
          >
            {loading === 'paid' && <Loader2 className="w-4 h-4 animate-spin" />}
            Mark as Paid
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            disabled={!!loading}
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-60"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            {loading === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
            Cancel Invoice
          </button>
        )}
      </div>

      {/* Mark Paid modal */}
      {showPaidModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <p className="font-semibold" style={{ color: 'var(--text)' }}>Mark Invoice Paid</p>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Amount Received
              </label>
              <input
                type="number"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                min="0"
                step="0.01"
                inputMode="decimal"
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={inputStyle}
              />
            </div>

            {accounts.length > 0 && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Deposit To Account
                </label>
                <select
                  value={paidAccountId}
                  onChange={e => setPaidAccountId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border"
                  style={inputStyle}
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={createTx}
                onChange={e => setCreateTx(e.target.checked)}
                className="rounded"
              />
              Create income transaction
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading === 'paid'}
                onClick={handleMarkPaid}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#166534' }}
              >
                {loading === 'paid' && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
