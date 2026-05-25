'use client'

import Link from 'next/link'
import { Package, Upload, ChevronRight, TrendingUp, Clock, FileText, BarChart2 } from 'lucide-react'
import type { CourierInvoice, CourierInvoiceStatus } from '@/lib/logistics/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import CourierProviderBadge from './shared/CourierProviderBadge'

const STATUS_COLOR: Record<CourierInvoiceStatus, string> = {
  pending:   '#D97706',
  partial:   '#2563EB',
  paid:      '#059669',
  cancelled: '#DC2626',
}

interface Props {
  invoices: CourierInvoice[]
  pendingCount: number
  thisMonthSpend: number
  totalCount: number
}

export default function LogisticsOverviewClient({ invoices, pendingCount, thisMonthSpend, totalCount }: Props) {
  const pendingValue = invoices
    .filter(i => i.status === 'pending' || i.status === 'partial')
    .reduce((s, i) => s + (i.total_amount - i.paid_amount), 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Logistics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Courier allocation & supplier billing</p>
        </div>
        <Link
          href="/logistics/courier-invoices/new"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <Upload className="w-4 h-4" /> Upload Invoice
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Invoices', value: String(totalCount), icon: FileText },
          { label: 'Pending', value: String(pendingCount), icon: Clock },
          { label: 'This Month', value: formatCurrency(thisMonthSpend), icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-3 space-y-1.5">
            <Icon className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <p className="text-sm font-bold leading-none" style={{ color: 'var(--text)' }}>{value}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Pending payment alert */}
      {pendingValue > 0 && (
        <div
          className="px-4 py-3 rounded-xl flex items-center justify-between"
          style={{ backgroundColor: 'var(--brand-light)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
              {formatCurrency(pendingValue)} outstanding
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {pendingCount} invoice{pendingCount !== 1 ? 's' : ''} pending payment
            </p>
          </div>
          <Link href="/logistics/courier-invoices" className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
            View all
          </Link>
        </div>
      )}

      {/* Quick links */}
      <div className="card overflow-hidden [&>a:first-child]:border-t-0">
        {[
          { href: '/logistics/courier-invoices', label: 'Courier Invoices', sub: `${totalCount} invoices`, icon: Package },
          { href: '/logistics/supplier-invoices', label: 'Supplier Invoices', sub: 'Generated invoices', icon: FileText },
          { href: '/logistics/markup-rules', label: 'Markup Rules', sub: 'Per-supplier pricing', icon: TrendingUp },
          { href: '/logistics/analytics', label: 'Analytics', sub: 'Profitability & margins', icon: BarChart2 },
        ].map(({ href, label, sub, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)] transition-colors border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--brand-light)' }}>
              <Icon className="w-4.5 h-4.5" style={{ color: 'var(--brand)' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{label}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
          </Link>
        ))}
      </div>

      {/* Recent invoices */}
      {invoices.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recent Invoices</h2>
            <Link href="/logistics/courier-invoices" className="text-xs font-medium" style={{ color: 'var(--brand)' }}>View all</Link>
          </div>
          <div className="card overflow-hidden [&>a:first-child]:border-t-0">
            {invoices.slice(0, 5).map(inv => (
              <Link
                key={inv.id}
                href={`/logistics/courier-invoices/${inv.id}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)] transition-colors border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <CourierProviderBadge provider={inv.courier_provider} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>#{inv.invoice_number}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDate(inv.invoice_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(inv.total_amount, inv.currency)}</p>
                  <p className="text-[10px] font-semibold" style={{ color: STATUS_COLOR[inv.status as CourierInvoiceStatus] ?? 'var(--text-muted)' }}>
                    {inv.status}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-faint)' }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {invoices.length === 0 && (
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand-light)' }}>
            <Package className="w-7 h-7" style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No courier invoices yet</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Upload your first DHL, FedEx, or Aramex invoice to start allocating shipments.</p>
          </div>
          <Link
            href="/logistics/courier-invoices/new"
            className="px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Upload Courier Invoice
          </Link>
        </div>
      )}
    </div>
  )
}
