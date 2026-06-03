'use client'

import { useState, useMemo } from 'react'
import { Search, CheckCircle2, ArrowDownLeft } from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'

interface Props {
  initialInvoices: SupplierInvoice[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SettledInvoicesClient({ initialInvoices }: Props) {
  const [search, setSearch]                   = useState('')
  const [filterType, setFilterType]           = useState<'all' | 'recoverable' | 'direct'>('all')
  const [filterSupplier, setFilterSupplier]   = useState('')

  const suppliers = useMemo(() =>
    [...new Map(
      initialInvoices
        .map(i => i.supplier as unknown as Supplier)
        .filter(Boolean)
        .map(s => [s.id, s])
    ).values()],
    [initialInvoices]
  )

  const filtered = useMemo(() => initialInvoices.filter(inv => {
    if (filterType === 'recoverable' && !inv.is_recoverable) return false
    if (filterType === 'direct' && inv.is_recoverable) return false
    if (filterSupplier && inv.supplier_id !== filterSupplier) return false
    if (search) {
      const q = search.toLowerCase()
      const sup = (inv.supplier as unknown as Supplier)?.name ?? ''
      return (
        sup.toLowerCase().includes(q) ||
        (inv.invoice_number ?? '').toLowerCase().includes(q) ||
        (inv.linked_customer_name ?? '').toLowerCase().includes(q) ||
        (inv.payment_reference ?? '').toLowerCase().includes(q)
      )
    }
    return true
  }), [initialInvoices, search, filterType, filterSupplier])

  const summary = useMemo(() => {
    const total         = filtered.reduce((s, i) => s + Number(i.amount), 0)
    const recovered     = filtered.filter(i => i.is_recoverable).reduce((s, i) => s + Number(i.amount), 0)
    const direct        = filtered.filter(i => !i.is_recoverable).reduce((s, i) => s + Number(i.amount), 0)
    const recCount      = filtered.filter(i => i.is_recoverable).length
    const directCount   = filtered.filter(i => !i.is_recoverable).length
    return { total, recovered, direct, recCount, directCount }
  }, [filtered])

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Settled Invoices</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Paid to supplier · customer recovery complete (where applicable)
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Total Settled</p>
          <p className="text-xl font-bold" style={{ color: 'var(--brand)' }}>₹{fmt(summary.total)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div
          className="rounded-2xl border p-4 cursor-pointer transition-all"
          style={{
            background: filterType === 'recoverable' ? 'rgba(34,197,94,0.06)' : 'var(--surface)',
            borderColor: filterType === 'recoverable' ? '#22c55e' : 'var(--border)',
            borderLeftWidth: filterType === 'recoverable' ? 3 : 1,
          }}
          onClick={() => setFilterType(filterType === 'recoverable' ? 'all' : 'recoverable')}
        >
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Recovered</p>
          <p className="text-xl font-bold" style={{ color: '#16a34a' }}>₹{fmt(summary.recovered)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{summary.recCount} recoverable</p>
        </div>
        <div
          className="rounded-2xl border p-4 cursor-pointer transition-all"
          style={{
            background: filterType === 'direct' ? 'rgba(99,102,241,0.06)' : 'var(--surface)',
            borderColor: filterType === 'direct' ? '#6366f1' : 'var(--border)',
            borderLeftWidth: filterType === 'direct' ? 3 : 1,
          }}
          onClick={() => setFilterType(filterType === 'direct' ? 'all' : 'direct')}
        >
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Direct Expense</p>
          <p className="text-xl font-bold" style={{ color: '#4f46e5' }}>₹{fmt(summary.direct)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{summary.directCount} non-recoverable</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Net Cost</p>
          <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>₹{fmt(summary.direct)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>after recovery</p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, invoice #, customer…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
        <select
          value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">All suppliers</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div
          className="py-20 text-center rounded-2xl border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-base font-medium mb-1" style={{ color: 'var(--text)' }}>No settled invoices</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {search || filterType !== 'all' || filterSupplier
              ? 'Try adjusting your filters'
              : 'Invoices appear here once paid (and recovered, if applicable)'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)' }}>
                  {['Supplier', 'Invoice #', 'Date', 'Amount', 'Paid to Supplier', 'Customer', 'Recovered', 'Category'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const sup = inv.supplier as unknown as Supplier
                  return (
                    <tr
                      key={inv.id}
                      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</p>
                        {sup?.supplier_code && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sup.supplier_code}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                        {inv.invoice_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {fmtDate(inv.invoice_date)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold" style={{ color: 'var(--text)' }}>₹{fmt(Number(inv.amount))}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {fmtDate(inv.payment_date)}
                        </span>
                        {inv.payment_reference && (
                          <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                            {inv.payment_reference}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.is_recoverable ? (
                          <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                            {inv.linked_customer_name ?? '—'}
                          </p>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.is_recoverable ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}
                          >
                            <ArrowDownLeft className="w-3 h-3" />
                            {fmtDate(inv.recovered_date)}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5' }}
                          >
                            Direct
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {inv.category ?? '—'}
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
              const sup = inv.supplier as unknown as Supplier
              return (
                <div key={inv.id} className="p-4 space-y-2" style={{ background: 'var(--surface)' }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {inv.invoice_number ?? 'No invoice #'}
                      </p>
                    </div>
                    <p className="text-base font-bold" style={{ color: 'var(--text)' }}>₹{fmt(Number(inv.amount))}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Paid {fmtDate(inv.payment_date)}
                    </span>
                    {inv.is_recoverable ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}
                      >
                        <ArrowDownLeft className="w-3 h-3" /> Recovered {inv.linked_customer_name ? `· ${inv.linked_customer_name}` : ''}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5' }}
                      >
                        Direct expense
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div
            className="px-4 py-2.5 text-xs border-t"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2, var(--surface))' }}
          >
            {filtered.length} of {initialInvoices.length} settled invoice{initialInvoices.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
