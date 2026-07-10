'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Search, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { RecoverableInvoice, RecoverableInvoiceLine, InvoiceStatus } from '@/lib/recoverables/types'
import type { Customer } from '@/lib/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'
import MarkPaidModal from './MarkPaidModal'
import { downloadPrintRouteAsPdf } from '@/lib/pdf/downloadElementPdf'

interface SellerInfo {
  company_name: string | null
  company_address: string | null
  company_gstin: string | null
  company_phone: string | null
  company_email: string | null
}

// Exported so the page server component can type-check the fetched data
export interface SupplierLink {
  id: string
  allocated_amount: number | null
  notes: string | null
  created_at: string
  supplier_invoice: {
    id: string
    invoice_number: string | null
    invoice_date: string
    amount: number
    currency: string
    is_paid: boolean
    status: string
    recoverable_status: string | null
    category: string | null
    supplier: { id: string; name: string; supplier_code: string | null } | null
  } | null
}

interface SupplierSearchResult {
  id: string
  invoice_number: string | null
  invoice_date: string
  amount: number
  supplier: { name: string } | null
  payee_name?: string | null
}

interface Props {
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  customer: Customer | null
  sellerInfo: SellerInfo | null
  initialSupplierLinks: SupplierLink[]
}

function fmt(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function resolveStatus(inv: RecoverableInvoice): InvoiceStatus {
  if (inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date()) {
    return 'overdue'
  }
  return inv.status
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm text-right" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

export default function InvoiceDetailClient({ invoice: initialInvoice, lines, customer, sellerInfo, initialSupplierLinks }: Props) {
  const router = useRouter()
  const [invoice, setInvoice] = useState(initialInvoice)
  const [busy, setBusy] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)

  // Rate shown in the GST total labels only when every line shares one rate;
  // mixed-rate invoices drop it (per-line rates render in the items table).
  const uniformCgst = lines.length > 0 && lines.every(l => l.cgst_rate === lines[0].cgst_rate)
  const uniformSgst = lines.length > 0 && lines.every(l => l.sgst_rate === lines[0].sgst_rate)

  // Supplier links state
  const [supplierLinks, setSupplierLinks]         = useState<SupplierLink[]>(initialSupplierLinks)
  const [showLinkSearch, setShowLinkSearch]       = useState(false)
  const [linkSearch, setLinkSearch]               = useState('')
  const [allSupplierInvoices, setAllSupplierInvoices] = useState<SupplierSearchResult[]>([])
  const [loadingAll, setLoadingAll]               = useState(false)
  const [linkingId, setLinkingId]                 = useState<string | null>(null)

  // Supplier cost tally
  const supplierCostTotal = supplierLinks.reduce((s, l) => {
    const share = l.allocated_amount ?? Number(l.supplier_invoice?.amount ?? 0)
    return s + share
  }, 0)
  const customerBilled = invoice.subtotal  // pre-tax subtotal for fair comparison
  const margin = customerBilled - supplierCostTotal
  const marginPct = supplierCostTotal > 0 ? (margin / supplierCostTotal) * 100 : null

  // Load all supplier invoices once when the search panel opens, then filter client-side
  // This gives instant partial matching on any substring (incl. last 4 chars of invoice #)
  async function openLinkSearch() {
    setShowLinkSearch(true)
    if (allSupplierInvoices.length > 0) return   // already loaded
    setLoadingAll(true)
    try {
      const res = await fetch('/api/supplier-invoices')
      if (res.ok) {
        const data = await res.json() as { invoices?: SupplierSearchResult[] }
        setAllSupplierInvoices(data.invoices ?? [])
      }
    } finally {
      setLoadingAll(false)
    }
  }

  // Client-side filter: match query against invoice_number, supplier name, payee_name, amount
  const searchResults = (() => {
    const q = linkSearch.trim().toLowerCase()
    if (!q) return allSupplierInvoices.slice(0, 20)
    return allSupplierInvoices.filter(si => {
      const name = (si.supplier?.name ?? si.payee_name ?? '').toLowerCase()
      const num  = (si.invoice_number ?? '').toLowerCase()
      const amt  = String(si.amount)
      return name.includes(q) || num.includes(q) || amt.includes(q)
    }).slice(0, 20)
  })()

  async function addLink(si: SupplierSearchResult) {
    setLinkingId(si.id)
    try {
      const res = await fetch('/api/invoice-supplier-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoverable_invoice_id: invoice.id,
          supplier_invoice_id: si.id,
        }),
      })
      if (res.ok) {
        // Refresh links list
        const lRes = await fetch(`/api/invoice-supplier-links?recoverable_invoice_id=${invoice.id}`)
        if (lRes.ok) {
          const lData = await lRes.json() as { links: SupplierLink[] }
          setSupplierLinks(lData.links)
        }
        setShowLinkSearch(false)
        setLinkSearch('')
      }
    } finally {
      setLinkingId(null)
    }
  }

  async function removeLink(linkId: string) {
    await fetch(`/api/invoice-supplier-links/${linkId}`, { method: 'DELETE' })
    setSupplierLinks(prev => prev.filter(l => l.id !== linkId))
  }

  const resolvedStatus = resolveStatus(invoice)
  const canMarkPaid   = resolvedStatus === 'sent' || resolvedStatus === 'overdue' || resolvedStatus === 'draft'
  const canRevert     = resolvedStatus === 'paid'
  const canDelete     = resolvedStatus !== 'paid'

  async function handleRevert() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/recoverables/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revert: true }),
      })
      const data = await res.json() as { invoice?: RecoverableInvoice; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to revert')
      if (data.invoice) setInvoice(data.invoice)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  function handlePaidSaved(updated: RecoverableInvoice) {
    setInvoice(updated)
    setShowPayModal(false)
  }

  async function deleteInvoice() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/recoverables/invoices/${invoice.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        throw new Error(j.error ?? 'Failed to delete')
      }
      router.push('/recoverables/invoices')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="w-full px-4 md:px-8 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            ← Back
          </button>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              {invoice.invoice_number}
            </h1>
            <StatusBadge status={resolvedStatus} />
          </div>
        </div>

        {/* Action buttons */}
        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: '#fee2e2', color: '#b91c1c' }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {canMarkPaid && (
            <button
              onClick={() => setShowPayModal(true)}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--income, var(--income))', color: '#fff' }}
            >
              ✓ Record Payment
            </button>
          )}
          {canRevert && (
            <button
              onClick={handleRevert}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)', border: '1px solid color-mix(in srgb, var(--expense) 25%, transparent)' }}
            >
              {busy ? 'Reverting…' : '↩ Mark as Unpaid'}
            </button>
          )}
          {(invoice as { invoice_type?: string }).invoice_type === 'tax_invoice' && canDelete && (
            <button
              onClick={() => router.push(`/recoverables/invoices/${invoice.id}/edit`)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              Edit
            </button>
          )}
          <button
            onClick={async () => {
              setDownloading(true)
              try {
                await downloadPrintRouteAsPdf(
                  `/recoverables/invoices/${invoice.id}/print`,
                  `${invoice.invoice_number || 'Invoice'}.pdf`,
                )
              } catch (e) {
                setError('Could not build the PDF (' + (e as Error).message + '). Try again in a moment.')
              } finally {
                setDownloading(false)
              }
            }}
            disabled={downloading}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
            style={{ background: 'var(--accent, #2A7A50)', color: '#fff' }}
          >
            {downloading ? 'Preparing PDF…' : '⭳ Download PDF'}
          </button>
          {canDelete && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#fee2e2', color: '#b91c1c' }}
            >
              Delete
            </button>
          )}
          {showDeleteConfirm && (
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Delete invoice?</span>
              <button
                onClick={deleteInvoice}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: '#b91c1c', color: '#fff' }}
              >
                {busy ? '…' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Summary card */}
        <div
          className="rounded-xl p-4 mb-5"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Bill To
              </p>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{invoice.customer_name}</p>
              {invoice.customer_address && (
                <p className="text-sm whitespace-pre-wrap mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {invoice.customer_address}
                </p>
              )}
              {invoice.customer_gstin && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  GSTIN: {invoice.customer_gstin}
                </p>
              )}
              {invoice.customer_state && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  State: {invoice.customer_state}
                </p>
              )}
            </div>
            <div>
              {sellerInfo?.company_name && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                    From
                  </p>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>{sellerInfo.company_name}</p>
                  {sellerInfo.company_address && (
                    <p className="text-sm whitespace-pre-wrap mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {sellerInfo.company_address}
                    </p>
                  )}
                  {sellerInfo.company_gstin && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      GSTIN: {sellerInfo.company_gstin}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Row label="Invoice Date"    value={fmtDate(invoice.invoice_date)} />
            <Row label="Due Date"        value={fmtDate(invoice.due_date)} />
            {invoice.payment_terms && (
              <Row label="Payment Terms" value={invoice.payment_terms.replace('_', ' ').toUpperCase()} />
            )}
            {invoice.paid_at && (
              <Row label="Paid On" value={fmtDate(invoice.paid_at)} />
            )}
          </div>
        </div>

        {/* Line items */}
        <div
          className="rounded-xl overflow-hidden overflow-x-auto mb-5"
          style={{ border: '1px solid var(--border)' }}
        >
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <th className="text-left px-4 py-2.5 font-medium">#</th>
                <th className="text-left px-4 py-2.5 font-medium">AWB</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">HSN</th>
                <th className="text-right px-4 py-2.5 font-medium">Pcs</th>
                <th className="text-right px-4 py-2.5 font-medium">Rate</th>
                <th className="text-right px-4 py-2.5 font-medium">GST</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr
                  key={line.id}
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{line.line_number}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{line.awb}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{fmtDate(line.shipment_date)}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{line.hsn_sac ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">{line.qty}</td>
                  <td className="px-4 py-2.5 text-right">
                    {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(line.rate)}
                  </td>
                  <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                    {Number(line.cgst_rate) + Number(line.sgst_rate)}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmt(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* GST totals */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <Row label="Subtotal"                                          value={fmt(invoice.subtotal)} />
          <Row label={uniformCgst ? `CGST @ ${lines[0].cgst_rate}%` : 'CGST'} value={fmt(invoice.cgst_amount)} />
          <Row label={uniformSgst ? `SGST @ ${lines[0].sgst_rate}%` : 'SGST'} value={fmt(invoice.sgst_amount)} />
          <div className="flex justify-between gap-4 pt-2 mt-1">
            <span className="font-bold" style={{ color: 'var(--text)' }}>Total</span>
            <span className="font-bold text-lg" style={{ color: 'var(--text)' }}>{fmt(invoice.total)}</span>
          </div>
          {invoice.paid_amount > 0 && (
            <>
              <Row
                label="Amount Paid"
                value={<span style={{ color: 'var(--income, var(--income))' }}>{fmt(invoice.paid_amount)}</span>}
              />
              <div className="flex justify-between gap-4 pt-1">
                <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Balance Due</span>
                <span className="font-semibold text-sm" style={{ color: invoice.balance_due > 0 ? '#b91c1c' : 'var(--text-muted)' }}>
                  {fmt(invoice.balance_due)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{invoice.notes}</p>
          </div>
        )}

        {/* ── Supplier Costs panel ─────────────────────────────────────────── */}
        <div className="mt-6 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Supplier Costs
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Linked supplier invoices billed in this customer invoice
              </p>
            </div>
            <button
              onClick={() => showLinkSearch ? setShowLinkSearch(false) : openLinkSearch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(42,122,80,0.1)', color: 'var(--brand)', border: '1px solid rgba(42,122,80,0.2)' }}
            >
              <Plus className="w-3.5 h-3.5" /> Link Invoice
            </button>
          </div>

          {/* Search to add link */}
          {showLinkSearch && (
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <input
                  autoFocus
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Search supplier name or invoice #…"
                  className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
              {loadingAll && (
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Loading invoices…</p>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  {searchResults.map(si => {
                    const alreadyLinked = supplierLinks.some(l => l.supplier_invoice?.id === si.id)
                    return (
                      <button
                        key={si.id}
                        disabled={alreadyLinked || linkingId === si.id}
                        onClick={() => addLink(si)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm border-b last:border-b-0 disabled:opacity-50"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                      >
                        <div>
                          <span className="font-medium">{si.supplier?.name ?? si.payee_name ?? '—'}</span>
                          {si.invoice_number && (
                            <span className="ml-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                              {si.invoice_number}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <span className="font-semibold">₹{Number(si.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                          {alreadyLinked && <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>linked</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Linked invoices */}
          {supplierLinks.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No supplier invoices linked yet.{' '}
                {showLinkSearch ? 'Search above to add one.' : 'Click "Link Invoice" to add.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Supplier</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Invoice #</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Total</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Share</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLinks.map(link => {
                      const si = link.supplier_invoice
                      if (!si) return null
                      const share = link.allocated_amount ?? Number(si.amount)
                      return (
                        <tr key={link.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium" style={{ color: 'var(--text)' }}>{si.supplier?.name ?? '—'}</p>
                            {si.category && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{si.category}</p>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{si.invoice_number ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-medium" style={{ color: 'var(--text)' }}>
                            ₹{Number(si.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--text)' }}>
                            ₹{share.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            {link.allocated_amount === null && <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>(full)</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => removeLink(link.id)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)' }}>
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
                {supplierLinks.map(link => {
                  const si = link.supplier_invoice
                  if (!si) return null
                  const share = link.allocated_amount ?? Number(si.amount)
                  return (
                    <div key={link.id} className="px-4 py-3.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{si.supplier?.name ?? '—'}</p>
                        {si.invoice_number && <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{si.invoice_number}</p>}
                        <div className="flex gap-4 mt-1 text-xs">
                          <span style={{ color: 'var(--text-muted)' }}>Total: <strong style={{ color: 'var(--text)' }}>₹{Number(si.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                          <span style={{ color: 'var(--text-muted)' }}>Share: <strong style={{ color: 'var(--brand)' }}>₹{share.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                        </div>
                      </div>
                      <button onClick={() => removeLink(link.id)} className="w-9 h-9 flex items-center justify-center rounded-lg shrink-0" style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)' }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Tally footer */}
          {supplierLinks.length > 0 && (
            <div
              className="px-4 py-3 border-t grid grid-cols-3 gap-4 text-center"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Supplier Cost</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--expense)' }}>
                  ₹{supplierCostTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Billed (subtotal)</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--brand)' }}>
                  ₹{customerBilled.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Margin</p>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  {margin > 0
                    ? <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--income)' }} />
                    : margin < 0
                      ? <TrendingDown className="w-3.5 h-3.5 " />
                      : <Minus className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  }
                  <p
                    className="text-sm font-bold"
                    style={{ color: margin > 0 ? 'var(--income)' : margin < 0 ? 'var(--expense)' : 'var(--text-muted)' }}
                  >
                    ₹{Math.abs(margin).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    {marginPct !== null && (
                      <span className="text-xs font-normal ml-1">({marginPct.toFixed(1)}%)</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPayModal && (
        <MarkPaidModal
          invoice={invoice}
          onClose={() => setShowPayModal(false)}
          onSaved={handlePaidSaved}
        />
      )}
    </div>
  )
}
