'use client'

import { useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'
import AccountChipPicker, { type PickerAccount } from '@/components/shared/AccountChipPicker'
import { createClient } from '@/lib/supabase/client'

interface Props {
  invoiceIds: string[]
  invoices: SupplierInvoice[]
  accounts: PickerAccount[]
  onDone: () => void
  onClose: () => void
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

export default function BulkPayModal({ invoiceIds, invoices, accounts, onDone, onClose }: Props) {
  const [accountId, setAccountId]           = useState('')
  const [paymentDate, setPaymentDate]       = useState(new Date().toISOString().split('T')[0])
  const [paymentReference, setPaymentReference] = useState('')
  const [bankCharges, setBankCharges]       = useState('0')
  const [taxes, setTaxes]                   = useState('0')
  const [batchReference, setBatchReference] = useState(`BATCH-${new Date().toISOString().slice(0, 10)}`)
  const [createBatch, setCreateBatch]       = useState(invoiceIds.length > 1)
  const [notes, setNotes]                   = useState('')
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')
  const [done, setDone]                     = useState(false)

  const invoiceTotal = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const charges      = parseFloat(bankCharges) || 0
  const tax          = parseFloat(taxes) || 0
  const grandTotal   = invoiceTotal + charges + tax

  const isSingle = invoiceIds.length === 1
  const singleInvoice = isSingle ? invoices[0] : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId) { setError('Please select a bank account'); return }

    setSaving(true); setError('')
    try {
      // 1. Mark invoices as paid
      const res = await fetch('/api/supplier-invoices/bulk-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_ids: invoiceIds,
          payment_date: paymentDate,
          payment_reference: paymentReference || undefined,
          batch_reference: batchReference || undefined,
          notes: notes || undefined,
          create_batch: createBatch && invoiceIds.length > 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Payment failed'); return }

      // 2. Create expense transaction
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const sup = singleInvoice
          ? (singleInvoice.supplier as unknown as Supplier)
          : null
        const txName = isSingle
          ? `${sup?.name ?? 'Supplier'} — ${singleInvoice?.invoice_number ?? 'Invoice'}`
          : `Supplier payments — ${invoiceIds.length} invoices`

        await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: accountId,
          type: 'expense',
          amount: grandTotal,
          date: paymentDate,
          name: txName,
          notes: [
            paymentReference ? `Ref: ${paymentReference}` : '',
            charges > 0 ? `Bank charges: ₹${fmt(charges)}` : '',
            tax > 0 ? `Taxes: ₹${fmt(tax)}` : '',
            notes,
          ].filter(Boolean).join(' · ') || null,
        })
      }

      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl p-8 text-center shadow-2xl" style={{ backgroundColor: 'var(--surface)' }}>
          <CheckCircle2 className="w-14 h-14 mx-auto text-green-500 mb-4" />
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Payment Recorded</h3>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
            {invoiceIds.length} invoice{invoiceIds.length !== 1 ? 's' : ''} marked paid
          </p>
          <p className="text-2xl font-bold mt-2 mb-6" style={{ color: '#16a34a' }}>₹{fmt(grandTotal)}</p>
          <button onClick={onDone} className="w-full py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: 'var(--brand)' }}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ backgroundColor: 'var(--surface)', maxHeight: '90dvh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              {isSingle ? 'Mark as Paid' : `Bulk Payment · ${invoiceIds.length} invoices`}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Invoices total: ₹{fmt(invoiceTotal)}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">{error}</div>}

          {/* Invoice list (collapsed if many) */}
          {!isSingle && (
            <div className="rounded-xl p-3 space-y-1 max-h-24 overflow-y-auto" style={{ backgroundColor: 'var(--brand-light)' }}>
              {invoices.map(inv => {
                const sup = inv.supplier as unknown as Supplier
                return (
                  <p key={inv.id} className="text-xs" style={{ color: 'var(--brand)' }}>
                    {sup?.name ?? '—'} · {inv.invoice_number ?? 'No #'} · ₹{fmt(Number(inv.amount))}
                  </p>
                )
              })}
            </div>
          )}

          {/* Bank account */}
          <Field label="Debit from Account *">
            <AccountChipPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
          </Field>

          {/* Payment date */}
          <Field label="Payment Date *">
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Field>

          {/* Charges + taxes */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank Charges">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bankCharges}
                  onChange={e => setBankCharges(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
            </Field>
            <Field label="Taxes / GST">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxes}
                  onChange={e => setTaxes(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
            </Field>
          </div>

          {/* Grand total preview */}
          {(charges > 0 || tax > 0) && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Total transaction amount</span>
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>₹{fmt(grandTotal)}</span>
            </div>
          )}

          {/* Payment reference */}
          <Field label="Payment Reference">
            <input
              value={paymentReference}
              onChange={e => setPaymentReference(e.target.value)}
              placeholder="UTR / NEFT / IMPS reference"
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Field>

          {/* Batch grouping (multi only) */}
          {invoiceIds.length > 1 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={createBatch} onChange={e => setCreateBatch(e.target.checked)} className="rounded" />
              Group as payment batch
            </label>
          )}

          {createBatch && invoiceIds.length > 1 && (
            <Field label="Batch Reference">
              <input
                value={batchReference}
                onChange={e => setBatchReference(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </Field>
          )}

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Field>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !accountId}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#16a34a' }}
            >
              {saving ? 'Processing…' : `Confirm · ₹${fmt(grandTotal)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
