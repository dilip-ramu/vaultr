'use client'

import { useEffect, useState } from 'react'
import { X, ExternalLink, TrendingUp, TrendingDown, Minus, CheckCircle2, Clock } from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'

interface CustomerLink {
  id: string
  allocated_amount: number | null
  notes: string | null
  created_at: string
  recoverable_invoice: {
    id: string
    invoice_number: string
    customer_name: string
    invoice_date: string
    due_date: string | null
    total: number
    subtotal: number
    status: string
    paid_amount: number
    balance_due: number
    paid_at: string | null
  } | null
}

interface Props {
  inv: SupplierInvoice
  onClose: () => void
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: 'rgba(107,114,128,0.1)', text: '#6b7280', label: 'Draft' },
  sent:     { bg: 'rgba(42,122,80,0.1)',   text: 'var(--brand)', label: 'Sent' },
  overdue:  { bg: 'rgba(239,68,68,0.1)',   text: '#dc2626', label: 'Overdue' },
  paid:     { bg: 'rgba(34,197,94,0.1)',   text: '#16a34a', label: 'Paid' },
  cancelled:{ bg: 'rgba(107,114,128,0.1)', text: '#6b7280', label: 'Cancelled' },
}

export default function SupplierLinksModal({ inv, onClose }: Props) {
  const [links, setLinks]       = useState<CustomerLink[]>([])
  const [loading, setLoading]   = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  const sup = inv.supplier as unknown as Supplier

  useEffect(() => {
    fetch(`/api/invoice-supplier-links?supplier_invoice_id=${inv.id}`)
      .then(r => r.json())
      .then((d: { links?: CustomerLink[] }) => setLinks(d.links ?? []))
      .finally(() => setLoading(false))
  }, [inv.id])

  async function removeLink(linkId: string) {
    setRemoving(linkId)
    await fetch(`/api/invoice-supplier-links/${linkId}`, { method: 'DELETE' })
    setLinks(prev => prev.filter(l => l.id !== linkId))
    setRemoving(null)
  }

  const supplierTotal = Number(inv.amount)

  // Total billed to customers (sum of allocated_amount, or customer invoice totals)
  const totalBilledShare = links.reduce((s, l) => {
    return s + (l.allocated_amount ?? Number(l.recoverable_invoice?.subtotal ?? 0))
  }, 0)

  const unbilled = supplierTotal - totalBilledShare

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ backgroundColor: 'var(--surface)', maxHeight: '90dvh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              Customer Invoices containing this
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {sup?.name ?? '—'}
              {inv.invoice_number && <span className="ml-2 font-mono text-xs">{inv.invoice_number}</span>}
              {' · '}
              <strong>{fmt(supplierTotal)}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg shrink-0 ml-3"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
          ) : links.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No links found</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                This supplier invoice hasn't been linked to any customer invoice yet.
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Links are created automatically from the CSV "Supplier Invoice Refs" column,
                or manually from the customer invoice detail page.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Customer Invoice</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Customer</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Invoice Total</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Attributed</th>
                  <th className="px-3 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {links.map(link => {
                  const ri = link.recoverable_invoice
                  if (!ri) return null
                  const st = STATUS_STYLE[ri.status] ?? STATUS_STYLE.sent
                  const share = link.allocated_amount ?? Number(ri.subtotal)
                  return (
                    <tr key={link.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <a
                          href={`/recoverables/invoices/${ri.id}`}
                          className="flex items-center gap-1 font-mono text-xs font-semibold hover:underline"
                          style={{ color: 'var(--brand)' }}
                        >
                          {ri.invoice_number}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {fmtDate(ri.invoice_date)}
                        </p>
                        <span
                          className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: st.bg, color: st.text }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-xs" style={{ color: 'var(--text)' }}>{ri.customer_name}</p>
                        {ri.paid_at && (
                          <p className="text-xs mt-0.5 flex items-center gap-0.5" style={{ color: '#16a34a' }}>
                            <CheckCircle2 className="w-3 h-3" /> Paid {fmtDate(ri.paid_at)}
                          </p>
                        )}
                        {!ri.paid_at && ri.due_date && new Date(ri.due_date) < new Date() && (
                          <p className="text-xs mt-0.5 flex items-center gap-0.5 text-red-500">
                            <Clock className="w-3 h-3" /> Overdue
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold" style={{ color: 'var(--text)' }}>{fmt(Number(ri.total))}</p>
                        {ri.balance_due > 0 && (
                          <p className="text-xs mt-0.5 text-red-500">
                            Due: {fmt(Number(ri.balance_due))}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold" style={{ color: 'var(--text)' }}>{fmt(share)}</p>
                        {link.allocated_amount === null && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>subtotal</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => removeLink(link.id)}
                          disabled={removing === link.id}
                          className="p-1 rounded hover:bg-red-50 disabled:opacity-40"
                          title="Remove link"
                        >
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Tally footer */}
        {links.length > 0 && (
          <div
            className="border-t px-5 py-4 grid grid-cols-3 gap-4 text-center shrink-0"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Supplier Cost</p>
              <p className="text-sm font-bold" style={{ color: '#dc2626' }}>{fmt(supplierTotal)}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Billed to Customers</p>
              <p className="text-sm font-bold" style={{ color: 'var(--brand)' }}>{fmt(totalBilledShare)}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                {unbilled >= 0 ? 'Unbilled' : 'Over-billed'}
              </p>
              <div className="flex items-center justify-center gap-1">
                {unbilled > 0
                  ? <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                  : unbilled < 0
                    ? <TrendingUp className="w-3.5 h-3.5" style={{ color: '#16a34a' }} />
                    : <Minus className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                }
                <p
                  className="text-sm font-bold"
                  style={{ color: unbilled > 0 ? '#dc2626' : unbilled < 0 ? '#16a34a' : 'var(--text-muted)' }}
                >
                  {fmt(Math.abs(unbilled))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
