'use client'

import { useState, useMemo } from 'react'
import { Search, CheckCircle2, Clock, AlertTriangle, Layers } from 'lucide-react'
import type { SupplierInvoice, BulkPaymentBatch, Supplier } from '@/lib/suppliers/types'
import { computeInvoiceStatus } from '@/lib/suppliers/types'

interface Props {
  initialInvoices: SupplierInvoice[]
  initialBatches: BulkPaymentBatch[]
  suppliers: { id: string; name: string; supplier_code: string | null }[]
}

type Tab = 'invoices' | 'batches'

function fmtAmt(n: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }

export default function PaymentTrackingClient({ initialInvoices, initialBatches, suppliers }: Props) {
  const [tab, setTab] = useState<Tab>('invoices')
  const [search, setSearch] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterPaid, setFilterPaid] = useState('all')

  const enriched = useMemo(() =>
    initialInvoices.map(i => ({ ...i, status: computeInvoiceStatus(i) })),
    [initialInvoices],
  )

  const filtered = useMemo(() => {
    return enriched.filter(inv => {
      if (filterPaid === 'paid' && !inv.is_paid) return false
      if (filterPaid === 'unpaid' && inv.is_paid) return false
      if (filterSupplier && inv.supplier_id !== filterSupplier) return false
      if (search) {
        const q = search.toLowerCase()
        const sup = inv.supplier as unknown as Supplier
        return (
          (sup?.name ?? '').toLowerCase().includes(q) ||
          (inv.invoice_number ?? '').toLowerCase().includes(q) ||
          (inv.payment_reference ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [enriched, search, filterSupplier, filterPaid])

  const stats = useMemo(() => {
    const paid = enriched.filter(i => i.is_paid)
    const unpaid = enriched.filter(i => !i.is_paid && i.status !== 'cancelled')
    const overdue = enriched.filter(i => i.status === 'overdue')
    return {
      totalPaid: paid.reduce((s, i) => s + Number(i.amount), 0),
      totalUnpaid: unpaid.reduce((s, i) => s + Number(i.amount), 0),
      totalOverdue: overdue.reduce((s, i) => s + Number(i.amount), 0),
      paidCount: paid.length,
      unpaidCount: unpaid.length,
      overdueCount: overdue.length,
    }
  }, [enriched])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Payment Tracking</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Track all supplier payments, overdue invoices, and bulk payment batches.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--income)]" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Paid</span>
          </div>
          <p className="text-xl font-bold" style={{ color: '#16a34a' }}>₹{fmtAmt(stats.totalPaid)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stats.paidCount} invoices</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Outstanding</span>
          </div>
          <p className="text-xl font-bold" style={{ color: 'var(--brand)' }}>₹{fmtAmt(stats.totalUnpaid)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stats.unpaidCount} invoices</p>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: 'var(--surface)', borderColor: stats.overdueCount > 0 ? '#ef4444' : 'var(--border)', borderWidth: stats.overdueCount > 0 ? 2 : 1 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-[var(--expense)]" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Overdue</span>
          </div>
          <p className="text-xl font-bold text-[var(--expense)]">₹{fmtAmt(stats.totalOverdue)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stats.overdueCount} invoices</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--surface-2, var(--surface))', border: '1px solid var(--border)' }}>
        {([['invoices', 'Invoices'], ['batches', 'Payment Batches']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: tab === key ? 'var(--surface)' : 'transparent',
              color: tab === key ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'invoices' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search supplier, invoice #, reference…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
            <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <option value="">All suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={filterPaid} onChange={e => setFilterPaid(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {/* Invoices table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)' }}>
                    {['Supplier', 'Invoice #', 'Amount', 'Invoice Date', 'Due Date', 'Payment Date', 'Reference', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No invoices found</td></tr>
                  ) : filtered.map(inv => {
                    const sup = inv.supplier as unknown as Supplier
                    const isOverdue = inv.status === 'overdue'
                    return (
                      <tr key={inv.id} className="hover:bg-[var(--surface-2)] transition-colors" style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{inv.invoice_number ?? '—'}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(inv.invoice_date)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: isOverdue ? '#dc2626' : 'var(--text-muted)' }}>
                          {inv.due_date ? fmtDate(inv.due_date) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {inv.payment_date ? fmtDate(inv.payment_date) : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                          {inv.payment_reference ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={inv.is_paid
                              ? { backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a' }
                              : isOverdue
                                ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626' }
                                : { backgroundColor: 'rgba(42,122,80,0.08)', color: 'var(--brand)' }
                            }
                          >
                            {inv.is_paid ? 'Paid' : isOverdue ? 'Overdue' : 'Pending'}
                          </span>
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
                const sup = inv.supplier as unknown as Supplier
                return (
                  <div key={inv.id} className="p-4 space-y-1.5" style={{ backgroundColor: 'var(--surface)' }}>
                    <div className="flex justify-between">
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{sup?.name ?? '—'}</p>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {inv.invoice_number && <span className="font-mono">{inv.invoice_number}</span>}
                      <span>{fmtDate(inv.invoice_date)}</span>
                      {inv.payment_date && <span className="text-[var(--income)]">Paid {fmtDate(inv.payment_date)}</span>}
                      {inv.payment_reference && <span className="font-mono">{inv.payment_reference}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'batches' && (
        <div className="space-y-4">
          {initialBatches.length === 0 ? (
            <div className="py-16 text-center rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <Layers className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="font-medium" style={{ color: 'var(--text)' }}>No payment batches yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Use bulk pay to group multiple invoices in a single payment</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)' }}>
                    {['Batch Reference', 'Payment Date', 'Total Amount', 'Invoices', 'Bank Ref', 'Notes'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {initialBatches.map(batch => (
                    <tr key={batch.id} className="hover:bg-[var(--surface-2)] transition-colors" style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 font-medium font-mono text-xs" style={{ color: 'var(--text)' }}>{batch.batch_reference}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(batch.payment_date)}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: '#16a34a' }}>₹{fmtAmt(Number(batch.total_amount))}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{batch.invoice_count} invoices</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{batch.bank_reference ?? '—'}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{batch.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
