'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  History, CheckCircle2, Clock, Download, Trash2,
  FileEdit, X, Check, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react'
import type { ContrastInvoiceData } from './ContrastInvoicePDF'
import { notify } from '@/components/shared/Toast'

const ContrastInvoicePDFDownload = dynamic(() => import('./ContrastInvoicePDFDownload'), { ssr: false })

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
  salary_euro: number | null
  expended_rate: number | null
  amount_inr: number   // stores EUR amount (legacy field name)
  sort_order: number
}

interface Invoice {
  id: string
  invoice_number: string
  invoice_month: string
  invoice_date: string
  status: 'draft' | 'finalized'
  subtotal: number
  gst_amount: number
  total: number
  notes: string | null
  finalized_at: string | null
  created_at: string
  items: InvoiceItem[]
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
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Delete {invoice.invoice_number}?</p>
            <p className="text-sm text-gray-500 mt-1">
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
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50"
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

  const buildPdfData = (): ContrastInvoiceData => ({
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
              inv.status === 'finalized' ? 'bg-green-100' : 'bg-amber-100'
            }`}>
              {inv.status === 'finalized'
                ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                : <Clock className="w-4 h-4 text-amber-600" />
              }
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{inv.invoice_number}</p>
              <p className="text-xs text-gray-500">{monthLabel(inv.invoice_month)}</p>
            </div>
          </div>

          {/* Right: total + status + actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900">{fmtEur(inv.total)}</p>
              <p className="text-xs text-gray-400">incl. GST {fmtEur(inv.gst_amount)}</p>
            </div>

            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              inv.status === 'finalized'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {inv.status === 'finalized' ? 'Finalized' : 'Draft'}
            </span>

            {/* Download */}
            {inv.items.length > 0 && (
              <ContrastInvoicePDFDownload
                data={buildPdfData()}
                label="PDF"
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-medium transition-all"
              />
            )}

            {/* Edit notes */}
            <button
              onClick={() => setEditingNotes(v => !v)}
              title="Edit notes"
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
            >
              <FileEdit className="w-4 h-4" />
            </button>

            {/* Delete */}
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete invoice"
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Expand / collapse line items */}
            {sortedItems.length > 0 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* ── Notes editor ── */}
        {editingNotes && (
          <div className="mt-3 ml-11 space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Add a note to this invoice…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setNotes(inv.notes ?? ''); setEditingNotes(false) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Show saved notes */}
        {!editingNotes && inv.notes && (
          <p className="mt-2 ml-11 text-xs text-gray-500 italic">{inv.notes}</p>
        )}

        {/* ── Line items ── */}
        {sortedItems.length > 0 && (
          <div className="mt-3 ml-11 space-y-1">
            {previewItems.map(item => (
              <div key={item.id} className="flex justify-between text-xs text-gray-500">
                <span className="capitalize">[{item.item_type}] {item.description}</span>
                <span className="font-medium">{fmtEur(item.amount_inr)}</span>
              </div>
            ))}
            {!expanded && sortedItems.length > 4 && (
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-indigo-500 hover:underline"
              >
                +{sortedItems.length - 4} more lines
              </button>
            )}
            <div className="flex justify-between text-xs font-semibold text-gray-700 pt-1.5 border-t border-gray-100 mt-1">
              <span>Sub Total</span>
              <span>{fmtEur(inv.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>GST @ 18%</span>
              <span>{fmtEur(inv.gst_amount)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-gray-900">
              <span>Grand Total</span>
              <span>{fmtEur(inv.total)}</span>
            </div>
          </div>
        )}

        {/* ── Timestamps ── */}
        <div className="mt-2 ml-11 text-xs text-gray-400">
          Created {fmtDate(inv.created_at.split('T')[0])}
          {inv.finalized_at && ` · Finalized ${fmtDate(inv.finalized_at.split('T')[0])}`}
        </div>
      </div>
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ContrastHistoryClient({ invoices: initial }: { invoices: Invoice[] }) {
  const [invoices, setInvoices] = useState<Invoice[]>(initial)

  const handleDelete = (id: string) =>
    setInvoices(prev => prev.filter(inv => inv.id !== id))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <History className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Invoice History</h1>
          <p className="text-sm text-gray-500">All Contrast Company A/S proforma invoices</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-10 text-center">
          <History className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No invoices generated yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {invoices.map(inv => (
              <InvoiceRow key={inv.id} inv={inv} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
