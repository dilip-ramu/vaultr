'use client'

import { useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'

interface Props {
  invoiceIds: string[]
  invoices: SupplierInvoice[]
  onDone: () => void
  onClose: () => void
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

export default function BulkPayModal({ invoiceIds, invoices, onDone, onClose }: Props) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentReference, setPaymentReference] = useState('')
  const [batchReference, setBatchReference] = useState(`BATCH-${new Date().toISOString().slice(0,10)}`)
  const [bankReference, setBankReference] = useState('')
  const [createBatch, setCreateBatch] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/supplier-invoices/bulk-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_ids: invoiceIds,
          payment_date: paymentDate,
          payment_reference: paymentReference || undefined,
          batch_reference: batchReference || undefined,
          bank_reference: bankReference || undefined,
          notes: notes || undefined,
          create_batch: createBatch,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Payment failed'); return }
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
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{invoiceIds.length} invoice{invoiceIds.length !== 1 ? 's' : ''} marked paid</p>
          <p className="text-2xl font-bold mt-2 mb-6" style={{ color: '#16a34a' }}>₹{fmtAmt(totalAmount)}</p>
          <button
            onClick={onDone}
            className="w-full py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Bulk Payment</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">{error}</div>}

          {/* Summary */}
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--brand-light)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
              {invoiceIds.length} invoice{invoiceIds.length !== 1 ? 's' : ''} · Total: ₹{fmtAmt(totalAmount)}
            </p>
            <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
              {invoices.map(inv => {
                const sup = inv.supplier as unknown as Supplier
                return (
                  <p key={inv.id} className="text-xs" style={{ color: 'var(--brand)' }}>
                    {sup?.name ?? '—'} · {inv.invoice_number ?? 'No #'} · ₹{fmtAmt(Number(inv.amount))}
                  </p>
                )
              })}
            </div>
          </div>

          <Field label="Payment Date *">
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Field>

          <Field label="Payment Reference">
            <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
              placeholder="UTR / NEFT / IMPS reference"
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Field>

          {/* Batch */}
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={createBatch} onChange={e => setCreateBatch(e.target.checked)} className="rounded" />
            Group as payment batch
          </label>

          {createBatch && (
            <div className="space-y-3 pl-5">
              <Field label="Batch Reference">
                <input value={batchReference} onChange={e => setBatchReference(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </Field>
              <Field label="Bank Transaction Reference">
                <input value={bankReference} onChange={e => setBankReference(e.target.value)}
                  placeholder="Bank statement ref"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </Field>
            </div>
          )}

          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes…" rows={2}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#16a34a' }}
            >
              {saving ? 'Processing…' : `Mark ${invoiceIds.length} Paid`}
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
