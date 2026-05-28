'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Filter, CheckSquare, Square, AlertTriangle, Clock,
  CheckCircle2, FileText, Paperclip, RefreshCw, X, ChevronDown,
} from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'
import { computeInvoiceStatus, INVOICE_CATEGORIES, RECOVERABLE_STATUS_LABELS, INVOICE_STATUS_LABELS } from '@/lib/suppliers/types'
import SupplierInvoiceForm from './SupplierInvoiceForm'
import BulkPayModal from './BulkPayModal'

interface Props {
  initialInvoices: SupplierInvoice[]
  suppliers: Pick<Supplier, 'id' | 'name' | 'supplier_code' | 'payment_terms' | 'custom_terms_days' | 'currency'>[]
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysAgo(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: 'rgba(99,102,241,0.08)',  text: '#6366f1' },
  due:       { bg: 'rgba(245,158,11,0.1)',   text: '#b45309' },
  overdue:   { bg: 'rgba(239,68,68,0.1)',    text: '#dc2626' },
  paid:      { bg: 'rgba(34,197,94,0.1)',    text: '#16a34a' },
  partial:   { bg: 'rgba(168,85,247,0.1)',   text: '#9333ea' },
  cancelled: { bg: 'rgba(107,114,128,0.1)',  text: '#4b5563' },
}

const REC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending_billing:  { bg: 'rgba(245,158,11,0.1)',  text: '#b45309' },
  billed:           { bg: 'rgba(99,102,241,0.1)',  text: '#6366f1' },
  recovered:        { bg: 'rgba(34,197,94,0.1)',   text: '#16a34a' },
  partial_recovery: { bg: 'rgba(168,85,247,0.1)',  text: '#9333ea' },
  written_off:      { bg: 'rgba(107,114,128,0.1)', text: '#4b5563' },
}

export default function SupplierInvoicesClient({ initialInvoices, suppliers }: Props) {
  const router = useRouter()
  const [invoices, setInvoices] = useState<SupplierInvoice[]>(initialInvoices.map(i => ({
    ...i, status: computeInvoiceStatus(i),
  })))
  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showBulkPay, setShowBulkPay] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterRecoverable, setFilterRecoverable] = useState('')
  const [filterRecStatus, setFilterRecStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (filterStatus && inv.status !== filterStatus) return false
      if (filterSupplier && inv.supplier_id !== filterSupplier) return false
      if (filterRecoverable === 'yes' && !inv.is_recoverable) return false
      if (filterRecoverable === 'no' && inv.is_recoverable) return false
      if (filterRecStatus && inv.recoverable_status !== filterRecStatus) return false
      if (filterCategory && inv.category !== filterCategory) return false
      if (filterCustomer && !(inv.linked_customer_name ?? '').toLowerCase().includes(filterCustomer.toLowerCase())) return false
      if (search) {
        const q = search.toLowerCase()
        const supName = (inv.supplier as unknown as Supplier)?.name ?? ''
        return (
          (inv.invoice_number ?? '').toLowerCase().includes(q) ||
          supName.toLowerCase().includes(q) ||
          (inv.linked_customer_name ?? '').toLowerCase().includes(q) ||
          (inv.category ?? '').toLowerCase().includes(q) ||
          (inv.notes ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [invoices, search, filterStatus, filterSupplier, filterRecoverable, filterRecStatus, filterCategory, filterCustomer])

  const totals = useMemo(() => {
    const total = filtered.reduce((s, i) => s + Number(i.amount), 0)
    const outstanding = filtered.filter(i => !i.is_paid && i.status !== 'cancelled').reduce((s, i) => s + Number(i.amount), 0)
    const overdue = filtered.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0)
    return { total, outstanding, overdue }
  }, [filtered])

  const unpaidFiltered = useMemo(() => filtered.filter(i => !i.is_paid && i.status !== 'cancelled'), [filtered])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === unpaidFiltered.length && unpaidFiltered.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(unpaidFiltered.map(i => i.id)))
    }
  }

  function handleSaved(saved: SupplierInvoice) {
    const enriched = { ...saved, status: computeInvoiceStatus(saved) }
    setInvoices(prev => {
      const exists = prev.find(i => i.id === saved.id)
      return exists ? prev.map(i => i.id === saved.id ? enriched : i) : [enriched, ...prev]
    })
    setShowForm(false)
    setEditingInvoice(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return
    const res = await fetch(`/api/supplier-invoices/${id}`, { method: 'DELETE' })
    if (res.ok) setInvoices(prev => prev.filter(i => i.id !== id))
  }

  async function handleTogglePaid(inv: SupplierInvoice) {
    const body = inv.is_paid
      ? { is_paid: false, payment_date: null, payment_reference: null }
      : { is_paid: true, payment_date: new Date().toISOString().split('T')[0], status: 'paid' }
    const res = await fetch(`/api/supplier-invoices/${inv.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) setInvoices(prev => prev.map(i => i.id === inv.id ? { ...data.invoice, status: computeInvoiceStatus(data.invoice) } : i))
  }

  function handleBulkPayDone() {
    setShowBulkPay(false)
    setSelected(new Set())
    router.refresh()
  }

  const clearFilters = () => {
    setSearch(''); setFilterStatus(''); setFilterSupplier('')
    setFilterRecoverable(''); setFilterRecStatus(''); setFilterCategory(''); setFilterCustomer('')
  }
  const hasFilters = search || filterStatus || filterSupplier || filterRecoverable || filterRecStatus || filterCategory || filterCustomer

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Supplier Invoices</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{invoices.length} total · {invoices.filter(i => i.status === 'overdue').length} overdue</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setShowBulkPay(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <CheckCircle2 className="w-4 h-4" /> Pay {selected.size}
            </button>
          )}
          <button
            onClick={() => { setEditingInvoice(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <Plus className="w-4 h-4" /> Add Invoice
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: `₹${fmtAmt(totals.total)}`, color: 'var(--text)' },
          { label: 'Outstanding', value: `₹${fmtAmt(totals.outstanding)}`, color: '#6366f1' },
          { label: 'Overdue', value: `₹${fmtAmt(totals.overdue)}`, color: totals.overdue > 0 ? '#dc2626' : 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border p-3 text-center" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="text-base font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice #, supplier, customer, notes…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm"
            style={{
              backgroundColor: hasFilters ? 'var(--brand-light)' : 'var(--surface)',
              borderColor: hasFilters ? 'var(--brand)' : 'var(--border)',
              color: hasFilters ? 'var(--brand)' : 'var(--text-muted)',
            }}
          >
            <Filter className="w-4 h-4" />
            {hasFilters ? 'Filtered' : 'Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-4 gap-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}>
              <option value="">All statuses</option>
              {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </FilterSelect>
            <FilterSelect label="Supplier" value={filterSupplier} onChange={setFilterSupplier}>
              <option value="">All suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Recoverable" value={filterRecoverable} onChange={setFilterRecoverable}>
              <option value="">All</option>
              <option value="yes">Recoverable</option>
              <option value="no">Not Recoverable</option>
            </FilterSelect>
            <FilterSelect label="Rec. Status" value={filterRecStatus} onChange={setFilterRecStatus}>
              <option value="">All statuses</option>
              {Object.entries(RECOVERABLE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </FilterSelect>
            <FilterSelect label="Category" value={filterCategory} onChange={setFilterCategory}>
              <option value="">All categories</option>
              {INVOICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Customer</label>
              <input
                value={filterCustomer}
                onChange={e => setFilterCustomer(e.target.value)}
                placeholder="Filter by customer…"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
            {hasFilters && (
              <div className="col-span-2 md:col-span-4 flex justify-end">
                <button onClick={clearFilters} className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <X className="w-3 h-3" /> Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk select bar */}
      {unpaidFiltered.length > 0 && (
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <button onClick={toggleSelectAll} className="flex items-center gap-1.5">
            {selected.size === unpaidFiltered.length && unpaidFiltered.length > 0
              ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              : <Square className="w-4 h-4" />
            }
            {selected.size > 0 ? `${selected.size} selected` : 'Select unpaid'}
          </button>
        </div>
      )}

      {/* Invoice Table */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>No invoices found</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {hasFilters ? 'Try adjusting your filters' : 'Add your first supplier invoice to get started'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)' }}>
                  <th className="w-10 px-3 py-3" />
                  {['Supplier', 'Invoice #', 'Date / Due', 'Amount', 'Category', 'Recoverable', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.pending
                  const rc = inv.recoverable_status ? REC_STATUS_COLORS[inv.recoverable_status] : null
                  const sup = inv.supplier as unknown as Supplier
                  const canSelect = !inv.is_paid && inv.status !== 'cancelled'
                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-[var(--surface-2)] transition-colors"
                      style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
                    >
                      <td className="px-3 py-3">
                        {canSelect && (
                          <button onClick={() => toggleSelect(inv.id)}>
                            {selected.has(inv.id)
                              ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                              : <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                            }
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</p>
                        {sup?.supplier_code && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sup.supplier_code}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                        {inv.invoice_number ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(inv.invoice_date)}</p>
                        {inv.due_date && (
                          <p className="text-xs mt-0.5" style={{ color: inv.status === 'overdue' ? '#dc2626' : 'var(--text-muted)' }}>
                            {inv.status === 'overdue' ? `${daysAgo(inv.due_date)}d overdue` : `Due ${fmtDate(inv.due_date)}`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.category && (
                          <span className="px-2 py-0.5 rounded-md text-xs" style={{ backgroundColor: 'var(--surface-2, var(--bg))', color: 'var(--text-muted)' }}>
                            {inv.category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.is_recoverable ? (
                          <div>
                            <p className="text-xs font-medium" style={{ color: '#f59e0b' }}>Recoverable</p>
                            {inv.linked_customer_name && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{inv.linked_customer_name}</p>
                            )}
                            {rc && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: rc.bg, color: rc.text }}>
                                {RECOVERABLE_STATUS_LABELS[inv.recoverable_status!]}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </span>
                        {inv.attachment_path && (
                          <Paperclip className="w-3 h-3 inline-block ml-2" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleTogglePaid(inv)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                            style={{
                              borderColor: inv.is_paid ? 'var(--border)' : '#16a34a',
                              color: inv.is_paid ? 'var(--text-muted)' : '#16a34a',
                              backgroundColor: inv.is_paid ? 'transparent' : 'rgba(34,197,94,0.08)',
                            }}
                          >
                            {inv.is_paid ? 'Unpaid' : 'Paid'}
                          </button>
                          <button
                            onClick={() => { setEditingInvoice(inv); setShowForm(true) }}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)]"
                            title="Edit"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(inv.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50"
                            title="Delete"
                          >
                            <X className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(inv => {
              const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.pending
              const sup = inv.supplier as unknown as Supplier
              const canSelect = !inv.is_paid && inv.status !== 'cancelled'
              return (
                <div key={inv.id} className="p-4 space-y-2" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      {canSelect && (
                        <button onClick={() => toggleSelect(inv.id)} className="mt-0.5">
                          {selected.has(inv.id)
                            ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                            : <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                          }
                        </button>
                      )}
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</p>
                        <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>{inv.invoice_number ?? '—'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{fmtDate(inv.invoice_date)}</span>
                    {inv.due_date && <span>Due: {fmtDate(inv.due_date)}</span>}
                    {inv.category && <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-2)' }}>{inv.category}</span>}
                    {inv.is_recoverable && <span style={{ color: '#f59e0b' }}>• Recoverable</span>}
                    {inv.linked_customer_name && <span>{inv.linked_customer_name}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTogglePaid(inv)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium border"
                      style={{
                        borderColor: inv.is_paid ? 'var(--border)' : '#16a34a',
                        color: inv.is_paid ? 'var(--text-muted)' : '#16a34a',
                        backgroundColor: inv.is_paid ? 'transparent' : 'rgba(34,197,94,0.08)',
                      }}
                    >
                      {inv.is_paid ? 'Mark Unpaid' : 'Mark Paid'}
                    </button>
                    <button
                      onClick={() => { setEditingInvoice(inv); setShowForm(true) }}
                      className="px-3 py-1.5 rounded-lg text-xs border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <SupplierInvoiceForm
          invoice={editingInvoice}
          suppliers={suppliers}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditingInvoice(null) }}
        />
      )}

      {showBulkPay && (
        <BulkPayModal
          invoiceIds={[...selected]}
          invoices={invoices.filter(i => selected.has(i.id))}
          onDone={handleBulkPayDone}
          onClose={() => setShowBulkPay(false)}
        />
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        {children}
      </select>
    </div>
  )
}
