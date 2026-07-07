import { Pencil, X, Link2 } from 'lucide-react'
import type { InvoiceExt } from './helpers'

// ── Per-row action buttons ────────────────────────────────────────────────────

export default function RowActions({
  inv,
  onPay, onUnpay, onMarkBilled, onMarkPending, onMarkSettled, onMarkNotSettled,
  onShowLinks, onSkipAutoPay, onStopAutoPay, onEdit, onDelete,
}: {
  inv: InvoiceExt
  onPay: (inv: InvoiceExt) => void
  onUnpay: (inv: InvoiceExt) => void
  onMarkBilled: (inv: InvoiceExt) => void
  onMarkPending: (inv: InvoiceExt) => void
  onMarkSettled: (inv: InvoiceExt) => void
  onMarkNotSettled: (inv: InvoiceExt) => void
  onShowLinks: (inv: InvoiceExt) => void
  onSkipAutoPay: (inv: InvoiceExt) => void
  onStopAutoPay: (inv: InvoiceExt) => void
  onEdit: (inv: InvoiceExt) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* State-change buttons */}
      <div className="flex flex-wrap justify-end gap-1">
        {/* Payment track */}
        {inv.status !== 'cancelled' && !inv.is_paid && (
          <button
            onClick={() => onPay(inv)}
            className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            Mark Paid
          </button>
        )}
        {inv.status !== 'cancelled' && inv.is_paid && (
          <button
            onClick={() => onUnpay(inv)}
            className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            Mark Unpaid
          </button>
        )}
        {/* Recovery track */}
        {inv.is_recoverable && inv.recoverable_status === 'pending_billing' && (
          <button
            onClick={() => onMarkBilled(inv)}
            className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            Mark Billed
          </button>
        )}
        {inv.is_recoverable && inv.recoverable_status === 'billed' && (
          <>
            <button
              onClick={() => onMarkSettled(inv)}
              className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              style={{ background: 'rgba(168,85,247,0.1)', color: '#9333ea', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              Settled
            </button>
            <button
              onClick={() => onMarkPending(inv)}
              className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.2)' }}
            >
              Pending
            </button>
          </>
        )}
        {inv.is_recoverable && inv.recoverable_status === 'recovered' && (
          <button
            onClick={() => onMarkNotSettled(inv)}
            className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.2)' }}
          >
            Not Settled
          </button>
        )}
        {/* Show customer invoices link for all recoverable supplier invoices */}
        {inv.is_recoverable && (
          <button
            onClick={() => onShowLinks(inv)}
            className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1"
            style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <Link2 className="w-3 h-3" /> Customer Invoices
          </button>
        )}
        {/* Auto-pay controls */}
        {inv.is_recurring && inv.auto_pay_account_id && (
          <>
            <button
              onClick={() => onSkipAutoPay(inv)}
              className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              style={{
                background: inv.skip_next_autopay ? 'rgba(245,158,11,0.1)' : 'rgba(107,114,128,0.08)',
                color: inv.skip_next_autopay ? '#b45309' : '#6b7280',
                border: `1px solid ${inv.skip_next_autopay ? 'rgba(245,158,11,0.3)' : 'rgba(107,114,128,0.2)'}`,
              }}
            >
              {inv.skip_next_autopay ? 'Skip set ✓' : 'Skip next'}
            </button>
            <button
              onClick={() => onStopAutoPay(inv)}
              className="px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              style={{ background: 'rgba(239,68,68,0.06)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              Stop auto-pay
            </button>
          </>
        )}
      </div>
      {/* Edit / delete */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onEdit(inv)}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-2)]"
          title="Edit"
          style={{ color: 'var(--text-muted)' }}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(inv.id)}
          className="p-1.5 rounded-lg transition-colors hover:"
          title="Delete"
        >
          <X className="w-3.5 h-3.5 " />
        </button>
      </div>
    </div>
  )
}
