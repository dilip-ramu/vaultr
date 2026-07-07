'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { FileWarning, Search, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import type { SupplierInvoice, Supplier, RecoverableStatus } from '@/lib/suppliers/types'
import { RECOVERABLE_STATUS_LABELS } from '@/lib/suppliers/types'

interface Props {
  initialInvoices: SupplierInvoice[]
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending_billing:  { bg: 'rgba(245,158,11,0.12)', text: '#b45309' },
  billed:           { bg: 'rgba(42,122,80,0.1)',  text: 'var(--brand)' },
  recovered:        { bg: 'rgba(34,197,94,0.1)',   text: '#16a34a' },
  partial_recovery: { bg: 'rgba(168,85,247,0.1)',  text: '#9333ea' },
  written_off:      { bg: 'rgba(107,114,128,0.1)', text: '#4b5563' },
}

export default function PendingRecoverablesClient({ initialInvoices }: Props) {
  const router = useRouter()
  const [invoices, setInvoices] = useState(initialInvoices)
  const [search, setSearch] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (filterCustomer && !(inv.linked_customer_name ?? '').toLowerCase().includes(filterCustomer.toLowerCase())) return false
      if (search) {
        const q = search.toLowerCase()
        const sup = inv.supplier as unknown as Supplier
        return (
          (sup?.name ?? '').toLowerCase().includes(q) ||
          (inv.invoice_number ?? '').toLowerCase().includes(q) ||
          (inv.linked_customer_name ?? '').toLowerCase().includes(q) ||
          (inv.category ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [invoices, search, filterCustomer])

  const totalPending = useMemo(() => filtered.filter(i => i.recoverable_status === 'pending_billing').reduce((s, i) => s + Number(i.amount), 0), [filtered])
  const totalBilled = useMemo(() => filtered.filter(i => i.recoverable_status === 'billed').reduce((s, i) => s + Number(i.amount), 0), [filtered])

  // Group by customer
  const byCustomer = useMemo(() => {
    const map = new Map<string, SupplierInvoice[]>()
    for (const inv of filtered) {
      const key = inv.linked_customer_name ?? 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(inv)
    }
    return [...map.entries()].sort((a, b) => {
      const aAmt = a[1].reduce((s, i) => s + Number(i.amount), 0)
      const bAmt = b[1].reduce((s, i) => s + Number(i.amount), 0)
      return bAmt - aAmt
    })
  }, [filtered])

  const customers = useMemo(() => {
    const set = new Set(invoices.map(i => i.linked_customer_name).filter(Boolean))
    return [...set] as string[]
  }, [invoices])

  async function handleUpdateStatus(id: string, status: RecoverableStatus, extra?: Partial<SupplierInvoice>) {
    setUpdating(id)
    try {
      const body: Record<string, unknown> = { recoverable_status: status, ...extra }
      if (status === 'recovered') body.recovered_date = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/supplier-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) setInvoices(prev => prev.map(i => i.id === id ? { ...data.invoice } : i))
    } finally {
      setUpdating(null)
    }
  }

  async function handleMarkBilled(id: string) {
    const ref = prompt('Enter customer invoice reference (optional):') ?? ''
    await handleUpdateStatus(id, 'billed', { billed_to_customer: true, billed_invoice_ref: ref || null })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Pending Recoverables</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Supplier costs that have not yet been billed back to customers.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--surface)', borderColor: '#f59e0b', borderWidth: 2 }}>
          <p className="text-xs font-medium" style={{ color: '#b45309' }}>Pending Billing</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#b45309' }}>₹{fmtAmt(totalPending)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{filtered.filter(i => i.recoverable_status === 'pending_billing').length} items</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Billed to Customer</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--brand)' }}>₹{fmtAmt(totalBilled)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{filtered.filter(i => i.recoverable_status === 'billed').length} items</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, invoice, customer…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
        <select
          value={filterCustomer}
          onChange={e => setFilterCustomer(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">All customers</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Grouped by customer */}
      {byCustomer.length === 0 ? (
        <div className="py-20 text-center rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <FileWarning className="w-10 h-10 mx-auto mb-3 " />
          <p className="font-medium" style={{ color: 'var(--text)' }}>No pending recoverables</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>All supplier costs are either billed or recovered</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byCustomer.map(([customer, custInvoices]) => {
            const total = custInvoices.reduce((s, i) => s + Number(i.amount), 0)
            const pendingCount = custInvoices.filter(i => i.recoverable_status === 'pending_billing').length
            return (
              <div key={customer} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {/* Customer Header */}
                <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: 'var(--surface-2, var(--surface))' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{customer}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {custInvoices.length} item{custInvoices.length !== 1 ? 's' : ''} · {pendingCount} pending billing
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ color: '#b45309' }}>₹{fmtAmt(total)}</p>
                  </div>
                </div>

                {/* Invoices */}
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {custInvoices.map(inv => {
                    const sup = inv.supplier as unknown as Supplier
                    const sc = STATUS_COLORS[inv.recoverable_status ?? 'pending_billing']
                    const age = daysSince(inv.invoice_date)
                    return (
                      <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ backgroundColor: 'var(--surface)' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                              {sup?.name ?? '—'}
                            </p>
                            {inv.invoice_number && (
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                                {inv.invoice_number}
                              </span>
                            )}
                            {inv.category && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                                {inv.category}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>{fmtDate(inv.invoice_date)}</span>
                            <span className={age > 30 ? ' font-medium' : ''}>{age}d old</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-base font-bold" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</span>
                          <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                            {RECOVERABLE_STATUS_LABELS[inv.recoverable_status ?? 'pending_billing']}
                          </span>

                          {inv.recoverable_status === 'pending_billing' && (
                            <button
                              onClick={() => handleMarkBilled(inv.id)}
                              disabled={updating === inv.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ backgroundColor: 'rgba(42,122,80,0.1)', color: 'var(--brand)' }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {updating === inv.id ? 'Updating…' : 'Mark Billed'}
                            </button>
                          )}
                          {inv.recoverable_status === 'billed' && (
                            <button
                              onClick={() => handleUpdateStatus(inv.id, 'recovered')}
                              disabled={updating === inv.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a' }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {updating === inv.id ? 'Updating…' : 'Mark Recovered'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
