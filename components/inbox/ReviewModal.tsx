'use client'

import { useState, useEffect } from 'react'
import { X, Check, Loader2, AlertTriangle } from 'lucide-react'
import type { EmailDocument } from './EmailDocumentsClient'

interface Supplier {
  id: string
  name: string
  payment_terms: string
  custom_terms_days: number | null
}

interface Form {
  supplier_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  amount: string
  currency: string
}

interface Props {
  doc: EmailDocument
  onClose: () => void
  onApproved: (docId: string, invoiceId: string) => void
}

function Field({
  label, children, required,
}: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT = "w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
const INPUT_STYLE = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

function calcDueDate(invoiceDate: string, paymentTerms: string, customTermsDays: number | null): string {
  if (!invoiceDate) return ''
  if (paymentTerms === 'immediate') return invoiceDate
  const days = paymentTerms === 'custom' ? (customTermsDays ?? 30) : parseInt(paymentTerms, 10)
  if (isNaN(days)) return ''
  const d = new Date(invoiceDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function ReviewModal({ doc, onClose, onApproved }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<Form>({
    supplier_id:    '',
    invoice_number: doc.extracted_invoice_number ?? '',
    invoice_date:   doc.extracted_invoice_date   ?? '',
    due_date:       doc.extracted_due_date        ?? '',
    amount:         doc.extracted_amount != null ? String(doc.extracted_amount) : '',
    currency:       'INR',
  })

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // When supplier changes, auto-fill due date from their payment terms
  function handleSupplierChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const supplierId = e.target.value
    const supplier = suppliers.find(s => s.id === supplierId)
    setForm(f => {
      const due = supplier
        ? calcDueDate(f.invoice_date, supplier.payment_terms, supplier.custom_terms_days)
        : f.due_date
      return { ...f, supplier_id: supplierId, due_date: due }
    })
  }

  // If invoice date changes after supplier is selected, recalculate due date
  function handleInvoiceDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value
    setForm(f => {
      const supplier = suppliers.find(s => s.id === f.supplier_id)
      const due = supplier
        ? calcDueDate(newDate, supplier.payment_terms, supplier.custom_terms_days)
        : f.due_date
      return { ...f, invoice_date: newDate, due_date: due }
    })
  }

  useEffect(() => {
    fetch('/api/inbox/suppliers-list')
      .then(r => r.json())
      .then(j => {
        const list: Supplier[] = j.suppliers ?? []
        setSuppliers(list)
        // Auto-select if only one matches extracted name
        if (doc.extracted_supplier_name && list.length > 0) {
          const match = list.find(s =>
            s.name.toLowerCase().includes(doc.extracted_supplier_name!.toLowerCase()) ||
            doc.extracted_supplier_name!.toLowerCase().includes(s.name.toLowerCase())
          )
          if (match) setForm(f => ({ ...f, supplier_id: match.id }))
        }
      })
      .catch(() => {})
  }, [doc.extracted_supplier_name])

  async function handleApprove() {
    if (!form.supplier_id)    { setError('Select a supplier'); return }
    if (!form.invoice_number) { setError('Invoice number is required'); return }
    if (!form.invoice_date)   { setError('Invoice date is required'); return }
    if (!form.amount)         { setError('Amount is required'); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/inbox/documents/${doc.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:    form.supplier_id,
          invoice_number: form.invoice_number.trim(),
          invoice_date:   form.invoice_date,
          due_date:       form.due_date || null,
          amount:         parseFloat(form.amount),
          currency:       'INR',
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to approve'); return }
      onApproved(doc.id, json.invoice_id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Review Invoice</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Check the extracted details against the email, then approve to create the invoice.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface)]"
            style={{ color: 'var(--text-faint)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — two columns */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">

          {/* ── Left: editable extracted data ─────────────────────────────── */}
          <div
            className="md:w-72 shrink-0 flex flex-col gap-4 p-5 overflow-y-auto border-b md:border-b-0 md:border-r"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
              Extracted Data
            </p>

            <Field label="Supplier" required>
              <select value={form.supplier_id} onChange={handleSupplierChange} className={INPUT} style={INPUT_STYLE}>
                <option value="">— select —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {doc.extracted_supplier_name && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  Detected: {doc.extracted_supplier_name}
                </p>
              )}
            </Field>

            <Field label="Invoice Number" required>
              <input
                className={`${INPUT} font-mono`}
                style={INPUT_STYLE}
                value={form.invoice_number}
                onChange={set('invoice_number')}
                placeholder="INV-0001"
              />
            </Field>

            <Field label="Invoice Date" required>
              <input
                type="date"
                className={INPUT}
                style={INPUT_STYLE}
                value={form.invoice_date}
                onChange={handleInvoiceDateChange}
              />
            </Field>

            <Field label="Due Date">
              <input
                type="date"
                className={INPUT}
                style={INPUT_STYLE}
                value={form.due_date}
                onChange={set('due_date')}
              />
              {form.due_date && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  Auto-filled from supplier payment terms
                </p>
              )}
            </Field>

            <Field label="Amount (INR)" required>
              <input
                type="number"
                className={INPUT}
                style={INPUT_STYLE}
                value={form.amount}
                onChange={set('amount')}
                placeholder="0.00"
              />
            </Field>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleApprove}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
              style={{ background: 'var(--brand)' }}
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                : <><Check className="w-4 h-4" /> Approve &amp; Log Invoice</>
              }
            </button>
          </div>

          {/* ── Right: email content ───────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="p-5 flex-1 overflow-y-auto">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>
                Email
              </p>

              {/* Meta row */}
              <div
                className="rounded-xl p-3 mb-4 text-xs space-y-1"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <p>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>From: </span>
                  <span style={{ color: 'var(--text)' }}>
                    {doc.sender_name ? `${doc.sender_name} <${doc.sender_email}>` : doc.sender_email}
                  </span>
                </p>
                {doc.email_subject && (
                  <p>
                    <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Subject: </span>
                    <span style={{ color: 'var(--text)' }}>{doc.email_subject}</span>
                  </p>
                )}
                {doc.received_at && (
                  <p>
                    <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Received: </span>
                    <span style={{ color: 'var(--text)' }}>
                      {new Date(doc.received_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </p>
                )}
                {doc.attachment_name && (
                  <p>
                    <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Attachment: </span>
                    <span style={{ color: 'var(--text)' }}>{doc.attachment_name}</span>
                  </p>
                )}
              </div>

              {/* Body */}
              {doc.email_body ? (
                <pre
                  className="text-sm whitespace-pre-wrap font-sans leading-relaxed"
                  style={{ color: 'var(--text)' }}
                >
                  {doc.email_body}
                </pre>
              ) : (
                <div
                  className="rounded-xl p-4 text-sm text-center"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                >
                  <p className="font-medium mb-1">No message body stored</p>
                  <p className="text-xs">
                    This email was fetched before the HTML extraction fix. Click <strong>Retry</strong> on the document list to re-fetch the body, or fill in the details manually on the left.
                  </p>
                  {doc.attachment_url && (
                    <a
                      href={doc.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-3 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--surface)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}
                    >
                      Open attached PDF instead
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
