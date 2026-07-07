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
  draft:     { bg: 'rgba(107,114,128,0.1)', text: '#6b7280',        label: 'Draft' },
  sent:      { bg: 'rgba(42,122,80,0.1)',   text: 'var(--brand)',   label: 'Sent' },
  overdue:   { bg: 'color-mix(in srgb, var(--expense) 10%, transparent)',   text: 'var(--expense)',        label: 'Overdue' },
  paid:      { bg: 'color-mix(in srgb, var(--income) 10%, transparent)',   text: 'var(--income)',        label: 'Paid' },
  cancelled: { bg: 'rgba(107,114,128,0.1)', text: '#6b7280',        label: 'Cancelled' },
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

  const supplierTotal      = Number(inv.amount)
  const totalBilledShare   = links.reduce((s, l) => s + (l.allocated_amount ?? Number(l.recoverable_invoice?.subtotal ?? 0)), 0)
  const unbilled           = supplierTotal - totalBilledShare

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ backgroundColor: 'var(--surface)', maxHeight: '90dvh' }}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              Customer Invoices
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {sup?.name ?? '—'}
              {inv.invoice_number && <span className="ml-2 font-mono">{inv.invoice_number}</span>}
              {' · '}
              <strong>{fmt(supplierTotal)}</strong>
            </p>
          </div>
          {/* 44px touch target */}
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-xl shrink-0 ml-2"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Content ───────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
          ) : links.length === 0 ? (
            <div className="py-12 px-5 text-center">
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No customer invoices linked</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Links are created from the CSV "Supplier Invoice Refs" column, or manually from the customer invoice detail page.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {links.map(link => {
                const ri = link.recoverable_invoice
                if (!ri) return null
                const st    = STATUS_STYLE[ri.status] ?? STATUS_STYLE.sent
                const share = link.allocated_amount ?? Number(ri.subtotal)
                return (
                  <div key={link.id} className="px-4 py-3.5 space-y-2" style={{ background: 'var(--surface)' }}>
                    {/* Row 1: invoice # + status + remove */}
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={`/recoverables/invoices/${ri.id}`}
                        className="flex items-center gap-1.5 font-mono text-sm font-semibold"
                        style={{ color: 'var(--brand)' }}
                      >
                        {ri.invoice_number}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: st.bg, color: st.text }}
                        >
                          {st.label}
                        </span>
                        <button
                          onClick={() => removeLink(link.id)}
                          disabled={removing === link.id}
                          className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40"
                          style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)' }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Row 2: customer + dates */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-medium" style={{ color: 'var(--text)' }}>{ri.customer_name}</span>
                      <span>{fmtDate(ri.invoice_date)}</span>
                      {ri.paid_at && (
                        <span className="flex items-center gap-0.5" style={{ color: 'var(--income)' }}>
                          <CheckCircle2 className="w-3 h-3" /> Paid {fmtDate(ri.paid_at)}
                        </span>
                      )}
                      {!ri.paid_at && ri.due_date && new Date(ri.due_date) < new Date() && (
                        <span className="flex items-center gap-0.5 ">
                          <Clock className="w-3 h-3" /> Overdue
                        </span>
                      )}
                    </div>
                    {/* Row 3: amounts */}
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--text-muted)' }}>Invoice total</span>
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmt(Number(ri.total))}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--text-muted)' }}>
                        Attributed share{link.allocated_amount === null ? ' (subtotal)' : ''}
                      </span>
                      <span className="font-bold" style={{ color: 'var(--brand)' }}>{fmt(share)}</span>
                    </div>
                    {ri.balance_due > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>Balance due</span>
                        <span className="font-medium ">{fmt(Number(ri.balance_due))}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Tally footer ──────────────────────────────────────────────────── */}
        {links.length > 0 && (
          <div
            className="border-t px-5 py-3 grid grid-cols-3 gap-3 text-center shrink-0"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Supplier Cost</p>
              <p className="text-sm font-bold" style={{ color: 'var(--expense)' }}>{fmt(supplierTotal)}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Billed Out</p>
              <p className="text-sm font-bold" style={{ color: 'var(--brand)' }}>{fmt(totalBilledShare)}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                {unbilled >= 0 ? 'Unbilled' : 'Over-billed'}
              </p>
              <div className="flex items-center justify-center gap-1">
                {unbilled > 0 ? <TrendingDown className="w-3.5 h-3.5 " />
                  : unbilled < 0 ? <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--income)' }} />
                  : <Minus className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                }
                <p className="text-sm font-bold" style={{
                  color: unbilled > 0 ? 'var(--expense)' : unbilled < 0 ? 'var(--income)' : 'var(--text-muted)'
                }}>
                  {fmt(Math.abs(unbilled))}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Close button (mobile bottom) ──────────────────────────────────── */}
        <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
