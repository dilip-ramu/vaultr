'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  History, CheckCircle2, Clock, Download, Trash2,
  FileEdit, X, Check, ChevronDown, ChevronUp, AlertTriangle,
  DollarSign, ArrowRight, CalendarClock,
} from 'lucide-react'
import type { ReimbursableInvoiceData } from './ReimbursableInvoicePDF'
import { notify } from '@/components/shared/Toast'
import { createClient } from '@/lib/supabase/client'

const ReimbursableInvoicePDFDownload = dynamic(() => import('./ReimbursableInvoicePDFDownload'), { ssr: false })

const MONTHS_LONG = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS_LONG[parseInt(m) - 1]} ${y}`
}

function fmtDate(d: string) {
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function fmtEur(n: number) {
  return `EUR ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface InvoiceItem {
  id: string
  item_type: 'salary' | 'courier' | 'expense'
  description: string
  salary_amount: number | null
  expended_rate: number | null
  amount_inr: number   // stores EUR amount (legacy field name)
  sort_order: number
}

interface Invoice {
  id: string
  invoice_number: string
  invoice_month: string
  invoice_date: string
  // v65: 'paid' added — customer settled the reimbursement invoice and the
  // cascade trigger has flipped the linked courier invoices to paid too.
  status: 'draft' | 'finalized' | 'paid'
  subtotal: number
  gst_amount: number
  total: number
  notes: string | null
  finalized_at: string | null
  created_at: string
  items: InvoiceItem[]
  /** v65: linked payroll month info — set when the invoice's finalize step
   *  auto-created a payroll month. Used to render the "Process payroll" CTA
   *  once the month's status hits 'ready_to_process'. */
  payroll: { id: string; status: string; payroll_month: string } | null
}

// ── Delete confirm modal ───────────────────────────────────────────────────────
function DeleteModal({
  invoice,
  onCancel,
  onConfirm,
  deleting,
}: {
  invoice: Invoice
  onCancel: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--surface)] rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[var(--expense)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--text)]">Delete {invoice.invoice_number}?</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              This will permanently delete the invoice and restore all linked
              expenses, courier charges, and payroll entries to unbilled so they
              can be re-invoiced.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-[var(--text-muted)] bg-[var(--surface-2)] hover:bg-[var(--border)] rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--expense)] hover:bg-[var(--expense)] rounded-xl transition-colors disabled:opacity-50"
          >
            {deleting ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────────
function InvoiceRow({
  inv,
  onDelete,
}: {
  inv: Invoice
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded]   = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes]         = useState(inv.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const router = useRouter()

  const buildPdfData = (): ReimbursableInvoiceData => ({
    invoice_number: inv.invoice_number,
    invoice_month:  inv.invoice_month,
    invoice_date:   inv.invoice_date,
    items: inv.items.sort((a, b) => a.sort_order - b.sort_order),
    subtotal:       inv.subtotal,
    gst_amount:     inv.gst_amount,
    total:          inv.total,
  })

  const saveNotes = async () => {
    setSavingNotes(true)
    await fetch(`/api/contrast/invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes.trim() || null }),
    })
    setSavingNotes(false)
    setEditingNotes(false)
    router.refresh()
  }

  const handleDelete = async () => {
    setDeleting(true)
    const res = await fetch(`/api/contrast/invoices/${inv.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      onDelete(inv.id)
    } else {
      const { error } = await res.json()
      notify(error ?? 'Delete failed')
    }
    setConfirmDelete(false)
  }

  /** Flip status to 'paid'. The DB trigger v65 does the rest:
   *   ─ bundled courier tax invoices become paid (settled via the customer's
   *     reimbursement payment)
   *   ─ the linked payroll month status becomes 'ready_to_process' so the
   *     "Process payroll" CTA lights up. */
  const [markingPaid, setMarkingPaid] = useState(false)
  const handleMarkPaid = async () => {
    setMarkingPaid(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { notify('Session expired'); return }
      const { error } = await supabase
        .from('recoverable_invoices')
        .update({
          status:      'paid',
          paid_amount: inv.total,
          balance_due: 0,
          paid_at:     new Date().toISOString(),
        })
        .eq('id', inv.id)
        .eq('user_id', user.id)
        .eq('invoice_type', 'reimbursement')
      if (error) { notify(error.message); return }
      router.refresh()
    } finally {
      setMarkingPaid(false)
    }
  }

  const sortedItems = inv.items.slice().sort((a, b) => a.sort_order - b.sort_order)
  const previewItems = expanded ? sortedItems : sortedItems.slice(0, 4)

  return (
    <>
      {confirmDelete && (
        <DeleteModal
          invoice={inv}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      <div className="px-5 py-4">
        {/* ── Top row ── */}
        <div className="flex items-start justify-between gap-3">
          {/* Left: icon + number + month */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              inv.status === 'paid'      ? 'bg-[var(--brand-light)]'
              : inv.status === 'finalized' ? 'bg-[var(--brand-light)]'
              : 'bg-[var(--accent-light)]'
            }`}>
              {inv.status === 'paid'
                ? <DollarSign className="w-4 h-4 text-[var(--income)]" />
                : inv.status === 'finalized'
                ? <CheckCircle2 className="w-4 h-4 text-[var(--income)]" />
                : <Clock className="w-4 h-4 text-[var(--amber)]" />
              }
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)] truncate">{inv.invoice_number}</p>
              <p className="text-xs text-[var(--text-muted)]">{monthLabel(inv.invoice_month)}</p>
            </div>
          </div>

          {/* Right: total + status + actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-[var(--text)]">{fmtEur(inv.total)}</p>
              <p className="text-xs text-[var(--text-faint)]">incl. GST {fmtEur(inv.gst_amount)}</p>
            </div>

            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              inv.status === 'paid'      ? 'bg-[var(--brand-light)] text-[var(--income)]'
              : inv.status === 'finalized' ? 'bg-[var(--brand-light)] text-[var(--income)]'
              : 'bg-[var(--accent-light)] text-[var(--amber)]'
            }`}>
              {inv.status === 'paid' ? 'Paid' : inv.status === 'finalized' ? 'Finalized' : 'Draft'}
            </span>

            {/* Mark paid — appears only while finalized. Clicking triggers
                the v65 cascade: courier invoices settled + payroll month
                becomes ready-to-process. */}
            {inv.status === 'finalized' && (
              <button
                onClick={handleMarkPaid}
                disabled={markingPaid}
                title="Mark this reimbursement invoice as paid. Bundled courier invoices settle automatically and payroll unlocks."
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--income)] hover:bg-[var(--income)] text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {markingPaid ? 'Marking…' : 'Mark paid'}
              </button>
            )}

            {/* Download */}
            {inv.items.length > 0 && (
              <ReimbursableInvoicePDFDownload
                data={buildPdfData()}
                label="PDF"
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--brand-light)] hover:bg-[var(--brand-light)] text-[var(--brand)] rounded-xl text-xs font-medium transition-all"
              />
            )}

            {/* Edit notes */}
            <button
              onClick={() => setEditingNotes(v => !v)}
              title="Edit notes"
              className="p-2 text-[var(--text-faint)] hover:text-[var(--brand)] hover:bg-[var(--brand-light)] rounded-xl transition-colors"
            >
              <FileEdit className="w-4 h-4" />
            </button>

            {/* Delete */}
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete invoice"
              className="p-2 text-[var(--text-faint)] hover:text-[var(--expense)] hover:bg-[var(--surface-2)] rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Expand / collapse line items */}
            {sortedItems.length > 0 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-2 text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-xl transition-colors"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Process payroll CTA — appears once the v65 cascade has flipped
            the linked payroll_month to 'ready_to_process' (i.e. this
            reimbursement invoice has been marked paid by the customer). */}
        {inv.payroll?.status === 'ready_to_process' && (
          <a
            href={`/payroll/processing/${inv.payroll.id}`}
            className="mt-3 ml-11 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-[var(--brand-light)] text-[var(--brand)] hover:bg-[var(--brand-light)] border border-[var(--border)] transition-colors max-w-fit"
          >
            <CalendarClock className="w-4 h-4" />
            Process payroll for {monthLabel(inv.payroll.payroll_month)}
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        )}
        {inv.payroll?.status === 'finalized' && (
          <p className="mt-3 ml-11 text-xs" style={{ color: 'var(--text-muted)' }}>
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-[var(--income)]" />
            Payroll for {monthLabel(inv.payroll.payroll_month)} finalized.
          </p>
        )}

        {/* ── Notes editor ── */}
        {editingNotes && (
          <div className="mt-3 ml-11 space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Add a note to this invoice…"
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--border)] focus:border-[var(--brand)] resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand)] text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setNotes(inv.notes ?? ''); setEditingNotes(false) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text-muted)] rounded-lg text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Show saved notes */}
        {!editingNotes && inv.notes && (
          <p className="mt-2 ml-11 text-xs text-[var(--text-muted)] italic">{inv.notes}</p>
        )}

        {/* ── Line items ── */}
        {sortedItems.length > 0 && (
          <div className="mt-3 ml-11 space-y-1">
            {previewItems.map(item => (
              <div key={item.id} className="flex justify-between text-xs text-[var(--text-muted)]">
                <span className="capitalize">[{item.item_type}] {item.description}</span>
                <span className="font-medium">{fmtEur(item.amount_inr)}</span>
              </div>
            ))}
            {!expanded && sortedItems.length > 4 && (
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-[var(--brand)] hover:underline"
              >
                +{sortedItems.length - 4} more lines
              </button>
            )}
            <div className="flex justify-between text-xs font-semibold text-[var(--text)] pt-1.5 border-t border-[var(--border)] mt-1">
              <span>Sub Total</span>
              <span>{fmtEur(inv.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>GST @ 18%</span>
              <span>{fmtEur(inv.gst_amount)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-[var(--text)]">
              <span>Grand Total</span>
              <span>{fmtEur(inv.total)}</span>
            </div>
          </div>
        )}

        {/* ── Timestamps ── */}
        <div className="mt-2 ml-11 text-xs text-[var(--text-faint)]">
          Created {fmtDate(inv.created_at.split('T')[0])}
          {inv.finalized_at && ` · Finalized ${fmtDate(inv.finalized_at.split('T')[0])}`}
        </div>
      </div>
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ReimbursableHistoryClient({ invoices: initial }: { invoices: Invoice[] }) {
  const [invoices, setInvoices] = useState<Invoice[]>(initial)

  const handleDelete = (id: string) =>
    setInvoices(prev => prev.filter(inv => inv.id !== id))

  return (
    <div className="p-4 md:p-6 w-full space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center">
          <History className="w-5 h-5 text-[var(--text-muted)]" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Invoice History</h1>
          <p className="text-sm text-[var(--text-muted)]">All reimbursement invoices you&apos;ve raised</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-10 text-center">
          <History className="w-8 h-8 mx-auto mb-3 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-faint)]">No invoices generated yet</p>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-[var(--border-2)]">
            {invoices.map(inv => (
              <InvoiceRow key={inv.id} inv={inv} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
