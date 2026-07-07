'use client'

/**
 * Customers → Invoices → Invoices tab.
 * A flat unified list of every invoice — courier tax invoices AND
 * reimbursement invoices — with type + status badges and inline mark-paid.
 *
 * Design goals:
 *   ─ One glance: type badge, customer, month, amount, status.
 *   ─ Mark-paid appears when settlement makes sense:
 *       • non-reimbursable customer → primary CTA (this IS the final bill)
 *       • reimbursement invoice     → primary CTA (customer pays this to us)
 *       • reimbursable customer's courier invoice → secondary + hint
 *         (will auto-cascade when the parent reimbursement invoice is paid;
 *         see v65 DB trigger)
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, DollarSign, Clock, Loader2, Truck, FileText, Filter, Pencil, Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

interface Invoice {
  id:             string
  invoice_number: string
  invoice_type:   'tax_invoice' | 'reimbursement'
  invoice_date:   string
  invoice_month:  string | null
  customer_id:    string | null
  customer_name:  string
  total:          number
  balance_due:    number
  status:         'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'finalized'
  currency:       string
  sent_at:        string | null
  paid_at:        string | null
  created_at:     string
}

interface Props {
  invoices: Invoice[]
  reimbursableCustomerIds: string[]
}

const MONTHS_LONG = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}
function fmtMonth(ym: string | null): string | null {
  if (!ym) return null
  const [y, m] = ym.split('-')
  return `${MONTHS_LONG[parseInt(m) - 1]} ${y}`
}
function fmtCur(n: number, cur: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${cur} ${Math.round(n).toLocaleString('en-IN')}`
  }
}

export default function UnifiedInvoicesClient({ invoices, reimbursableCustomerIds }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const reimbursableSet = useMemo(() => new Set(reimbursableCustomerIds), [reimbursableCustomerIds])

  // "+ New invoice" href — preserves the currently-picked customer chip so
  // the builder lands on the same customer without another click. Skipped
  // when All is selected (the builder handles the empty state itself).
  const newInvoiceHref = useMemo(() => {
    const cust = params.get('customer')
    return cust && cust !== 'all'
      ? `/customers/invoices/reimbursables/new?customer=${cust}`
      : '/customers/invoices/reimbursables/new'
  }, [params])
  const [markingId,  setMarkingId]  = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterType,   setFilterType]   = useState<'all' | 'tax_invoice' | 'reimbursement'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'paid'>('all')

  const filtered = useMemo(() => invoices.filter(inv => {
    if (filterType   !== 'all' && inv.invoice_type !== filterType) return false
    if (filterStatus === 'open' && (inv.status === 'paid' || inv.status === 'cancelled')) return false
    if (filterStatus === 'paid' && inv.status !== 'paid') return false
    return true
  }), [invoices, filterType, filterStatus])

  /** Type-aware delete. Both API paths cascade-unlink related rows
   *  (transactions, payroll_months, courier links) before dropping the
   *  invoice — that logic already lives on the server so we just call it. */
  async function handleDelete(inv: Invoice) {
    const isReimbursement = inv.invoice_type === 'reimbursement'
    const label = isReimbursement ? 'reimbursement invoice' : 'courier tax invoice'
    if (!await confirmDialog({
      title: `Delete ${label}?`,
      message: `${inv.invoice_number} · ${inv.customer_name} · ${fmtCur(Number(inv.total), inv.currency)}. This cannot be undone. Linked expenses, courier links, and payroll entries will be unlinked so they can be re-billed.`,
      confirmLabel: 'Delete',
    })) return
    setDeletingId(inv.id)
    try {
      const url = isReimbursement
        ? `/api/contrast/invoices/${inv.id}`
        : `/api/recoverables/invoices/${inv.id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Delete failed' }))
        notify(error ?? 'Delete failed')
        return
      }
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  /** Edit target — depends on invoice type. Courier tax invoices have a
   *  proper detail page; reimbursement invoices open in the builder with a
   *  pre-filled invoice id (the builder handles the "already finalized"
   *  path — see Deploy 3). */
  function editHref(inv: Invoice): string {
    if (inv.invoice_type === 'reimbursement') {
      const qs = new URLSearchParams()
      if (inv.customer_id) qs.set('customer', inv.customer_id)
      qs.set('invoice', inv.id)
      return `/customers/invoices/reimbursables/new?${qs.toString()}`
    }
    return `/recoverables/invoices/${inv.id}`
  }

  async function handleMarkPaid(inv: Invoice) {
    setMarkingId(inv.id)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { notify('Session expired'); return }
      const { error } = await supabase
        .from('recoverable_invoices')
        .update({
          status:      'paid',
          paid_amount: inv.total,
          balance_due: 0,
          paid_at:     new Date().toISOString(),
        })
        .eq('id', inv.id)
        .eq('user_id', user.id)
      if (error) { notify(error.message); return }
      router.refresh()
    } finally {
      setMarkingId(null)
    }
  }

  // Totals for the current filter view.
  const totals = useMemo(() => {
    const t = { count: filtered.length, total: 0, outstanding: 0 }
    for (const i of filtered) {
      t.total       += Number(i.total ?? 0)
      t.outstanding += (i.status !== 'paid' && i.status !== 'cancelled') ? Number(i.balance_due ?? 0) : 0
    }
    return t
  }, [filtered])

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-4">

      {/* Action row — New invoice button. Courier tax invoices are created
          from the Couriers tab (via CSV import + batch allocations); this
          button drives the manual/reimbursement creation path. */}
      <div className="flex justify-end">
        <Link
          href={newInvoiceHref}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--brand)' }}
        >
          <Plus className="w-4 h-4" /> New invoice
        </Link>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Filter className="w-3.5 h-3.5" />
          <span>Filter</span>
        </div>
        <FilterPill active={filterType === 'all'}           onClick={() => setFilterType('all')}           label="All types" />
        <FilterPill active={filterType === 'tax_invoice'}   onClick={() => setFilterType('tax_invoice')}   label="Courier"    hue="#3B4AC7" />
        <FilterPill active={filterType === 'reimbursement'} onClick={() => setFilterType('reimbursement')} label="Reimbursement" hue="#2A7A50" />
        <span className="mx-1" style={{ color: 'var(--border)' }}>·</span>
        <FilterPill active={filterStatus === 'all'}  onClick={() => setFilterStatus('all')}  label="All statuses" />
        <FilterPill active={filterStatus === 'open'} onClick={() => setFilterStatus('open')} label="Open" hue="#B45309" />
        <FilterPill active={filterStatus === 'paid'} onClick={() => setFilterStatus('paid')} label="Paid" hue="#059669" />
        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {totals.count} invoice{totals.count === 1 ? '' : 's'}
          {totals.outstanding > 0 && ` · ₹${Math.round(totals.outstanding).toLocaleString('en-IN')} outstanding`}
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 gap-3">
          <FileText className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No invoices match this filter.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(inv => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              isReimbursableCustomer={!!inv.customer_id && reimbursableSet.has(inv.customer_id)}
              onMarkPaid={handleMarkPaid}
              onDelete={handleDelete}
              editHref={editHref(inv)}
              marking={markingId  === inv.id}
              deleting={deletingId === inv.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterPill({
  active, onClick, label, hue,
}: { active: boolean; onClick: () => void; label: string; hue?: string }) {
  const color = hue ?? '#6B7280'
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-full border font-medium whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? color : 'var(--border)',
        background:  active ? `${color}18` : 'var(--surface)',
        color:       active ? color : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  )
}

function InvoiceRow({
  invoice, isReimbursableCustomer, onMarkPaid, onDelete, editHref, marking, deleting,
}: {
  invoice: Invoice
  isReimbursableCustomer: boolean
  onMarkPaid: (inv: Invoice) => void
  onDelete:   (inv: Invoice) => void
  editHref:   string
  marking:    boolean
  deleting:   boolean
}) {
  const isReimbursement = invoice.invoice_type === 'reimbursement'
  const isPaid          = invoice.status === 'paid'
  const isCancelled     = invoice.status === 'cancelled'
  const isDraft         = invoice.status === 'draft'
  const canMarkPaid     = !isPaid && !isCancelled && !isDraft

  // Secondary CTA styling for reimbursable-customer courier invoices —
  // paying via the cascade is the normal flow, so we de-emphasize the button.
  const cascadedByReimbursement = !isReimbursement && isReimbursableCustomer

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Type icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: isReimbursement ? 'rgba(42,122,80,0.12)' : 'rgba(59,74,199,0.12)' }}
      >
        {isReimbursement
          ? <FileText className="w-4 h-4" style={{ color: '#2A7A50' }} />
          : <Truck    className="w-4 h-4" style={{ color: '#3B4AC7' }} />}
      </div>

      {/* Main body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{invoice.invoice_number}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-widest"
            style={{
              background: isReimbursement ? 'rgba(42,122,80,0.12)' : 'rgba(59,74,199,0.12)',
              color:      isReimbursement ? '#2A7A50' : '#3B4AC7',
            }}
          >
            {isReimbursement ? 'Reimbursement' : 'Courier'}
          </span>
          <StatusChip status={invoice.status} />
          {cascadedByReimbursement && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }} title="Will settle automatically when the customer's reimbursement invoice is paid.">
              via reimbursement
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {invoice.customer_name} · {fmtMonth(invoice.invoice_month) ?? fmtDate(invoice.invoice_date)}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtCur(Number(invoice.total), invoice.currency)}</p>
        {!isPaid && invoice.balance_due > 0 && (
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fmtCur(Number(invoice.balance_due), invoice.currency)} due</p>
        )}
      </div>

      {/* Actions — Mark paid + Edit + Delete */}
      <div className="flex items-center gap-1 shrink-0">
        {canMarkPaid && (
          <button
            onClick={() => onMarkPaid(invoice)}
            disabled={marking}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{
              background: cascadedByReimbursement ? 'var(--surface)' : 'var(--brand)',
              color:      cascadedByReimbursement ? 'var(--text-muted)' : '#fff',
              border:     cascadedByReimbursement ? '1px solid var(--border)' : 'none',
            }}
            title={cascadedByReimbursement
              ? 'Usually not needed — auto-settles when the reimbursement invoice is paid.'
              : 'Mark this invoice as paid'}
          >
            {marking ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Mark paid'}
          </button>
        )}
        {/* Edit — opens the detail page (courier) or the builder with the
            existing invoice loaded (reimbursement). */}
        <Link
          href={editHref}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors"
          title="Edit invoice"
        >
          <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        </Link>
        {/* Delete — confirm dialog before firing. */}
        <button
          onClick={() => onDelete(invoice)}
          disabled={deleting}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover: disabled:opacity-50 transition-colors"
          title="Delete invoice"
        >
          {deleting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#dc2626' }} />
            : <Trash2 className="w-3.5 h-3.5 " />}
        </button>
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: Invoice['status'] }) {
  const map: Record<Invoice['status'], { bg: string; fg: string; label: string; icon: React.ReactNode }> = {
    draft:      { bg: 'rgba(107,114,128,0.15)', fg: '#6B7280',  label: 'Draft',      icon: <Clock       className="w-3 h-3" /> },
    sent:      { bg: 'rgba(180,83,9,0.15)',    fg: '#B45309', label: 'Sent',       icon: <Clock       className="w-3 h-3" /> },
    finalized:  { bg: 'rgba(34,197,94,0.15)',   fg: '#16A34A', label: 'Finalized',  icon: <CheckCircle2 className="w-3 h-3" /> },
    paid:       { bg: 'rgba(16,185,129,0.15)',  fg: '#059669', label: 'Paid',       icon: <DollarSign  className="w-3 h-3" /> },
    overdue:    { bg: 'rgba(239,68,68,0.15)',   fg: '#DC2626', label: 'Overdue',    icon: <Clock       className="w-3 h-3" /> },
    cancelled:  { bg: 'rgba(107,114,128,0.15)', fg: '#6B7280', label: 'Cancelled',  icon: <Clock       className="w-3 h-3" /> },
  }
  const s = map[status] ?? map.draft
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1" style={{ background: s.bg, color: s.fg }}>
      {s.icon}
      {s.label}
    </span>
  )
}
