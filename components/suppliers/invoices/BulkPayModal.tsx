'use client'

import { useState, useRef } from 'react'
import { X, CheckCircle2, Paperclip, Upload } from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'
import AccountChipPicker, { type PickerAccount } from '@/components/shared/AccountChipPicker'
import { createClient } from '@/lib/supabase/client'
import { useFileDrop } from '@/components/shared/useFileDrop'

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
  const [proofFile, setProofFile]           = useState<File | null>(null)
  const [enableAutoPay, setEnableAutoPay]   = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')
  const [done, setDone]                     = useState(false)
  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const proofDrop = useFileDrop(f => setProofFile(f[0] ?? null))

  const invoiceTotal = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const charges      = parseFloat(bankCharges) || 0
  const tax          = parseFloat(taxes) || 0
  const grandTotal   = invoiceTotal + charges + tax

  const isSingle = invoiceIds.length === 1
  const singleInvoice = isSingle ? invoices[0] : null
  const allRecurring = invoices.every(inv => inv.is_recurring)
  const intervalLabel = invoices[0]?.recurrence_interval ?? 'monthly'

  // Auto-derive default category: for single invoice use supplier's default;
  // for multi, use it only if all selected invoices share the same supplier category
  const defaultCategoryId = (() => {
    const cats = invoices.map(inv => {
      const sup = inv.supplier as unknown as (Supplier & { default_category_id?: string | null })
      return sup?.default_category_id ?? null
    })
    const unique = [...new Set(cats.filter(Boolean))]
    return unique.length === 1 ? unique[0]! : null
  })()

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
        // Build name from unique supplier names across all selected invoices
        const uniqueNames = [
          ...new Set(
            invoices.map(inv => {
              const s = inv.supplier as unknown as Supplier
              return s?.name ?? (inv as unknown as Record<string, unknown>).payee_name as string | undefined ?? null
            }).filter(Boolean) as string[]
          ),
        ]
        const nameStr = uniqueNames.length === 0
          ? 'Supplier'
          : uniqueNames.length === 1
            ? uniqueNames[0]
            : uniqueNames.length === 2
              ? `${uniqueNames[0]} and ${uniqueNames[1]}`
              : `${uniqueNames.slice(0, -1).join(', ')} and ${uniqueNames.at(-1)}`
        const txName = `${nameStr} payment`

        const { data: tx } = await supabase.from('transactions').insert({
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
          // Link back to invoice/batch so mark-unpaid can delete this transaction
          supplier_invoice_id: isSingle ? invoiceIds[0] : null,
          supplier_payment_batch_id: !isSingle && data.batch_id ? data.batch_id : null,
          // Auto-apply the supplier's default expense category
          category_id: defaultCategoryId ?? null,
        }).select('id').single()

        // Copy invoice attachments + payment proof to the transaction
        if (tx?.id) {
          const attachmentRows: {
            user_id: string; transaction_id: string
            file_path: string; file_name: string; file_size: number | null; content_type: string | null
          }[] = []

          // Invoice PDFs
          for (const inv of invoices.filter(i => i.attachment_path && i.attachment_name)) {
            attachmentRows.push({
              user_id: user.id,
              transaction_id: tx.id,
              file_path: inv.attachment_path!,
              file_name: inv.attachment_name!,
              file_size: inv.attachment_size ?? null,
              content_type: null,
            })
          }

          // Payment proof (uploaded now)
          if (proofFile) {
            const ext  = proofFile.name.split('.').pop() ?? 'bin'
            const rand = Math.random().toString(36).slice(2, 8)
            const path = `${user.id}/payment-proofs/${Date.now()}-${rand}.${ext}`
            const { error: upErr } = await supabase.storage
              .from('vaultr-attachments')
              .upload(path, proofFile, { contentType: proofFile.type, upsert: false })
            if (!upErr) {
              attachmentRows.push({
                user_id: user.id,
                transaction_id: tx.id,
                file_path: path,
                file_name: proofFile.name,
                file_size: proofFile.size,
                content_type: proofFile.type || null,
              })
            }
          }

          if (attachmentRows.length > 0) {
            await supabase.from('attachments').insert(attachmentRows)
          }
        }
      }

      // 3. Enable auto-pay if requested (save account on the invoice)
      if (enableAutoPay && allRecurring && accountId) {
        await Promise.all(invoiceIds.map(id =>
          fetch(`/api/supplier-invoices/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_pay_account_id: accountId }),
          })
        ))
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
          <CheckCircle2 className="w-14 h-14 mx-auto  mb-4" />
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Payment Recorded</h3>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
            {invoiceIds.length} invoice{invoiceIds.length !== 1 ? 's' : ''} marked paid
          </p>
          <p className="text-2xl font-bold mt-2 mb-6" style={{ color: 'var(--income)' }}>₹{fmt(grandTotal)}</p>
          <button onClick={onDone} className="w-full py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: 'var(--brand)' }}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
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
          {error && <div className="px-4 py-3 rounded-xl text-sm   border border-[var(--border)]">{error}</div>}

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

          {/* Auto-pay toggle — only shown for recurring invoices */}
          {allRecurring && accountId && (
            <label
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer"
              style={{
                background: enableAutoPay ? 'rgba(42,122,80,0.08)' : 'var(--surface-2)',
                border: `1px solid ${enableAutoPay ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              <input
                type="checkbox"
                checked={enableAutoPay}
                onChange={e => setEnableAutoPay(e.target.checked)}
                className="rounded"
              />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Auto-pay future occurrences
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Debit this account automatically every {intervalLabel} — no confirmation needed
                </p>
              </div>
            </label>
          )}

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

          {/* Payment proof attachment */}
          <Field label="Payment Proof">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={e => setProofFile(e.target.files?.[0] ?? null)}
            />
            {proofFile ? (
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm"
                style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--brand)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
                  <span className="truncate text-xs" style={{ color: 'var(--text)' }}>{proofFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setProofFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="ml-2 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                {...proofDrop.dropProps}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed text-sm transition-all"
                style={{ borderColor: proofDrop.dragOver ? 'var(--brand)' : 'var(--border)', background: proofDrop.dragOver ? 'var(--brand-light)' : undefined, color: proofDrop.dragOver ? 'var(--brand)' : 'var(--text-muted)' }}
              >
                <Upload className="w-4 h-4" />
                {proofDrop.dragOver ? 'Drop to attach' : 'Attach or drop screenshot / receipt'}
              </button>
            )}
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
              style={{ backgroundColor: 'var(--income)' }}
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
