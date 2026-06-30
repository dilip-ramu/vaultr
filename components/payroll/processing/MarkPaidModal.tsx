'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PayrollMonth, PayrollEntry, Employee } from '@/lib/payroll/types'
import AccountChipPicker from '@/components/shared/AccountChipPicker'

interface Account {
  id: string
  name: string
  type: string
  color?: string | null
  avatar_url?: string | null
  custom_type_id?: string | null
  custom_type_name?: string | null
  custom_type_color?: string | null
  custom_type_icon?: string | null
}

interface Props {
  month: PayrollMonth
  entries: (PayrollEntry & { employee: Employee })[]
  accounts: Account[]
  companyName?: string | null
  companyAddress?: string | null
  onSuccess: (updatedMonth: PayrollMonth) => void
  onClose: () => void
}

type Step = 'select' | 'uploading' | 'done'

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function slugName(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function slugMonth(m: string) {
  const [year, month] = m.split('-')
  return new Date(Number(year), Number(month) - 1)
    .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    .toLowerCase().replace(/\s+/g, '-')
}

export default function MarkPaidModal({
  month, entries, accounts, companyName, companyAddress, onSuccess, onClose
}: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [payDate, setPayDate] = useState(month.payment_date ?? new Date().toISOString().slice(0, 10))
  const [step, setStep] = useState<Step>('select')
  const [progress, setProgress] = useState<{ name: string; done: boolean; error?: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  const total = entries.reduce((s, e) => s + Number(e.final_payable), 0)

  async function handleConfirm() {
    if (!accountId) { setError('Please select an account'); return }
    setError(null)
    setStep('uploading')
    setProgress(entries.map(e => ({ name: e.employee?.name ?? 'Employee', done: false })))

    // Step 1 — create transactions via API
    const res = await fetch(`/api/payroll/months/${month.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, payment_date: payDate }),
    })
    const data = await res.json()
    if (!res.ok) {
      setStep('select')
      setError(data.error ?? 'Failed to create transactions')
      return
    }

    // Map entry_id → transaction_id from response
    const txMap: Record<string, string> = {}
    for (const e of (data.entries ?? []) as Array<{ id: string; transaction_id: string }>) {
      if (e.transaction_id) txMap[e.id] = e.transaction_id
    }

    // Step 2 — generate PDFs and upload as attachments
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStep('select'); setError('Session expired'); return }

    // Lazy-load PDF renderer
    const [{ pdf }, { SalarySlipDocument }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/components/payroll/slips/SalarySlipPDF'),
    ])

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const txId = txMap[entry.id]
      if (!txId) {
        setProgress(prev => prev.map((p, idx) => idx === i ? { ...p, done: true, error: 'No transaction created' } : p))
        continue
      }

      try {
        // Generate PDF blob
        const blob = await pdf(
          <SalarySlipDocument
            entry={entry}
            month={month}
            employee={entry.employee}
            companyName={companyName}
            companyAddress={companyAddress}
          />
        ).toBlob()

        const fileName = `${slugName(entry.employee?.name ?? 'employee')}-${slugMonth(month.payroll_month)}.pdf`
        const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`

        // Upload to storage
        const { error: uploadErr } = await supabase.storage
          .from('vaultr-attachments')
          .upload(filePath, blob, { contentType: 'application/pdf' })

        if (uploadErr) throw new Error(uploadErr.message)

        // Create attachment record
        await supabase.from('attachments').insert({
          user_id:        user.id,
          transaction_id: txId,
          file_path:      filePath,
          file_name:      fileName,
          file_size:      blob.size,
          content_type:   'application/pdf',
        })

        setProgress(prev => prev.map((p, idx) => idx === i ? { ...p, done: true } : p))
      } catch (err) {
        setProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, done: true, error: String(err) } : p
        ))
      }
    }

    setStep('done')
    onSuccess(data.month)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[92dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Mark Payroll as Paid</h2>
          {step !== 'uploading' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">×</button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Select step */}
          {step === 'select' && (
            <>
              {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}

              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Employees</span>
                  <span className="font-medium text-gray-900">{entries.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total payable</span>
                  <span className="font-semibold text-gray-900">{fmtInr(total)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Debit from Account *</label>
                <AccountChipPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-xs text-gray-400">
                This will create {entries.length} expense transaction{entries.length !== 1 ? 's' : ''} and attach
                each employee's salary slip as a PDF.
              </p>
            </>
          )}

          {/* Uploading step */}
          {(step === 'uploading' || step === 'done') && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">
                {step === 'uploading' ? 'Creating transactions & uploading slips…' : 'All done!'}
              </p>
              {progress.map((p, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    p.done
                      ? p.error ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                      : 'bg-gray-100'
                  }`}>
                    {p.done ? (p.error ? '✕' : '✓') : (
                      <span className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin block" />
                    )}
                  </div>
                  <span className={`flex-1 ${p.error ? 'text-red-600' : 'text-gray-700'}`}>
                    {p.name}
                    {p.error && <span className="text-xs ml-1 text-red-400">({p.error})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
          {step === 'select' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  transition-colors"
              >
                Confirm Payment
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={onClose}
              className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
