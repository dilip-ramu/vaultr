'use client'

import { useState, useMemo } from 'react'
import { Search, CheckCircle2 } from 'lucide-react'
import type { SupplierInvoice, Supplier, RecoverableStatus } from '@/lib/suppliers/types'
import { RECOVERABLE_STATUS_LABELS } from '@/lib/suppliers/types'

interface Props {
  initialInvoices: SupplierInvoice[]
}

function fmtAmt(n: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  billed:           { bg: 'rgba(42,122,80,0.1)',  text: 'var(--brand)' },
  recovered:        { bg: 'color-mix(in srgb, var(--income) 10%, transparent)',   text: 'var(--income)' },
  partial_recovery: { bg: 'rgba(168,85,247,0.1)',  text: '#9333ea' },
  written_off:      { bg: 'rgba(107,114,128,0.1)', text: '#4b5563' },
}

export default function BilledRecoverablesClient({ initialInvoices }: Props) {
  const [invoices, setInvoices] = useState(initialInvoices)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)

  const filtered = useMemo(() => invoices.filter(inv => {
    if (filterStatus && inv.recoverable_status !== filterStatus) return false
    if (filterCustomer && !(inv.linked_customer_name ?? '').toLowerCase().includes(filterCustomer.toLowerCase())) return false
    if (search) {
      const q = search.toLowerCase()
      const sup = inv.supplier as unknown as Supplier
      return (
        (sup?.name ?? '').toLowerCase().includes(q) ||
        (inv.invoice_number ?? '').toLowerCase().includes(q) ||
        (inv.linked_customer_name ?? '').toLowerCase().includes(q) ||
        (inv.billed_invoice_ref ?? '').toLowerCase().includes(q)
      )
    }
    return true
  }), [invoices, search, filterStatus, filterCustomer])

  const stats = useMemo(() => ({
    billed:           filtered.filter(i => i.recoverable_status === 'billed').reduce((s, i) => s + Number(i.amount), 0),
    recovered:        filtered.filter(i => i.recoverable_status === 'recovered').reduce((s, i) => s + Number(i.amount), 0),
    partial_recovery: filtered.filter(i => i.recoverable_status === 'partial_recovery').reduce((s, i) => s + Number(i.amount), 0),
    written_off:      filtered.filter(i => i.recoverable_status === 'written_off').reduce((s, i) => s + Number(i.amount), 0),
  }), [filtered])

  const customers = useMemo(() => [...new Set(invoices.map(i => i.linked_customer_name).filter(Boolean))] as string[], [invoices])

  async function handleUpdateStatus(id: string, status: RecoverableStatus) {
    setUpdating(id)
    try {
      const body: Record<string, unknown> = { recoverable_status: status }
      if (status === 'recovered') body.recovered_date = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/supplier-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) setInvoices(prev => prev.map(i => i.id === id ? data.invoice : i))
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Billed Recoverables</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Recovery status of billed customer expenses.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: 'billed',           label: 'Billed',           color: 'var(--brand)' },
          { key: 'recovered',        label: 'Recovered',        color: 'var(--income)' },
          { key: 'partial_recovery', label: 'Partial Recovery', color: '#9333ea' },
          { key: 'written_off',      label: 'Written Off',      color: '#6b7280' },
        ].map(s => (
          <div key={s.key} className="rounded-xl border p-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="text-base font-bold mt-0.5" style={{ color: s.color }}>₹{fmtAmt(stats[s.key as keyof typeof stats])}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, invoice ref…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">All statuses</option>
          {['billed','recovered','partial_recovery','written_off'].map(s => (
            <option key={s} value={s}>{RECOVERABLE_STATUS_LABELS[s as RecoverableStatus]}</option>
          ))}
        </select>
        <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">All customers</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)' }}>
                {['Supplier', 'Invoice #', 'Date', 'Amount', 'Customer', 'Invoice Ref', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No billed recoverables found</td>
                </tr>
              ) : filtered.map(inv => {
                const sc = STATUS_COLORS[inv.recoverable_status ?? 'billed']
                const sup = inv.supplier as unknown as Supplier
                return (
                  <tr key={inv.id} className="hover:bg-[var(--surface-2)] transition-colors" style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{inv.invoice_number ?? '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text)' }}>{inv.linked_customer_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{inv.billed_invoice_ref ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                        {RECOVERABLE_STATUS_LABELS[inv.recoverable_status ?? 'billed']}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {inv.recoverable_status === 'billed' && (
                          <button
                            onClick={() => handleUpdateStatus(inv.id, 'recovered')}
                            disabled={updating === inv.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--income) 10%, transparent)', color: 'var(--income)' }}
                          >
                            {updating === inv.id ? '…' : 'Recovered'}
                          </button>
                        )}
                        {(inv.recoverable_status === 'billed' || inv.recoverable_status === 'partial_recovery') && (
                          <button
                            onClick={() => handleUpdateStatus(inv.id, 'written_off')}
                            disabled={updating === inv.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: '#4b5563' }}
                          >
                            Write Off
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {filtered.map(inv => {
            const sc = STATUS_COLORS[inv.recoverable_status ?? 'billed']
            const sup = inv.supplier as unknown as Supplier
            return (
              <div key={inv.id} className="p-4 space-y-2" style={{ backgroundColor: 'var(--surface)' }}>
                <div className="flex justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{inv.linked_customer_name ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                      {RECOVERABLE_STATUS_LABELS[inv.recoverable_status ?? 'billed']}
                    </span>
                  </div>
                </div>
                {inv.recoverable_status === 'billed' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdateStatus(inv.id, 'recovered')}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--income) 10%, transparent)', color: 'var(--income)' }}>
                      Recovered
                    </button>
                    <button onClick={() => handleUpdateStatus(inv.id, 'written_off')}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: '#4b5563' }}>
                      Write Off
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
