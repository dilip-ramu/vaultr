'use client'

/**
 * Restructure · Deploy 2 — batch-first Invoices view.
 *
 * Replaces the earlier tab-bar (Invoices | Recoverables) with a single
 * scoped page:
 *   ─ Header: title + "+ Import" button (opens CSV import modal)
 *   ─ Toggle: "Batches" (default, groups invoices under their source CSV
 *     batch) / "Flat" (renders the existing InvoiceListClient)
 *   ─ Batches view: each ImportBatch is an expandable card; expanding
 *     shows the invoices raised from it plus unbilled allocations
 *
 * "Mark as paid" is available on every invoice row — but its meaning
 * differs by customer:
 *   • Non-reimbursable customer → this IS the final bill; marking paid
 *     settles it directly.
 *   • Reimbursable customer      → the courier invoice is bundled into
 *     the customer's monthly reimbursement invoice. Marking paid still
 *     works but is normally unnecessary — Deploy 3 will auto-cascade
 *     when the parent reimbursement invoice is settled.
 * The row shows a subtle hint next to the button explaining which path.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronDown, ChevronRight, UploadCloud, X, Layers, List, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { RecoverableInvoice, ImportBatch, RecoverableAllocation } from '@/lib/recoverables/types'
import InvoiceListClient from './InvoiceListClient'
import ImportPageClient from '../import/ImportPageClient'
import MarkPaidModal from './MarkPaidModal'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

interface Props {
  invoices: RecoverableInvoice[]
  batches: ImportBatch[]
  pendingAllocations: RecoverableAllocation[]
  /** invoice_id → batch_id (first-batch-wins when an invoice spans many). */
  invoiceBatchMap: Record<string, string>
  /** Customer IDs that are marked reimbursable — used to decide whether
   *  the Mark-as-paid button on an invoice row is the primary CTA or a
   *  secondary "usually not needed" option. */
  reimbursableCustomerIds: string[]
}

function fmtInr(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InvoicesPageClient({
  invoices, batches, pendingAllocations, invoiceBatchMap, reimbursableCustomerIds,
}: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'batches' | 'flat'>('batches')
  const [showImport, setShowImport] = useState(false)
  const [markPaidInv, setMarkPaidInv] = useState<RecoverableInvoice | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  /** Delete a courier tax invoice — /api/recoverables/invoices/[id] handles
   *  unlinking shipments, allocations and cascading. Refreshes the page on
   *  success so the batch card updates. */
  async function handleDelete(inv: RecoverableInvoice) {
    if (!await confirmDialog({
      title:   'Delete this courier invoice?',
      message: `${inv.invoice_number} · ${inv.customer_name}. This cannot be undone. Allocations linked to it will be released so they can be re-billed.`,
      confirmLabel: 'Delete',
    })) return
    setDeletingId(inv.id)
    try {
      const res = await fetch(`/api/recoverables/invoices/${inv.id}`, { method: 'DELETE' })
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

  const reimbursableSet = useMemo(() => new Set(reimbursableCustomerIds), [reimbursableCustomerIds])

  // invoice_id → batch_id map inverted to batch_id → invoices[].
  const invoicesByBatch = useMemo(() => {
    const map: Record<string, RecoverableInvoice[]> = {}
    for (const inv of invoices) {
      const batchId = invoiceBatchMap[inv.id]
      if (!batchId) continue
      if (!map[batchId]) map[batchId] = []
      map[batchId].push(inv)
    }
    return map
  }, [invoices, invoiceBatchMap])

  // Batches with at least one row (invoices raised OR pending allocations).
  const batchesWithActivity = useMemo(() => {
    const pendingByBatch: Record<string, RecoverableAllocation[]> = {}
    for (const a of pendingAllocations) {
      const bid = (a as unknown as { batch_id?: string }).batch_id ?? ''
      if (!bid) continue
      if (!pendingByBatch[bid]) pendingByBatch[bid] = []
      pendingByBatch[bid].push(a)
    }
    return batches
      .map(b => ({ batch: b, invs: invoicesByBatch[b.id] ?? [], pending: pendingByBatch[b.id] ?? [] }))
  }, [batches, invoicesByBatch, pendingAllocations])

  // Invoices with NO batch — usually manually-created tax invoices with no
  // CSV lineage. Shown under "Other invoices" so they aren't hidden.
  const orphanInvoices = invoices.filter(i => !invoiceBatchMap[i.id])

  const handlePaidSaved = () => {
    setMarkPaidInv(null)
    router.refresh()
  }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">

      {/* Header — title + Import button + mode toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Invoices</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Every courier tax invoice you&apos;ve raised, grouped by the CSV batch it came from.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex gap-0.5 p-0.5 rounded-lg"
            style={{ background: 'var(--surface-2)' }}
            role="tablist"
          >
            <button
              onClick={() => setMode('batches')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
              style={mode === 'batches'
                ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }
                : { color: 'var(--text-muted)' }}
            >
              <Layers className="w-3.5 h-3.5" /> Batches
            </button>
            <button
              onClick={() => setMode('flat')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
              style={mode === 'flat'
                ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }
                : { color: 'var(--text-muted)' }}
            >
              <List className="w-3.5 h-3.5" /> Flat
            </button>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--brand)' }}
          >
            <Plus className="w-4 h-4" /> Import
          </button>
        </div>
      </div>

      {/* Flat mode — delegate to existing list client */}
      {mode === 'flat' && (
        <InvoiceListClient invoices={invoices} />
      )}

      {/* Batches mode — grouped view */}
      {mode === 'batches' && (
        <div className="space-y-3">
          {batchesWithActivity.length === 0 && orphanInvoices.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-16 gap-3">
              <UploadCloud className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No batches yet. Click <strong>Import</strong> to upload a courier CSV.
              </p>
            </div>
          )}
          {batchesWithActivity.map(({ batch, invs, pending }) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              invoices={invs}
              pendingAllocations={pending}
              reimbursableSet={reimbursableSet}
              onMarkPaid={setMarkPaidInv}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          ))}
          {orphanInvoices.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Other invoices</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  ({orphanInvoices.length} · not linked to a CSV batch)
                </p>
              </div>
              <div className="space-y-1.5">
                {orphanInvoices.map(inv => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    reimbursableSet={reimbursableSet}
                    onMarkPaid={setMarkPaidInv}
                    onDelete={handleDelete}
                    deleting={deletingId === inv.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div
            className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]"
            style={{ background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Import courier CSV</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  One CSV file becomes one batch. Every allocation is created up-front; you invoice per customer later.
                </p>
              </div>
              <button
                onClick={() => setShowImport(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <ImportPageClient onImported={() => { setShowImport(false); router.refresh() }} />
            </div>
          </div>
        </div>
      )}

      {/* Mark-as-paid modal — reused from the existing list. */}
      {markPaidInv && (
        <MarkPaidModal
          invoice={markPaidInv}
          onClose={() => setMarkPaidInv(null)}
          onSaved={handlePaidSaved}
        />
      )}
    </div>
  )
}

/** One expandable batch card. Header shows the batch's headline; body
 *  reveals the invoices raised from it + any pending allocations still
 *  waiting to be invoiced. */
function BatchCard({
  batch, invoices, pendingAllocations, reimbursableSet, onMarkPaid, onDelete, deletingId,
}: {
  batch: ImportBatch
  invoices: RecoverableInvoice[]
  pendingAllocations: RecoverableAllocation[]
  reimbursableSet: Set<string>
  onMarkPaid: (inv: RecoverableInvoice) => void
  onDelete:   (inv: RecoverableInvoice) => void
  deletingId: string | null
}) {
  const [open, setOpen] = useState(false)
  const invoicedTotal   = invoices.reduce((s, i) => s + Number(i.total ?? 0), 0)
  const pendingTotal    = pendingAllocations.reduce((s, a) => s + Number(a.recoverable_amount ?? 0), 0)
  const invoicesPaid    = invoices.filter(i => i.status === 'paid').length
  const invoicesOpen    = invoices.length - invoicesPaid

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)] transition-colors"
      >
        {open
          ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--brand-light)' }}>
          <UploadCloud className="w-4 h-4" style={{ color: 'var(--brand)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{batch.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {fmtDate(batch.import_date)} · {batch.row_count} shipments
            {batch.reference_count > 0 && ` · ${batch.reference_count} refs`}
            {batch.supplier_count > 0 && ` · ${batch.supplier_count} suppliers`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {fmtInr(invoicedTotal)}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
            {invoices.length > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
                {invoicesOpen > 0 && ` · ${invoicesOpen} open`}
              </span>
            )}
            {pendingTotal > 0 && (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--brand)' }}>
                {fmtInr(pendingTotal)} unbilled
              </span>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          {invoices.length === 0 && pendingAllocations.length === 0 && (
            <p className="text-xs py-3 text-center" style={{ color: 'var(--text-muted)' }}>
              No invoices raised yet from this batch.
            </p>
          )}
          {invoices.map(inv => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              reimbursableSet={reimbursableSet}
              onMarkPaid={onMarkPaid}
              onDelete={onDelete}
              deleting={deletingId === inv.id}
            />
          ))}
          {pendingAllocations.length > 0 && (
            <div className="pt-2 mt-2 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px dashed var(--border)' }}>
              <p className="font-semibold mb-1">Unbilled allocations ({pendingAllocations.length})</p>
              <p>Total: <span className="font-semibold" style={{ color: 'var(--brand)' }}>{fmtInr(pendingTotal)}</span>. Create an invoice from Recoverables → Batches to bill.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One invoice row inside a batch card or under "Other invoices". */
function InvoiceRow({
  invoice, reimbursableSet, onMarkPaid, onDelete, deleting,
}: {
  invoice:  RecoverableInvoice
  reimbursableSet: Set<string>
  onMarkPaid: (inv: RecoverableInvoice) => void
  onDelete:   (inv: RecoverableInvoice) => void
  deleting:   boolean
}) {
  const isReimbursable = !!invoice.customer_id && reimbursableSet.has(invoice.customer_id)
  const isSettleable   = invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.status !== 'draft'
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{invoice.invoice_number}</span>
          <StatusBadge status={invoice.status} />
          {isReimbursable && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(42,122,80,0.12)', color: 'var(--brand)' }}
              title="Customer is reimbursable — this invoice will normally be paid via the monthly reimbursement invoice."
            >
              via reimbursement
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {invoice.customer_name} · {fmtDate(invoice.invoice_date)}
        </p>
      </div>
      <div className="text-right shrink-0 mr-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtInr(Number(invoice.total))}</p>
        {invoice.balance_due > 0 && invoice.status !== 'draft' && (
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fmtInr(Number(invoice.balance_due))} due</p>
        )}
      </div>
      {isSettleable && (
        <button
          onClick={() => onMarkPaid(invoice)}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white shrink-0"
          style={{ background: isReimbursable ? 'var(--surface)' : 'var(--brand)',
                   color:      isReimbursable ? 'var(--text-muted)' : '#fff',
                   border:     isReimbursable ? '1px solid var(--border)' : 'none' }}
          title={isReimbursable
            ? 'Usually not needed — the reimbursement invoice cascade will settle this. Click to settle directly anyway.'
            : 'Mark as paid'}
        >
          Mark paid
        </button>
      )}
      {/* Edit — courier invoices have a full detail/edit page. */}
      <Link
        href={`/recoverables/invoices/${invoice.id}`}
        title="Edit invoice"
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--surface)] shrink-0 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
      </Link>
      {/* Delete — /api/recoverables/invoices/[id] handles unlinking. */}
      <button
        onClick={() => onDelete(invoice)}
        disabled={deleting}
        title="Delete invoice"
        className="w-7 h-7 flex items-center justify-center rounded-lg hover: disabled:opacity-50 shrink-0 transition-colors"
      >
        {deleting
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#dc2626' }} />
          : <Trash2 className="w-3.5 h-3.5 " />}
      </button>
    </div>
  )
}
