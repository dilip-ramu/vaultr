'use client'

import { useState, useEffect } from 'react'
import { X, Check, Loader2, AlertTriangle, Paperclip, Mail, Sparkles } from 'lucide-react'
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

  // 20c field styling.
  const boxCls = 'w-full mt-[6px] rounded-[10px] px-3 py-[10px] text-[13px] outline-none'
  const boxStyle: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'none' }
  const boxStyleBrand: React.CSSProperties = { ...boxStyle, border: '1.5px solid var(--brand)' }
  const lblCls = 'text-[10.5px] font-extrabold tracking-[.06em]'
  const lblStyle: React.CSSProperties = { color: 'var(--text-muted)' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-[20px] overflow-hidden flex"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', height: 'min(560px, 92vh)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: the email exactly, attachment as a clickable paperclip ── */}
        <div className="hidden md:flex w-[360px] shrink-0 flex-col p-5 overflow-y-auto" style={{ background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}>
          {/* Email meta */}
          <div className="space-y-1 text-[12px]">
            <p><span className="font-semibold" style={{ color: 'var(--text-muted)' }}>From: </span><span style={{ color: 'var(--text)' }}>{doc.sender_name ? `${doc.sender_name} <${doc.sender_email}>` : doc.sender_email}</span></p>
            {doc.email_subject && <p><span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Subject: </span><span style={{ color: 'var(--text)' }}>{doc.email_subject}</span></p>}
            {doc.received_at && <p><span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Received: </span><span style={{ color: 'var(--text)' }}>{new Date(doc.received_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>}
          </div>

          {/* Attachment — paperclip chip, opens on click */}
          {doc.attachment_url && (
            <a
              href={doc.attachment_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 mt-3 rounded-[10px] px-3 py-2 transition-colors hover:brightness-[0.98]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <Paperclip className="w-[14px] h-[14px] shrink-0" style={{ color: 'var(--brand)' }} />
              <span className="flex-1 text-[12px] font-medium truncate" style={{ color: 'var(--text)' }}>{doc.attachment_name ?? 'Open attachment'}</span>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--brand)' }}>Open</span>
            </a>
          )}

          {/* Email body */}
          <div className="mt-4 pt-4 flex-1" style={{ borderTop: '1px solid var(--border)' }}>
            {doc.email_body
              ? <pre className="text-[12.5px] whitespace-pre-wrap font-sans leading-relaxed" style={{ color: 'var(--text)' }}>{doc.email_body}</pre>
              : <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No email body stored{doc.attachment_url ? ' — open the attachment above.' : '.'}</p>}
          </div>
        </div>

        {/* ── Right: fields to confirm ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-[22px] py-[18px]" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-[9px]">
              <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}><Mail className="w-4 h-4" /></div>
              <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Confirm supplier invoice</p>
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 px-[22px] py-5 flex flex-col gap-[14px] overflow-y-auto">
            {doc.extracted_supplier_name && (
              <div className="flex items-center gap-2 rounded-[10px] px-[13px] py-[9px]" style={{ background: 'color-mix(in srgb, var(--income) 10%, transparent)' }}>
                <Sparkles className="w-[14px] h-[14px] shrink-0" style={{ color: 'var(--income)' }} />
                <span className="text-[12px]" style={{ color: 'var(--text)' }}>Auto-extracted — detected supplier <b>{doc.extracted_supplier_name}</b></span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lblCls} style={lblStyle}>SUPPLIER *</label>
                <select value={form.supplier_id} onChange={handleSupplierChange} className={boxCls} style={boxStyle}>
                  <option value="">— select —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lblCls} style={lblStyle}>INVOICE #</label>
                <input className={boxCls} style={boxStyle} value={form.invoice_number} onChange={set('invoice_number')} placeholder="INV-0001" />
              </div>
              <div>
                <label className={lblCls} style={lblStyle}>INVOICE DATE</label>
                <input type="date" className={boxCls} style={boxStyle} value={form.invoice_date} onChange={handleInvoiceDateChange} />
              </div>
              <div>
                <label className={lblCls} style={lblStyle}>DUE DATE</label>
                <input type="date" className={boxCls} style={boxStyle} value={form.due_date} onChange={set('due_date')} />
              </div>
            </div>

            <div>
              <label className={lblCls} style={lblStyle}>AMOUNT (INR)</label>
              <input type="number" className={`${boxCls} !text-[16px] font-extrabold`} style={boxStyleBrand} value={form.amount} onChange={set('amount')} placeholder="0.00" />
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)' }}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--expense)' }} />
                <p className="text-xs" style={{ color: 'var(--expense)' }}>{error}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-[22px] py-[14px]" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <button onClick={onClose} className="rounded-[10px] px-[15px] py-[9px] text-[12.5px] font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Reject</button>
            <button onClick={handleApprove} disabled={saving} className="inline-flex items-center gap-[6px] rounded-[10px] px-4 py-[9px] text-[12.5px] font-bold text-white disabled:opacity-60" style={{ background: 'var(--brand)' }}>
              {saving ? <Loader2 className="w-[14px] h-[14px] animate-spin" /> : <Check className="w-[14px] h-[14px]" />}
              {saving ? 'Creating…' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

