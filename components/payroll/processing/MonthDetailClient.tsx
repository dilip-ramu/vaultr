'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { PayrollMonth, PayrollEntry } from '@/lib/payroll/types'
import { calcFinalPayable } from '@/lib/payroll/types'

interface Props {
  month: PayrollMonth
  entries: PayrollEntry[]
}

function fmtMonth(m: string) {
  const [year, month] = m.split('-')
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

type EditableField = 'allowances' | 'overtime' | 'incentives' | 'deductions' | 'advance' | 'notes'

export default function MonthDetailClient({ month: initialMonth, entries: initialEntries }: Props) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth)
  const [entries, setEntries] = useState(initialEntries)

  // Summary bar state
  const [billedEuros, setBilledEuros] = useState(String(initialMonth.billed_euros || ''))
  const [receivedInr, setReceivedInr] = useState(String(initialMonth.received_inr || ''))
  const [bankCharges, setBankCharges] = useState(String(initialMonth.bank_charges || ''))
  const [paymentDate, setPaymentDate] = useState(initialMonth.payment_date ?? '')
  const [savingMeta, setSavingMeta] = useState(false)

  // Generate entries state
  const [expendedRate, setExpendedRate] = useState(String(initialMonth.expended_rate || ''))
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Finalize state
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<PayrollEntry>>({})
  const [savingEntry, setSavingEntry] = useState(false)

  const totalPayable = useMemo(() => entries.reduce((s, e) => s + Number(e.final_payable), 0), [entries])

  // Effective rate = (received_inr - bank_charges) / billed_euros
  const effectiveRate = useMemo(() => {
    const rec = parseFloat(receivedInr) || 0
    const charges = parseFloat(bankCharges) || 0
    const billed = parseFloat(billedEuros) || 0
    if (billed <= 0) return null
    return Math.round(((rec - charges) / billed) * 10000) / 10000
  }, [receivedInr, bankCharges, billedEuros])

  async function saveMeta() {
    setSavingMeta(true)
    try {
      const body: Record<string, unknown> = {}
      if (billedEuros) body.billed_euros = parseFloat(billedEuros)
      if (receivedInr) body.received_inr = parseFloat(receivedInr)
      if (bankCharges) body.bank_charges = parseFloat(bankCharges)
      if (paymentDate) body.payment_date = paymentDate
      const res = await fetch(`/api/payroll/months/${month.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) setMonth(data.month)
    } finally {
      setSavingMeta(false)
    }
  }

  async function handleGenerate() {
    const rate = parseFloat(expendedRate)
    if (!rate || rate <= 0) { setGenError('Enter a valid Expended Euro Rate'); return }
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch(`/api/payroll/months/${month.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expended_rate: rate }),
      })
      const data = await res.json()
      if (!res.ok) { setGenError(data.error ?? 'Failed'); return }
      setEntries(data.entries)
      setMonth(prev => ({ ...prev, expended_rate: rate }))
    } catch {
      setGenError('Network error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleFinalize() {
    if (!confirm(`Finalize payroll for ${fmtMonth(month.payroll_month)}? This cannot be undone.`)) return
    setFinalizing(true)
    setFinalizeError(null)
    try {
      const res = await fetch(`/api/payroll/months/${month.id}/finalize`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setFinalizeError(data.error ?? 'Failed'); return }
      setMonth(data.month)
      router.refresh()
    } catch {
      setFinalizeError('Network error')
    } finally {
      setFinalizing(false)
    }
  }

  function startEdit(entry: PayrollEntry) {
    setEditingId(entry.id)
    setEditForm({
      allowances: entry.allowances,
      overtime: entry.overtime,
      incentives: entry.incentives,
      deductions: entry.deductions,
      advance: entry.advance,
      notes: entry.notes ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({})
  }

  async function saveEntry(entry: PayrollEntry) {
    setSavingEntry(true)
    try {
      const res = await fetch(`/api/payroll/months/${month.id}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entry.id, ...editForm }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Failed'); return }
      setEntries(prev => prev.map(e => e.id === entry.id ? data.entry : e))
      setEditingId(null)
    } finally {
      setSavingEntry(false)
    }
  }

  const isFinalized = month.is_finalized

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/payroll/processing')}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← Back
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{fmtMonth(month.payroll_month)}</h1>
              {isFinalized && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  ✓ Finalized
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Payroll processing</p>
          </div>
        </div>
        {!isFinalized && entries.length > 0 && (
          <div className="flex items-center gap-3">
            {finalizeError && <span className="text-xs text-red-600">{finalizeError}</span>}
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {finalizing ? 'Finalizing…' : '✓ Finalize Payroll'}
            </button>
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Settlement Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Billed (€)</label>
            <input
              type="number" min="0" step="0.01"
              value={billedEuros}
              onChange={e => setBilledEuros(e.target.value)}
              onBlur={saveMeta}
              disabled={isFinalized}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Received (₹)</label>
            <input
              type="number" min="0" step="0.01"
              value={receivedInr}
              onChange={e => setReceivedInr(e.target.value)}
              onBlur={saveMeta}
              disabled={isFinalized}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bank Charges (₹)</label>
            <input
              type="number" min="0" step="0.01"
              value={bankCharges}
              onChange={e => setBankCharges(e.target.value)}
              onBlur={saveMeta}
              disabled={isFinalized}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              onBlur={saveMeta}
              disabled={isFinalized}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>
        {effectiveRate !== null && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <span className="text-gray-400">Effective Rate:</span>
            <span className="font-mono font-semibold text-gray-900">
              ₹{effectiveRate.toLocaleString('en-IN', { minimumFractionDigits: 4 })} / €
            </span>
            <span className="text-xs text-gray-400">(auto-calculated)</span>
          </div>
        )}
      </div>

      {/* Generate entries */}
      {!isFinalized && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-800 mb-3">
            {entries.length > 0 ? 'Regenerate Payroll Entries' : 'Generate Payroll Entries'}
          </h2>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="block text-xs font-medium text-blue-700 mb-1">Expended Euro Rate (₹ per €)</label>
              <input
                type="number" min="0" step="0.0001"
                value={expendedRate}
                onChange={e => setExpendedRate(e.target.value)}
                className="w-full px-3 py-2 border border-blue-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 89.5"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {generating ? 'Generating…' : entries.length > 0 ? 'Regenerate' : 'Generate'}
            </button>
          </div>
          {genError && <p className="text-xs text-red-600 mt-2">{genError}</p>}
          {entries.length > 0 && (
            <p className="text-xs text-blue-600 mt-2">
              Regenerating will reset all adjustments. Save any manual changes before regenerating.
            </p>
          )}
        </div>
      )}

      {/* Entries table */}
      {entries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Payroll Entries — {entries.length} employee{entries.length !== 1 ? 's' : ''}</h2>
            <div className="text-sm text-gray-500">
              Total: <span className="font-semibold text-gray-900">{fmtInr(totalPayable)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary €</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary ₹</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Allowances</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Overtime</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Incentives</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Advance</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Final Payable</th>
                  {!isFinalized && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(entry => {
                  const isEditing = editingId === entry.id
                  const livePayable = isEditing
                    ? calcFinalPayable(
                        Number(entry.salary_inr),
                        Number(editForm.allowances ?? 0),
                        Number(editForm.overtime ?? 0),
                        Number(editForm.incentives ?? 0),
                        Number(editForm.deductions ?? 0),
                        Number(editForm.advance ?? 0),
                      )
                    : Number(entry.final_payable)

                  return (
                    <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${isEditing ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{entry.employee?.name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{entry.employee?.employee_id ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        €{Number(entry.salary_euro).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {fmtInr(Number(entry.salary_inr))}
                      </td>

                      {/* Editable cells */}
                      {(['allowances', 'overtime', 'incentives', 'deductions', 'advance'] as const).map(field => (
                        <td key={field} className="px-4 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number" min="0" step="0.01"
                              value={editForm[field] ?? 0}
                              onChange={e => setEditForm(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }))}
                              className="w-24 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <span className={`font-mono text-gray-700 ${Number(entry[field]) > 0 ? '' : 'text-gray-300'}`}>
                              {Number(entry[field]) > 0 ? fmtInr(Number(entry[field])) : '—'}
                            </span>
                          )}
                        </td>
                      ))}

                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                        {fmtInr(livePayable)}
                      </td>

                      {!isFinalized && (
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => saveEntry(entry)}
                                disabled={savingEntry}
                                className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                              >
                                {savingEntry ? '…' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(entry)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={isFinalized ? 8 : 8} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Total Payable
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                    {fmtInr(totalPayable)}
                  </td>
                  {!isFinalized && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Salary slips link — shown after finalization */}
      {isFinalized && entries.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="font-medium text-green-800">Payroll finalized</p>
            <p className="text-sm text-green-600 mt-0.5">Salary slips are ready to view and print</p>
          </div>
          <button
            onClick={() => router.push(`/payroll/slips?month=${month.id}`)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            View Salary Slips →
          </button>
        </div>
      )}
    </div>
  )
}
