'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, Search, Pencil, X, Paperclip, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Clock, Circle, CheckSquare, Square, RefreshCw,
  XCircle, User, Link2,
} from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'
import type { PickerAccount } from '@/components/shared/AccountChipPicker'
import { computeInvoiceStatus } from '@/lib/suppliers/types'
import { createClient } from '@/lib/supabase/client'
import SupplierInvoiceForm from './SupplierInvoiceForm'
import BulkPayModal from './BulkPayModal'
import SupplierLinksModal from './SupplierLinksModal'

interface Props {
  initialInvoices: SupplierInvoice[]
  suppliers: Pick<Supplier, 'id' | 'name' | 'supplier_code' | 'payment_terms' | 'custom_terms_days' | 'currency'>[]
  accounts: PickerAccount[]
}

// Extended type to cover v27 fields
type InvoiceExt = SupplierInvoice & { payee_name?: string | null; is_personal_bill?: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysOverdue(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

function daysDue(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function displayName(inv: InvoiceExt): string {
  const sup = inv.supplier as unknown as Supplier
  return sup?.name ?? inv.payee_name ?? inv.invoice_number ?? 'Unnamed'
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pending',   bg: 'rgba(42,122,80,0.08)',   text: 'var(--brand)',   icon: <Circle className="w-3 h-3" /> },
  due:       { label: 'Due Soon',  bg: 'rgba(245,158,11,0.1)',   text: '#b45309',        icon: <Clock className="w-3 h-3" /> },
  overdue:   { label: 'Overdue',   bg: 'rgba(239,68,68,0.1)',    text: '#dc2626',        icon: <AlertTriangle className="w-3 h-3" /> },
  paid:      { label: 'Paid',      bg: 'rgba(34,197,94,0.1)',    text: '#16a34a',        icon: <CheckCircle2 className="w-3 h-3" /> },
  partial:   { label: 'Partial',   bg: 'rgba(168,85,247,0.1)',   text: '#9333ea',        icon: <Circle className="w-3 h-3" /> },
  cancelled: { label: 'Cancelled', bg: 'rgba(107,114,128,0.1)', text: '#6b7280',        icon: <X className="w-3 h-3" /> },
}

const REC_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  pending_billing:  { label: 'Pending Billing',  bg: 'rgba(245,158,11,0.12)',  text: '#b45309' },
  billed:           { label: 'Billed',            bg: 'rgba(42,122,80,0.1)',   text: 'var(--brand)' },
  recovered:        { label: 'Recovered',         bg: 'rgba(34,197,94,0.1)',   text: '#16a34a' },
  partial_recovery: { label: 'Partial Recovery',  bg: 'rgba(168,85,247,0.1)',  text: '#9333ea' },
  written_off:      { label: 'Written Off',       bg: 'rgba(107,114,128,0.1)', text: '#6b7280' },
}

// ── Per-row action buttons ────────────────────────────────────────────────────

function RowActions({
  inv,
  onPay, onUnpay, onMarkBilled, onMarkPending, onMarkSettled, onMarkNotSettled,
  onShowLinks, onEdit, onDelete,
}: {
  inv: InvoiceExt
  onPay: (inv: InvoiceExt) => void
  onUnpay: (inv: InvoiceExt) => void
  onMarkBilled: (inv: InvoiceExt) => void
  onMarkPending: (inv: InvoiceExt) => void
  onMarkSettled: (inv: InvoiceExt) => void
  onMarkNotSettled: (inv: InvoiceExt) => void
  onShowLinks: (inv: InvoiceExt) => void
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
          className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
          title="Delete"
        >
          <X className="w-3.5 h-3.5 text-red-400" />
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SupplierInvoicesClient({ initialInvoices, suppliers, accounts }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [invoices, setInvoices] = useState<InvoiceExt[]>(
    initialInvoices.map(i => ({ ...i, status: computeInvoiceStatus(i) })) as InvoiceExt[]
  )
  const [showForm, setShowForm]           = useState(false)
  const [editing, setEditing]             = useState<InvoiceExt | null>(null)
  const [showBulkPay, setShowBulkPay]     = useState(false)
  const [linksModal, setLinksModal]       = useState<InvoiceExt | null>(null)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [search, setSearch]           = useState(() => searchParams.get('search') ?? '')
  const [statusTab, setStatusTab]     = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterSupplier, setFilterSupplier]       = useState('')
  const [filterType, setFilterType]               = useState<'all' | 'supplier' | 'personal'>('all')
  const [filterRecoverable, setFilterRecoverable] = useState('')
  const [filterRecStatus, setFilterRecStatus]     = useState('')
  const [filterRecurring, setFilterRecurring]     = useState(() => searchParams.get('recurring') === 'true')

  // ── Derived data ──────────────────────────────────────────────────────────

  const enriched = useMemo(() =>
    invoices.map(i => ({ ...i, status: computeInvoiceStatus(i) })) as InvoiceExt[],
    [invoices]
  )

  const filtered = useMemo(() => enriched.filter(inv => {
    if (statusTab && inv.status !== statusTab) return false
    if (filterType === 'supplier' && inv.is_personal_bill) return false
    if (filterType === 'personal' && !inv.is_personal_bill) return false
    if (filterSupplier && inv.supplier_id !== filterSupplier) return false
    if (filterRecoverable === 'yes' && !inv.is_recoverable) return false
    if (filterRecoverable === 'no' && inv.is_recoverable) return false
    if (filterRecStatus && inv.recoverable_status !== filterRecStatus) return false
    if (filterRecurring && !inv.is_recurring) return false
    if (search) {
      const q = search.toLowerCase()
      const sup = (inv.supplier as unknown as Supplier)?.name ?? ''
      return (
        (inv.invoice_number ?? '').toLowerCase().includes(q) ||
        sup.toLowerCase().includes(q) ||
        (inv.payee_name ?? '').toLowerCase().includes(q) ||
        (inv.linked_customer_name ?? '').toLowerCase().includes(q) ||
        (inv.notes ?? '').toLowerCase().includes(q)
      )
    }
    return true
  }), [enriched, statusTab, filterType, filterSupplier, filterRecoverable, filterRecStatus, filterRecurring, search])

  const summary = useMemo(() => ({
    paymentDue:          enriched.filter(i => !i.is_paid && i.status !== 'cancelled').reduce((s, i) => s + Number(i.amount), 0),
    paymentCount:        enriched.filter(i => !i.is_paid && i.status !== 'cancelled').length,
    overdue:             enriched.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0),
    overdueCount:        enriched.filter(i => i.status === 'overdue').length,
    recoverable:         enriched.filter(i => i.is_recoverable && i.status !== 'cancelled').reduce((s, i) => s + Number(i.amount), 0),
    recoverableCount:    enriched.filter(i => i.is_recoverable && i.status !== 'cancelled').length,
    pendingBilling:      enriched.filter(i => i.is_recoverable && i.recoverable_status === 'pending_billing').reduce((s, i) => s + Number(i.amount), 0),
    pendingBillingCount: enriched.filter(i => i.is_recoverable && i.recoverable_status === 'pending_billing').length,
  }), [enriched])

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { '': enriched.length }
    enriched.forEach(i => { c[i.status] = (c[i.status] ?? 0) + 1 })
    return c
  }, [enriched])

  const selectableFiltered = useMemo(() => filtered.filter(i => i.status !== 'cancelled'), [filtered])
  const selectedInvoices   = useMemo(() => invoices.filter(i => selected.has(i.id)), [invoices, selected])

  // Bulk action eligibility counts
  const selUnpaidCount        = useMemo(() => selectedInvoices.filter(i => !i.is_paid).length, [selectedInvoices])
  const selPaidCount          = useMemo(() => selectedInvoices.filter(i => i.is_paid).length, [selectedInvoices])
  const selPendingBillingCount = useMemo(
    () => selectedInvoices.filter(i => i.is_recoverable && i.recoverable_status === 'pending_billing').length,
    [selectedInvoices]
  )
  const selBilledCount        = useMemo(
    () => selectedInvoices.filter(i => i.is_recoverable && i.recoverable_status === 'billed').length,
    [selectedInvoices]
  )
  const selRecoveredCount     = useMemo(
    () => selectedInvoices.filter(i => i.is_recoverable && i.recoverable_status === 'recovered').length,
    [selectedInvoices]
  )
  const selBillableCount      = useMemo(
    () => selectedInvoices.filter(i => !i.is_recoverable).length,
    [selectedInvoices]
  )

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaved(saved: SupplierInvoice) {
    const enrichedSaved = { ...saved, status: computeInvoiceStatus(saved) } as InvoiceExt
    setInvoices(prev => {
      const exists = prev.find(i => i.id === saved.id)
      return exists ? prev.map(i => i.id === saved.id ? enrichedSaved : i) : [enrichedSaved, ...prev]
    })
    setShowForm(false)
    setEditing(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return
    const res = await fetch(`/api/supplier-invoices/${id}`, { method: 'DELETE' })
    if (res.ok) setInvoices(prev => prev.filter(i => i.id !== id))
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // ── Per-row quick actions ─────────────────────────────────────────────────

  function handleQuickPay(inv: InvoiceExt) {
    setSelected(new Set([inv.id]))
    setShowBulkPay(true)
  }

  async function handleQuickUnpay(inv: InvoiceExt) {
    const batchNote = inv.bulk_payment_batch_id
      ? '\n\nThis invoice is part of a bulk payment. All invoices in that payment will also be marked unpaid and the batch transaction deleted.'
      : ''
    if (!confirm(`Mark "${displayName(inv)}" as unpaid? The related transaction will be deleted.${batchNote}`)) return
    await doUnpay([inv.id])
  }

  async function doUnpay(ids: string[]) {
    const res = await fetch('/api/supplier-invoices/bulk-unpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_ids: ids }),
    })
    if (!res.ok) return
    const data = await res.json()
    const unpaidIds: string[] = data.unpaid_ids ?? []
    setInvoices(prev => prev.map(i => {
      if (!unpaidIds.includes(i.id)) return i
      const updated = { ...i, is_paid: false, payment_date: null, payment_reference: null, bulk_payment_batch_id: null }
      return { ...updated, status: computeInvoiceStatus(updated) } as InvoiceExt
    }))
    setSelected(new Set())
  }

  async function handleQuickMarkBilled(inv: InvoiceExt) {
    const res = await fetch('/api/supplier-invoices/bulk-bill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_ids: [inv.id] }),
    })
    if (res.ok) setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, recoverable_status: 'billed' as const } : i))
  }

  async function handleQuickMarkPending(inv: InvoiceExt) {
    const res = await fetch(`/api/supplier-invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoverable_status: 'pending_billing' }),
    })
    if (res.ok) setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, recoverable_status: 'pending_billing' as const } : i))
  }

  async function handleQuickMarkSettled(inv: InvoiceExt) {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch('/api/supplier-invoices/bulk-recovered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_ids: [inv.id], recovered_date: today }),
    })
    if (res.ok) setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, recoverable_status: 'recovered' as const, recovered_date: today } : i))
  }

  async function handleQuickMarkNotSettled(inv: InvoiceExt) {
    const res = await fetch(`/api/supplier-invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoverable_status: 'billed' }),
    })
    if (res.ok) setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, recoverable_status: 'billed' as const } : i))
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  function handleBulkPayDone() {
    setShowBulkPay(false)
    setSelected(new Set())
    router.refresh()
  }

  async function handleBulkUnpay() {
    const ids = invoices.filter(i => selected.has(i.id) && i.is_paid).map(i => i.id)
    if (!ids.length) return
    // Check for batches that will cascade
    const hasBatch = invoices.some(i => ids.includes(i.id) && !!i.bulk_payment_batch_id)
    const msg = hasBatch
      ? `Mark ${ids.length} invoice(s) as unpaid? Batch payments will be fully reversed and all invoices in those batches will also be marked unpaid.`
      : `Mark ${ids.length} invoice(s) as unpaid? Related transactions will be deleted.`
    if (!confirm(msg)) return
    await doUnpay(ids)
  }

  async function handleBulkBill() {
    const ids = invoices.filter(i => selected.has(i.id) && i.is_recoverable && i.recoverable_status === 'pending_billing').map(i => i.id)
    if (!ids.length) return
    const res = await fetch('/api/supplier-invoices/bulk-bill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_ids: ids }),
    })
    if (res.ok) {
      setInvoices(prev => prev.map(i => ids.includes(i.id) ? { ...i, recoverable_status: 'billed' as const } : i))
      setSelected(new Set())
    }
  }

  async function handleBulkMarkPendingBilled() {
    const ids = invoices.filter(i => selected.has(i.id) && i.is_recoverable && i.recoverable_status === 'billed').map(i => i.id)
    if (!ids.length) return
    await Promise.all(ids.map(id =>
      fetch(`/api/supplier-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoverable_status: 'pending_billing' }),
      })
    ))
    setInvoices(prev => prev.map(i => ids.includes(i.id) ? { ...i, recoverable_status: 'pending_billing' as const } : i))
    setSelected(new Set())
  }

  async function handleBulkMarkSettled() {
    const ids = invoices.filter(i => selected.has(i.id) && i.is_recoverable && i.recoverable_status === 'billed').map(i => i.id)
    if (!ids.length) return
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch('/api/supplier-invoices/bulk-recovered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_ids: ids, recovered_date: today }),
    })
    if (res.ok) {
      setInvoices(prev => prev.map(i => ids.includes(i.id) ? { ...i, recoverable_status: 'recovered' as const, recovered_date: today } : i))
      setSelected(new Set())
    }
  }

  async function handleBulkMarkNotSettled() {
    const ids = invoices.filter(i => selected.has(i.id) && i.is_recoverable && i.recoverable_status === 'recovered').map(i => i.id)
    if (!ids.length) return
    await Promise.all(ids.map(id =>
      fetch(`/api/supplier-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoverable_status: 'billed' }),
      })
    ))
    setInvoices(prev => prev.map(i => ids.includes(i.id) ? { ...i, recoverable_status: 'billed' as const } : i))
    setSelected(new Set())
  }

  async function handleBulkMarkBillable() {
    const ids = invoices.filter(i => selected.has(i.id) && !i.is_recoverable).map(i => i.id)
    if (!ids.length) return
    const res = await fetch('/api/supplier-invoices/bulk-recoverable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_ids: ids }),
    })
    if (res.ok) {
      setInvoices(prev => prev.map(i =>
        ids.includes(i.id)
          ? { ...i, is_recoverable: true, billed_to_customer: false, recoverable_status: 'pending_billing' as const }
          : i
      ))
      setSelected(new Set())
    }
  }

  async function openAttachment(path: string) {
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('vaultr-attachments')
      .createSignedUrl(path, 300)   // 5-minute signed URL
    if (error || !data?.signedUrl) return
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const hasFilters = filterType !== 'all' || filterSupplier || filterRecoverable || filterRecStatus || filterRecurring

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Bills &amp; Invoices</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {enriched.length} item{enriched.length !== 1 ? 's' : ''}
            {summary.overdueCount > 0 && (
              <span className="ml-2 font-medium" style={{ color: '#dc2626' }}>
                · {summary.overdueCount} overdue
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--brand)' }}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => { setStatusTab(statusTab === 'pending' ? '' : 'pending'); setFilterRecoverable('') }}
          className="rounded-2xl p-4 text-left transition-all"
          style={{
            background: 'var(--surface)',
            border: `1px solid ${statusTab === 'pending' ? 'var(--brand)' : 'var(--border)'}`,
            borderLeftWidth: statusTab === 'pending' ? 3 : 1,
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Payment Due</p>
          <p className="text-xl font-bold" style={{ color: 'var(--brand)' }}>₹{fmt(summary.paymentDue)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint, var(--text-muted))' }}>{summary.paymentCount} unpaid</p>
        </button>

        <button
          onClick={() => setStatusTab(statusTab === 'overdue' ? '' : 'overdue')}
          className="rounded-2xl p-4 text-left transition-all"
          style={{
            background: summary.overdueCount > 0 ? 'rgba(239,68,68,0.04)' : 'var(--surface)',
            border: `1px solid ${statusTab === 'overdue' ? '#ef4444' : summary.overdueCount > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
            borderLeftWidth: statusTab === 'overdue' ? 3 : 1,
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Overdue</p>
          <p className="text-xl font-bold" style={{ color: summary.overdueCount > 0 ? '#dc2626' : 'var(--text-muted)' }}>
            ₹{fmt(summary.overdue)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint, var(--text-muted))' }}>
            {summary.overdueCount} invoice{summary.overdueCount !== 1 ? 's' : ''}
          </p>
        </button>

        <button
          onClick={() => {
            const next = filterRecoverable === 'yes' && !filterRecStatus
            setFilterRecoverable(next ? '' : 'yes'); setFilterRecStatus('')
          }}
          className="rounded-2xl p-4 text-left transition-all"
          style={{
            background: 'var(--surface)',
            border: `1px solid ${filterRecoverable === 'yes' && !filterRecStatus ? '#f59e0b' : 'var(--border)'}`,
            borderLeftWidth: filterRecoverable === 'yes' && !filterRecStatus ? 3 : 1,
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Recoverable</p>
          <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>₹{fmt(summary.recoverable)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint, var(--text-muted))' }}>
            {summary.recoverableCount} invoice{summary.recoverableCount !== 1 ? 's' : ''}
          </p>
        </button>

        <button
          onClick={() => {
            const next = filterRecoverable === 'yes' && filterRecStatus === 'pending_billing'
            setFilterRecoverable(next ? '' : 'yes'); setFilterRecStatus(next ? '' : 'pending_billing')
          }}
          className="rounded-2xl p-4 text-left transition-all"
          style={{
            background: 'var(--surface)',
            border: `1px solid ${filterRecoverable === 'yes' && filterRecStatus === 'pending_billing' ? '#f59e0b' : 'var(--border)'}`,
            borderLeftWidth: filterRecoverable === 'yes' && filterRecStatus === 'pending_billing' ? 3 : 1,
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Pending Billing</p>
          <p className="text-xl font-bold" style={{ color: '#b45309' }}>₹{fmt(summary.pendingBilling)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint, var(--text-muted))' }}>
            {summary.pendingBillingCount} to bill
          </p>
        </button>
      </div>

      {/* ── Status tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--surface-2, var(--surface))' }}>
        {[
          { label: 'All',      value: '' },
          { label: 'Pending',  value: 'pending' },
          { label: 'Due Soon', value: 'due' },
          { label: 'Overdue',  value: 'overdue' },
          { label: 'Paid',     value: 'paid' },
          { label: 'Partial',  value: 'partial' },
        ].map(tab => {
          const count = tabCounts[tab.value] ?? 0
          const active = statusTab === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setStatusTab(tab.value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
              style={active
                ? { background: 'var(--background, var(--bg))', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
                : { color: 'var(--text-muted)' }
              }
            >
              {tab.label}
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: active ? 'var(--brand)' : 'var(--border)',
                  color: active ? '#fff' : 'var(--text-muted)',
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Search + filter toggle ─────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, bill name, invoice #…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
        <button
          onClick={() => setShowFilters(f => !f)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium"
          style={{
            background: hasFilters ? 'rgba(42,122,80,0.08)' : 'var(--surface)',
            borderColor: hasFilters ? 'var(--brand)' : 'var(--border)',
            color: hasFilters ? 'var(--brand)' : 'var(--text-muted)',
          }}
        >
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {hasFilters ? 'Filtered' : 'Filter'}
        </button>
      </div>

      {showFilters && (
        <div
          className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Type filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value as 'all' | 'supplier' | 'personal')}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="all">All bills &amp; invoices</option>
              <option value="supplier">Supplier invoices only</option>
              <option value="personal">Personal bills only</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Supplier</label>
            <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="">All suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Recoverable</label>
            <select value={filterRecoverable} onChange={e => setFilterRecoverable(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="">All</option>
              <option value="yes">Recoverable only</option>
              <option value="no">Non-recoverable only</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Recovery Status</label>
            <select value={filterRecStatus} onChange={e => setFilterRecStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="">All statuses</option>
              {Object.entries(REC_STATUS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Recurrence</label>
            <button
              type="button"
              onClick={() => setFilterRecurring(r => !r)}
              className="w-full px-3 py-2 rounded-lg border text-sm text-left flex items-center gap-2"
              style={{
                background: filterRecurring ? 'rgba(42,122,80,0.08)' : 'var(--surface-2)',
                borderColor: filterRecurring ? 'var(--brand)' : 'var(--border)',
                color: filterRecurring ? 'var(--brand)' : 'var(--text-muted)',
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {filterRecurring ? 'Recurring only' : 'All types'}
            </button>
          </div>
          {hasFilters && (
            <div className="sm:col-span-4 flex justify-end">
              <button
                onClick={() => { setFilterType('all'); setFilterSupplier(''); setFilterRecoverable(''); setFilterRecStatus(''); setFilterRecurring(false) }}
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3 h-3" /> Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Select-all row ─────────────────────────────────────────────────── */}
      {selectableFiltered.length > 0 && (
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <button
            onClick={() => setSelected(
              selected.size === selectableFiltered.length
                ? new Set()
                : new Set(selectableFiltered.map(i => i.id))
            )}
            className="flex items-center gap-1.5"
          >
            {selected.size === selectableFiltered.length && selectableFiltered.length > 0
              ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              : <Square className="w-4 h-4" />
            }
            <span>{selected.size > 0 ? `${selected.size} selected` : 'Select all'}</span>
          </button>
        </div>
      )}

      {/* ── Floating bulk-action bar ───────────────────────────────────────── */}
      {selected.size > 0 && (
        <div
          className="sticky top-3 z-10 rounded-2xl border shadow-lg px-4 py-3 flex flex-wrap items-center gap-2"
          style={{ background: 'var(--surface)', borderColor: 'var(--brand)', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
        >
          <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--text)' }}>
            {selected.size} selected
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            {selUnpaidCount > 0 && (
              <button
                onClick={() => setShowBulkPay(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Paid ({selUnpaidCount})
              </button>
            )}
            {selPaidCount > 0 && (
              <button
                onClick={handleBulkUnpay}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <XCircle className="w-3.5 h-3.5" />
                Mark Unpaid ({selPaidCount})
              </button>
            )}
            {selPendingBillingCount > 0 && (
              <button
                onClick={handleBulkBill}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                Mark Billed ({selPendingBillingCount})
              </button>
            )}
            {selBilledCount > 0 && (
              <>
                <button
                  onClick={handleBulkMarkSettled}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(168,85,247,0.1)', color: '#9333ea', border: '1px solid rgba(168,85,247,0.25)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Settled ({selBilledCount})
                </button>
                <button
                  onClick={handleBulkMarkPendingBilled}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.2)' }}
                >
                  Pending Billed ({selBilledCount})
                </button>
              </>
            )}
            {selRecoveredCount > 0 && (
              <button
                onClick={handleBulkMarkNotSettled}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.2)' }}
              >
                Not Settled ({selRecoveredCount})
              </button>
            )}
            {selBillableCount > 0 && (
              <button
                onClick={handleBulkMarkBillable}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#4f46e5', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Make Billable ({selBillableCount})
              </button>
            )}
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="p-1.5 rounded-lg ml-auto shrink-0"
            style={{ color: 'var(--text-muted)' }}
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Invoice list ───────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          className="py-20 text-center rounded-2xl border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-base font-medium mb-1" style={{ color: 'var(--text)' }}>Nothing here</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {search || hasFilters || statusTab ? 'Try adjusting your filters' : 'Add your first bill or invoice'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)' }}>
                  <th className="w-9 pl-4 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Payee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Invoice / Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Dates</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Status / Recovery</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold min-w-[210px]" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const s = STATUS[inv.status] ?? STATUS.pending
                  const sup = inv.supplier as unknown as Supplier
                  const rec = inv.is_recoverable && inv.recoverable_status ? REC_STATUS[inv.recoverable_status] : null
                  const canSelect = inv.status !== 'cancelled'
                  const isOverdue = inv.status === 'overdue'

                  return (
                    <tr
                      key={inv.id}
                      style={{
                        background: isOverdue ? 'rgba(239,68,68,0.02)' : 'var(--surface)',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: isOverdue ? '3px solid #ef4444' : '3px solid transparent',
                      }}
                    >
                      {/* Checkbox */}
                      <td className="pl-3 py-4">
                        {canSelect && (
                          <button onClick={() => toggleSelect(inv.id)}>
                            {selected.has(inv.id)
                              ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                              : <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                            }
                          </button>
                        )}
                      </td>

                      {/* Payee (supplier or personal bill) */}
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1.5">
                          {inv.is_personal_bill && (
                            <User className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                          )}
                          <div>
                            <p className="font-semibold" style={{ color: 'var(--text)' }}>
                              {sup?.name ?? inv.payee_name ?? '—'}
                            </p>
                            {sup?.supplier_code && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sup.supplier_code}</p>
                            )}
                            {inv.is_personal_bill && (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded mt-0.5 font-medium"
                                style={{ background: 'rgba(99,102,241,0.1)', color: '#4f46e5' }}>
                                Personal
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Invoice # */}
                      <td className="px-4 py-4">
                        <p className="font-mono text-xs font-medium" style={{ color: 'var(--text)' }}>
                          {inv.invoice_number ?? '—'}
                        </p>
                        {inv.category && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{inv.category}</p>
                        )}
                        {inv.auto_imported && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: 'rgba(42,122,80,0.1)', color: 'var(--brand)' }}>
                            Email
                          </span>
                        )}
                        {inv.is_recurring && (
                          <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: 'rgba(99,102,241,0.1)', color: '#4f46e5' }}>
                            <RefreshCw className="w-2.5 h-2.5" /> {inv.recurrence_interval ?? 'Recurring'}
                          </span>
                        )}
                      </td>

                      {/* Dates */}
                      <td className="px-4 py-4">
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(inv.invoice_date)}</p>
                        {inv.due_date && (
                          <p className="text-xs mt-0.5 font-medium" style={{
                            color: isOverdue ? '#dc2626' : inv.status === 'due' ? '#b45309' : 'var(--text-muted)',
                          }}>
                            {isOverdue
                              ? `${daysOverdue(inv.due_date)}d overdue`
                              : inv.status === 'due'
                                ? `Due in ${daysDue(inv.due_date)}d`
                                : `Due ${fmtDate(inv.due_date)}`
                            }
                          </p>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-4 text-right">
                        <p className="font-bold text-base" style={{ color: 'var(--text)' }}>₹{fmt(Number(inv.amount))}</p>
                        {inv.attachment_path && (
                          <button
                            onClick={() => openAttachment(inv.attachment_path!)}
                            title={inv.attachment_name ?? 'View attachment'}
                            className="flex items-center gap-1 ml-auto mt-1 text-xs hover:underline"
                            style={{ color: 'var(--brand)' }}
                          >
                            <Paperclip className="w-3 h-3" />
                            {inv.attachment_name && (
                              <span className="truncate max-w-[120px]">{inv.attachment_name}</span>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Status + Recovery (combined) */}
                      <td className="px-4 py-4">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                          style={{ background: s.bg, color: s.text }}
                        >
                          {s.icon}
                          {s.label}
                        </span>
                        {inv.is_recoverable && (
                          <div className="mt-1.5 space-y-0.5">
                            {inv.linked_customer_name && (
                              <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                                {inv.linked_customer_name}
                              </p>
                            )}
                            {rec && (
                              <span
                                className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ background: rec.bg, color: rec.text }}
                              >
                                {rec.label}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <RowActions
                          inv={inv}
                          onPay={handleQuickPay}
                          onUnpay={handleQuickUnpay}
                          onMarkBilled={handleQuickMarkBilled}
                          onMarkPending={handleQuickMarkPending}
                          onMarkSettled={handleQuickMarkSettled}
                          onMarkNotSettled={handleQuickMarkNotSettled}
                          onShowLinks={setLinksModal}
                          onEdit={i => { setEditing(i); setShowForm(true) }}
                          onDelete={handleDelete}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(inv => {
              const s = STATUS[inv.status] ?? STATUS.pending
              const sup = inv.supplier as unknown as Supplier
              const rec = inv.is_recoverable && inv.recoverable_status ? REC_STATUS[inv.recoverable_status] : null
              const canSelect = inv.status !== 'cancelled'
              const isOverdue = inv.status === 'overdue'

              return (
                <div
                  key={inv.id}
                  className="p-4 space-y-3"
                  style={{
                    background: isOverdue ? 'rgba(239,68,68,0.02)' : 'var(--surface)',
                    borderLeft: isOverdue ? '3px solid #ef4444' : '3px solid transparent',
                  }}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {canSelect && (
                        <button onClick={() => toggleSelect(inv.id)} className="mt-0.5 shrink-0">
                          {selected.has(inv.id)
                            ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                            : <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                          }
                        </button>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {inv.is_personal_bill && <User className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />}
                          <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>
                            {sup?.name ?? inv.payee_name ?? '—'}
                          </p>
                        </div>
                        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {inv.invoice_number ?? 'No invoice #'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>₹{fmt(Number(inv.amount))}</p>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1"
                        style={{ background: s.bg, color: s.text }}
                      >
                        {s.icon}{s.label}
                      </span>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{fmtDate(inv.invoice_date)}</span>
                    {inv.due_date && (
                      <span style={{ color: isOverdue ? '#dc2626' : inv.status === 'due' ? '#b45309' : 'var(--text-muted)' }}>
                        {isOverdue ? `${daysOverdue(inv.due_date)}d overdue` : `Due ${fmtDate(inv.due_date)}`}
                      </span>
                    )}
                    {inv.is_recoverable && rec && (
                      <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: rec.bg, color: rec.text }}>
                        {rec.label}
                      </span>
                    )}
                    {inv.linked_customer_name && (
                      <span className="font-medium" style={{ color: 'var(--text)' }}>→ {inv.linked_customer_name}</span>
                    )}
                    {inv.auto_imported && (
                      <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(42,122,80,0.1)', color: 'var(--brand)' }}>Email</span>
                    )}
                    {inv.is_personal_bill && (
                      <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(99,102,241,0.1)', color: '#4f46e5' }}>Personal</span>
                    )}
                    {inv.attachment_path && (
                      <button
                        onClick={() => openAttachment(inv.attachment_path!)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                        style={{ background: 'rgba(42,122,80,0.08)', color: 'var(--brand)' }}
                      >
                        <Paperclip className="w-3 h-3" />
                        {inv.attachment_name ?? 'Attachment'}
                      </button>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {/* Payment track */}
                    {inv.status !== 'cancelled' && !inv.is_paid && (
                      <button
                        onClick={() => handleQuickPay(inv)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        Mark Paid
                      </button>
                    )}
                    {inv.status !== 'cancelled' && inv.is_paid && (
                      <button
                        onClick={() => handleQuickUnpay(inv)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        Mark Unpaid
                      </button>
                    )}
                    {/* Recovery track */}
                    {inv.is_recoverable && inv.recoverable_status === 'pending_billing' && (
                      <button
                        onClick={() => handleQuickMarkBilled(inv)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.2)' }}
                      >
                        Mark Billed
                      </button>
                    )}
                    {inv.is_recoverable && inv.recoverable_status === 'billed' && (
                      <>
                        <button
                          onClick={() => handleQuickMarkSettled(inv)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                          style={{ background: 'rgba(168,85,247,0.1)', color: '#9333ea', border: '1px solid rgba(168,85,247,0.2)' }}
                        >
                          Settled
                        </button>
                        <button
                          onClick={() => handleQuickMarkPending(inv)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                          style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.2)' }}
                        >
                          Pending
                        </button>
                      </>
                    )}
                    {inv.is_recoverable && inv.recoverable_status === 'recovered' && (
                      <button
                        onClick={() => handleQuickMarkNotSettled(inv)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.2)' }}
                      >
                        Not Settled
                      </button>
                    )}
                    {inv.is_recoverable && (
                      <button
                        onClick={() => setLinksModal(inv)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1"
                        style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5', border: '1px solid rgba(99,102,241,0.2)' }}
                      >
                        <Link2 className="w-3 h-3" /> Customer Invoices
                      </button>
                    )}
                    {/* Edit/delete */}
                    <button
                      onClick={() => { setEditing(inv); setShowForm(true) }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer count */}
          <div
            className="px-4 py-2.5 text-xs border-t"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2, var(--surface))' }}
          >
            {filtered.length} of {enriched.length} item{enriched.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <SupplierInvoiceForm
          invoice={editing}
          suppliers={suppliers}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
      {showBulkPay && (
        <BulkPayModal
          invoiceIds={[...selected]}
          invoices={invoices.filter(i => selected.has(i.id)) as SupplierInvoice[]}
          accounts={accounts}
          onDone={handleBulkPayDone}
          onClose={() => setShowBulkPay(false)}
        />
      )}
      {linksModal && (
        <SupplierLinksModal
          inv={linksModal as SupplierInvoice}
          onClose={() => setLinksModal(null)}
        />
      )}
    </div>
  )
}
