import type { SupplierInvoiceStatus } from '@/lib/logistics/types'

const CONFIG: Record<SupplierInvoiceStatus, { label: string; bg: string; color: string; strikethrough?: boolean }> = {
  draft:     { label: 'Draft',     bg: 'var(--surface-2)',             color: 'var(--text-muted)' },
  sent:      { label: 'Sent',      bg: 'var(--status-sent-bg)',        color: 'var(--status-sent-text)' },
  paid:      { label: 'Paid',      bg: 'var(--status-paid-bg)',        color: 'var(--status-paid-text)' },
  overdue:   { label: 'Overdue',   bg: 'var(--status-overdue-bg)',     color: 'var(--status-overdue-text)' },
  cancelled: { label: 'Cancelled', bg: 'var(--surface-2)',             color: 'var(--text-faint)', strikethrough: true },
}

interface Props {
  status: SupplierInvoiceStatus
  className?: string
}

export default function InvoiceStatusBadge({ status, className = '' }: Props) {
  const cfg = CONFIG[status]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${className}`}
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        textDecoration: cfg.strikethrough ? 'line-through' : undefined,
      }}
    >
      {cfg.label}
    </span>
  )
}
