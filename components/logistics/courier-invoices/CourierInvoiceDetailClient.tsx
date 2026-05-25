'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, CheckCircle, AlertCircle, Clock, Package, ChevronRight, FileText, ExternalLink, Sparkles, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CourierInvoice, AWB, CourierInvoiceStatus } from '@/lib/logistics/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import CourierProviderBadge from '../shared/CourierProviderBadge'
import { useToast } from '@/components/shared/Toast'

const STATUS_STYLE: Record<CourierInvoiceStatus, { label: string; bg: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   bg: 'var(--status-pending-bg)',   color: 'var(--status-pending-text)',   icon: Clock },
  partial:   { label: 'Partial',   bg: 'var(--status-partial-bg)',   color: 'var(--status-partial-text)',   icon: AlertCircle },
  paid:      { label: 'Paid',      bg: 'var(--status-paid-bg)',      color: 'var(--status-paid-text)',      icon: CheckCircle },
  cancelled: { label: 'Cancelled', bg: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)', icon: AlertCircle },
}

function allocationStatus(awb: AWB): { label: string; color: string } {
  if (awb.total_pieces === 0) return { label: 'No PCS set', color: 'var(--text-faint)' }
  if (awb.allocated_pieces === 0) return { label: 'Unallocated', color: 'var(--expense)' }
  if (awb.allocated_pieces < awb.total_pieces) return { label: `Partial (${awb.allocated_pieces}/${awb.total_pieces})`, color: 'var(--status-warning)' }
  return { label: 'Complete', color: 'var(--income)' }
}

interface Props {
  invoice: CourierInvoice
  awbs: AWB[]
}

export default function CourierInvoiceDetailClient({ invoice, awbs: initialAWBs }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [inv, setInv] = useState(invoice)
  const [awbs] = useState(initialAWBs)
  const [markingPaid, setMarkingPaid] = useState(false)

  const status = STATUS_STYLE[inv.status as CourierInvoiceStatus] ?? STATUS_STYLE.pending
  const StatusIcon = status.icon

  const totalAllocated = awbs.filter(a => a.allocated_pieces >= a.total_pieces && a.total_pieces > 0).length
  const allocPct = awbs.length > 0 ? Math.round((totalAllocated / awbs.length) * 100) : 0

  const handleMarkPaid = async () => {
    setMarkingPaid(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('courier_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_amount: inv.total_amount })
      .eq('id', inv.id)
    if (!error) {
      setInv(prev => ({ ...prev, status: 'paid', paid_amount: prev.total_amount }))
      showToast('Invoice marked as paid', 'success')
    } else {
      showToast(error.message, 'error')
    }
    setMarkingPaid(false)
  }

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CourierProviderBadge provider={inv.courier_provider} />
            <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>#{inv.invoice_number}</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(inv.invoice_date)}{inv.due_date && ` · Due ${formatDate(inv.due_date)}`}</p>
          </div>
          <div className="text-right space-y-1.5">
            <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
              {formatCurrency(inv.total_amount, inv.currency)}
            </p>
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: status.bg, color: status.color }}
            >
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
          </div>
        </div>

        {/* Charge breakdown */}
        {(inv.subtotal > 0 || inv.tax_amount > 0) && (
          <div className="pt-3 border-t grid grid-cols-3 text-center gap-2" style={{ borderColor: 'var(--border)' }}>
            {[
              { label: 'Subtotal', val: inv.subtotal },
              { label: 'Tax', val: inv.tax_amount },
              { label: 'Paid', val: inv.paid_amount },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{formatCurrency(val, inv.currency)}</p>
              </div>
            ))}
          </div>
        )}

        {/* AWB allocation progress */}
        {awbs.length > 0 && (
          <div className="pt-3 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>AWB Allocation</span>
              <span>{totalAllocated}/{awbs.length} complete</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${allocPct}%`, backgroundColor: allocPct === 100 ? 'var(--income)' : 'var(--brand)' }}
              />
            </div>
          </div>
        )}

        {/* File attachment */}
        {inv.file_path && (
          <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--brand)' }}>
              <FileText className="w-4 h-4" />
              <span className="truncate flex-1">{inv.file_name ?? 'Attached file'}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        )}

        {/* OCR status banner */}
        {inv.ocr_status === 'none' && inv.file_path && (
          <div className="pt-3 border-t flex items-center gap-2.5" style={{ borderColor: 'var(--border)' }}>
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--text-faint)' }} />
            <p className="text-xs flex-1" style={{ color: 'var(--text-faint)' }}>
              Auto-extract AWBs from this invoice <span className="font-medium">(coming soon)</span>
            </p>
          </div>
        )}
        {(inv.ocr_status === 'queued' || inv.ocr_status === 'processing') && (
          <div className="pt-3 border-t flex items-center gap-2.5" style={{ borderColor: 'var(--border)' }}>
            <Clock className="w-4 h-4 shrink-0 animate-pulse" style={{ color: 'var(--brand)' }} />
            <p className="text-xs" style={{ color: 'var(--brand)' }}>
              AI extraction in progress…
            </p>
          </div>
        )}
        {inv.ocr_status === 'done' && (
          <div className="pt-3 border-t flex items-center gap-2.5" style={{ borderColor: 'var(--border)' }}>
            <CheckCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--income)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              AWBs extracted by AI — <span className="font-semibold" style={{ color: 'var(--income)' }}>please verify each one</span>
            </p>
          </div>
        )}
        {inv.ocr_status === 'failed' && (
          <div className="pt-3 border-t flex items-center gap-2.5" style={{ borderColor: 'var(--border)' }}>
            <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--expense)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Auto-extraction failed — <span className="font-medium">enter AWBs manually</span>
            </p>
          </div>
        )}
      </div>

      {/* AWBs — desktop: list; mobile: vertical list + FAB */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            AWBs ({awbs.length})
          </h2>
          {/* Desktop add AWB link */}
          <Link
            href={`/logistics/courier-invoices/${inv.id}/awbs/new`}
            className="hidden md:flex items-center gap-1 text-sm font-medium tap-scale"
            style={{ color: 'var(--brand)' }}
          >
            <Plus className="w-4 h-4" /> Add AWB
          </Link>
        </div>

        {awbs.length === 0 ? (
          <div className="card p-8 flex flex-col items-center gap-3 text-center">
            <Package className="w-8 h-8" style={{ color: 'var(--text-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No AWBs added yet.<br />Add shipments from this invoice.</p>
            <Link
              href={`/logistics/courier-invoices/${inv.id}/awbs/new`}
              className="tap-scale px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              Add First AWB
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden [&>a:first-child]:border-t-0">
            {awbs.map(awb => {
              const alloc = allocationStatus(awb)
              return (
                <Link
                  key={awb.id}
                  href={`/logistics/courier-invoices/${inv.id}/awbs/${awb.id}`}
                  className="tap-scale flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition-colors border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{awb.awb_number}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {[awb.destination_city, awb.destination_country].filter(Boolean).join(', ')}
                      {awb.shipment_date ? ` · ${formatDate(awb.shipment_date)}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right space-y-0.5">
                    <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                      {formatCurrency(awb.total_charge, inv.currency)}
                    </p>
                    <p className="text-[10px] font-medium" style={{ color: alloc.color }}>{alloc.label}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-faint)' }} />
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      {inv.status !== 'paid' && inv.status !== 'cancelled' && (
        <div className="flex gap-3">
          <button
            onClick={handleMarkPaid}
            disabled={markingPaid}
            className="tap-scale flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ backgroundColor: 'var(--income)', color: '#fff' }}
          >
            {markingPaid ? 'Marking…' : 'Mark as Paid'}
          </button>
        </div>
      )}

      {/* Mobile FAB — Add AWB */}
      <Link
        href={`/logistics/courier-invoices/${inv.id}/awbs/new`}
        className="md:hidden tap-scale fixed bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-40"
        style={{ backgroundColor: 'var(--brand)' }}
        aria-label="Add AWB"
      >
        <Plus className="w-6 h-6 text-white" />
      </Link>
    </div>
  )
}
