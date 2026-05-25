'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Plus, Package, ChevronRight, FileText } from 'lucide-react'
import type { CourierInvoice, CourierInvoiceStatus } from '@/lib/logistics/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import CourierProviderBadge from '../shared/CourierProviderBadge'

const STATUS_STYLE: Record<CourierInvoiceStatus, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: 'var(--status-pending-bg)',   color: 'var(--status-pending-text)' },
  partial:   { label: 'Partial',   bg: 'var(--status-partial-bg)',   color: 'var(--status-partial-text)' },
  paid:      { label: 'Paid',      bg: 'var(--status-paid-bg)',      color: 'var(--status-paid-text)' },
  cancelled: { label: 'Cancelled', bg: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)' },
}

interface Props {
  invoices: CourierInvoice[]
  awbCounts: Record<string, number>
}

export default function CourierInvoiceListClient({ invoices, awbCounts }: Props) {
  const [list, setList] = useState(invoices)

  const totalUnpaid = list
    .filter(i => i.status === 'pending' || i.status === 'partial')
    .reduce((s, i) => s + (i.total_amount - i.paid_amount), 0)

  if (list.length === 0) {
    return (
      <div className="page-enter max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Courier Invoices</h1>
          <Link
            href="/logistics/courier-invoices/new"
            className="tap-scale flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <Plus className="w-4 h-4" /> New Invoice
          </Link>
        </div>
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand-light)' }}>
            <Package className="w-7 h-7" style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No courier invoices yet</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Upload your first DHL, FedEx, or Aramex invoice to get started.</p>
          </div>
          <Link
            href="/logistics/courier-invoices/new"
            className="tap-scale px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Upload Courier Invoice
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Courier Invoices</h1>
          {totalUnpaid > 0 && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {formatCurrency(totalUnpaid)} outstanding
            </p>
          )}
        </div>
        <Link
          href="/logistics/courier-invoices/new"
          className="tap-scale flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <Plus className="w-4 h-4" /> New
        </Link>
      </div>

      <div className="card overflow-hidden [&>a:first-child]:border-t-0">
        {list.map(inv => {
          const s = STATUS_STYLE[inv.status as CourierInvoiceStatus] ?? STATUS_STYLE.pending
          const awbs = awbCounts[inv.id] ?? 0
          return (
            <Link
              key={inv.id}
              href={`/logistics/courier-invoices/${inv.id}`}
              className="tap-scale flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition-colors border-t"
              style={{ borderColor: 'var(--border)' } as React.CSSProperties}
            >
              {/* Provider badge + file icon */}
              <div className="shrink-0 flex flex-col items-start gap-1.5">
                <CourierProviderBadge provider={inv.courier_provider} size="sm" />
                {inv.file_path && <FileText className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  #{inv.invoice_number}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(inv.invoice_date)} · {awbs} AWB{awbs !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Amount + status */}
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  {formatCurrency(inv.total_amount, inv.currency)}
                </p>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                  style={{ backgroundColor: s.bg, color: s.color }}
                >
                  {s.label}
                </span>
              </div>

              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-faint)' }} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
