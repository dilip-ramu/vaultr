'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Upload, FileText, Trash2 } from 'lucide-react'
import type { SupplierInvoice, Supplier, PaymentTerms } from '@/lib/suppliers/types'
import { INVOICE_CATEGORIES, PAYMENT_TERMS_OPTIONS, calcDueDateFromTerms } from '@/lib/suppliers/types'

interface Props {
  invoice: SupplierInvoice | null
  suppliers: Pick<Supplier, 'id' | 'name' | 'supplier_code' | 'payment_terms' | 'custom_terms_days' | 'currency'>[]
  onSaved: (inv: SupplierInvoice) => void
  onClose: () => void
}

const EMPTY = {
  supplier_id: '',
  invoice_number: '',
  invoice_date: new Date().toISOString().split('T')[0],
  due_date: '',
  amount: '',
  currency: 'INR',
  category: '',
  notes: '',
  is_recoverable: true,
  linked_customer_name: '',
  recoverable_status: 'pending_billing',
  is_paid: false,
  payment_date: '',
  payment_reference: '',
  attachment_path: null as string | null,
  attachment_name: null as string | null,
  attachment_size: null as number | null,
}

const RECOVERABLE_STATUS_OPTIONS = [
  { value: 'pending_billing',  label: 'Pending Billing' },
  { value: 'billed',           label: 'Billed' },
  { value: 'recovered',        label: 'Recovered' },
  { value: 'partial_recovery', label: 'Partial Recovery' },
  { value: 'written_off',      label: 'Written Off' },
]

export default function SupplierInvoiceForm({ invoice, suppliers, onSaved, onClose }: Props) {
  const [form, setForm] = useState(() => invoice ? {
    ...EMPTY,
    supplier_id: invoice.supplier_id,
    invoice_number: invoice.invoice_number ?? '',
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date ?? '',
    amount: String(invoice.amount),
    currency: invoice.currency,
    category: invoice.category ?? '',
    notes: invoice.notes ?? '',
    is_recoverable: invoice.is_recoverable,
    linked_customer_name: invoice.linked_customer_name ?? '',
    recoverable_status: invoice.recoverable_status ?? 'pending_billing',
    is_paid: invoice.is_paid,
    payment_date: invoice.payment_date ?? '',
    payment_reference: invoice.payment_reference ?? '',
    attachment_path: invoice.attachment_path,
    attachment_name: invoice.attachment_name,
    attachment_size: invoice.attachment_size,
  } : { ...EMPTY })

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof typeof EMPTY>(k: K, v: typeof EMPTY[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Auto-fill due date when supplier selected
  function handleSupplierChange(supplierId: string) {
    set('supplier_id', supplierId)
    const sup = suppliers.find(s => s.id === supplierId)
    if (sup && form.invoice_date) {
      const due = calcDueDateFromTerms(form.invoice_date, sup.payment_terms as PaymentTerms, sup.custom_terms_days)
      if (due) set('due_date', due)
    }
    if (sup) set('currency', sup.currency)
  }

  // Recalculate due date when invoice date changes
  function handleInvoiceDateChange(date: string) {
    set('invoice_date', date)
    if (form.supplier_id) {
      const sup = suppliers.find(s => s.id === form.supplier_id)
      if (sup && date) {
        const due = calcDueDateFromTerms(date, sup.payment_terms as PaymentTerms, sup.custom_terms_days)
        if (due) set('due_date', due)
      }
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/supplier-invoices/attachment', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        set('attachment_path', data.path)
        set('attachment_name', data.name)
        set('attachment_size', data.size)
      } else {
        setError(data.error ?? 'Upload failed')
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveAttachment() {
    if (!form.attachment_path) return
    await fetch('/api/supplier-invoices/attachment', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: form.attachment_path }),
    })
    set('attachment_path', null)
    set('attachment_name', null)
    set('attachment_size', null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_id) { setError('Please select a supplier'); return }
    if (!form.invoice_date) { setError('Invoice date is required'); return }
    if (!form.amount || isNaN(Number(form.amount))) { setError('Valid amount is required'); return }

    setSaving(true); setError('')
    try {
      const payload = {
        supplier_id: form.supplier_id,
        invoice_number: form.invoice_number || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        amount: Number(form.amount),
        currency: form.currency,
        category: form.category || null,
        notes: form.notes || null,
        is_recoverable: form.is_recoverable,
        linked_customer_name: form.is_recoverable ? (form.linked_customer_name || null) : null,
        recoverable_status: form.is_recoverable ? form.recoverable_status : null,
        is_paid: form.is_paid,
        payment_date: form.is_paid ? (form.payment_date || null) : null,
        payment_reference: form.is_paid ? (form.payment_reference || null) : null,
        attachment_path: form.attachment_path,
        attachment_name: form.attachment_name,
        attachment_size: form.attachment_size,
      }

      const url = invoice ? `/api/supplier-invoices/${invoice.id}` : '/api/supplier-invoices'
      const method = invoice ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      onSaved(data.invoice)
    } finally {
      setSaving(false)
    }
  }

  const fmtFileSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {invoice ? 'Edit Invoice' : 'New Supplier Invoice'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">{error}</div>}

          {/* Supplier + Invoice # */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Supplier *" className="col-span-2 md:col-span-1">
              <select
                value={form.supplier_id}
                onChange={e => handleSupplierChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.supplier_code ? ` (${s.supplier_code})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Invoice Number">
              <Input value={form.invoice_number} onChange={v => set('invoice_number', v)} placeholder="INV-2024-001" />
            </Field>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Invoice Date *">
              <Input type="date" value={form.invoice_date} onChange={handleInvoiceDateChange} />
            </Field>
            <Field label="Due Date">
              <Input type="date" value={form.due_date} onChange={v => set('due_date', v)} />
            </Field>
          </div>

          {/* Amount + Currency + Category */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Amount *" className="col-span-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₹</span>
                <input
                  type="number"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
            </Field>
            <Field label="Currency">
              <select
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                {['INR','USD','EUR','GBP','AED'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Category">
            <select
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <option value="">Select category…</option>
              {INVOICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Add any notes…"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Field>

          {/* Attachment */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Attachment</label>
            {form.attachment_path ? (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2, var(--bg))' }}>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{form.attachment_name ?? 'Attachment'}</p>
                    {form.attachment_size && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtFileSize(form.attachment_size)}</p>}
                  </div>
                </div>
                <button type="button" onClick={handleRemoveAttachment} className="p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 rounded-xl border-2 border-dashed text-sm flex items-center justify-center gap-2 transition-colors hover:border-[var(--brand)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Upload PDF, image, or document'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </div>

          {/* Recoverable Toggle */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2, var(--bg))' }}>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Recoverable from Customer?</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Mark this expense as billable back to a customer</p>
              </div>
              <div
                onClick={() => set('is_recoverable', !form.is_recoverable)}
                className="relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0"
                style={{ backgroundColor: form.is_recoverable ? 'var(--brand)' : 'var(--border)' }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: form.is_recoverable ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </div>
            </label>
            {form.is_recoverable && (
              <div className="space-y-3 pt-1">
                <Field label="Customer / Buyer">
                  <Input
                    value={form.linked_customer_name}
                    onChange={v => set('linked_customer_name', v)}
                    placeholder="e.g. H&M, Zara, Next…"
                  />
                </Field>
                <Field label="Recovery Status">
                  <select
                    value={form.recoverable_status}
                    onChange={e => set('recoverable_status', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    {RECOVERABLE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>

          {/* Payment */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2, var(--bg))' }}>
            <label className="flex items-center justify-between cursor-pointer">
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Mark as Paid</p>
              <div
                onClick={() => set('is_paid', !form.is_paid)}
                className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                style={{ backgroundColor: form.is_paid ? '#16a34a' : 'var(--border)' }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: form.is_paid ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </div>
            </label>
            {form.is_paid && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field label="Payment Date">
                  <Input type="date" value={form.payment_date} onChange={v => set('payment_date', v)} />
                </Field>
                <Field label="Payment Reference">
                  <Input value={form.payment_reference} onChange={v => set('payment_reference', v)} placeholder="Ref / UTR number" />
                </Field>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || uploading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--brand)' }}>
              {saving ? 'Saving…' : invoice ? 'Save Changes' : 'Add Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
    />
  )
}
