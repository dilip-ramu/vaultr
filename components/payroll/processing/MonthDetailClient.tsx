'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { PayrollMonth, PayrollEntry, Employee } from '@/lib/payroll/types'
import { calcFinalPayable } from '@/lib/payroll/types'
import MarkPaidModal from './MarkPaidModal'

interface Account { id: string; name: string; type: string }

interface Props {
  month: PayrollMonth
  entries: PayrollEntry[]
  accounts: Account[]
  companyName?: string | null
  companyAddress?: string | null
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmtMonth(m: string): string {
  if (!m) return ''
  const parts = String(m).split('T')[0].split('-')
  const mi = parseInt(parts[1] ?? '0', 10) - 1
  if (isNaN(mi) || mi < 0 || mi > 11) return m
  return `${MONTHS_LONG[mi]} ${parts[0]}`
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

type RowValues = {
  allowances: number
  overtime: number
  incentives: number
  deductions: number
  advance: number
}

export default function MonthDetailClient({ month: initialMonth, entries: initialEntries, accounts, companyName, companyAddress }: Props) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth)
  const [entries, setEntries] = useState(initialEntries)
  const [showPayModal, setShowPayModal] = useState(false)

  // Summary bar state
  const [billedEuros, setBilledEuros] = useState(String(initialMonth.billed_euros || ''))
  const [receivedInr, setReceivedInr] = useState(String(initialMonth.received_inr || ''))
  const [bankCharges, setBankCharges] = useState(String(initialMonth.bank_charges || ''))
  const [paymentDate, setPaymentDate] = useState(initialMonth.payment_date ?? '')

  // Generate entries state
  const [expendedRate, setExpendedRate] = useState(String(initialMonth.expended_rate || ''))
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Finalize state
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)

  // Income logging state
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [incomeAccountId, setIncomeAccountId] = useState('')
  const [loggingIncome, setLoggingIncome] = useState(false)
  const [incomeError, setIncomeError] = useState<string | null>(null)

  // Per-row inline values (always visible, saved on blur)
  const [rowValues, setRowValues] = useState<Record<string, RowValues>>(() => {
    const map: Record<string, RowValues> = {}
    for (const e of initialEntries) {
      map[e.id] = {
        allowances: Number(e.allowances),
        overtime:   Number(e.overtime),
        incentives: Number(e.incentives),
        deductions: Number(e.deductions),
        advance:    Number(e.advance),
      }
    }
    return map
  })
  const [savingRow, setSavingRow] = useState<string | null>(null)

  const totalPayable = useMemo(() =>
    entries.reduce((s, e) => {
      const v = rowValues[e.id]
      if (!v) return s + Number(e.final_payable)
      return s + calcFinalPayable(Number(e.salary_inr), v.allowances, v.overtime, v.incentives, v.deductions, v.advance)
    }, 0),
  [entries, rowValues])

  const effectiveRate = useMemo(() => {
    const rec = parseFloat(receivedInr) || 0
    const charges = parseFloat(bankCharges) || 0
    const billed = parseFloat(billedEuros) || 0
    if (billed <= 0) return null
    return Math.round(((rec - charges) / billed) * 10000) / 10000
  }, [receivedInr, bankCharges, billedEuros])

  async function saveMeta() {
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
  }

  async function handleGenerate() {
    const rate = parseFloat(expendedRate)
    if (!rate || rate <= 0) { setGenError('Enter a valid Exchange Rate'); return }
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
      // Reset row values
      const map: Record<string, RowValues> = {}
      for (const e of data.entries) {
        map[e.id] = { allowances: 0, overtime: 0, incentives: 0, deductions: 0, advance: 0 }
      }
      setRowValues(map)
    } catch {
      setGenError('Network error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleUndoPay() {
    if (!confirm('Reverse payment? This will delete all salary transactions for this month.')) return
    const res = await fetch(`/api/payroll/months/${month.id}/pay`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) { setMonth(data.month); router.refresh() }
    else alert(data.error ?? 'Failed to reverse payment')
  }

  async function handleFinalize() {
    if (!confirm(`Finalize payroll for ${fmtMonth(month.payroll_month)}?`)) return
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

  async function handleLogIncome() {
    if (!incomeAccountId) { setIncomeError('Please select an account'); return }
    setLoggingIncome(true)
    setIncomeError(null)
    try {
      const res = await fetch(`/api/payroll/months/${month.id}/income`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: incomeAccountId }),
      })
      const data = await res.json()
      if (!res.ok) { setIncomeError(data.error ?? 'Failed'); return }
      setMonth(data.month)
      setShowIncomeModal(false)
    } catch {
      setIncomeError('Network error')
    } finally {
      setLoggingIncome(false)
    }
  }

  async function handleReverseIncome() {
    if (!confirm('Delete the income and forex expense transactions for this month?')) return
    const res = await fetch(`/api/payroll/months/${month.id}/income`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) setMonth(data.month)
    else alert(data.error ?? 'Failed to reverse')
  }

  const saveRow = useCallback(async (entry: PayrollEntry) => {
    const v = rowValues[entry.id]
    if (!v) return
    setSavingRow(entry.id)
    try {
      const res = await fetch(`/api/payroll/months/${month.id}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entry.id, ...v }),
      })
      const data = await res.json()
      if (res.ok) {
        setEntries(prev => prev.map(e => e.id === entry.id ? data.entry : e))
      }
    } finally {
      setSavingRow(null)
    }
  }, [rowValues, month.id])

  function setRowField(entryId: string, field: keyof RowValues, value: number) {
    setRowValues(prev => ({ ...prev, [entryId]: { ...prev[entryId], [field]: value } }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/payroll/processing')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Back
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{fmtMonth(month.payroll_month)}</h1>
              {month.is_finalized && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  ✓ Finalized
                </span>
              )}
              {month.is_paid && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  ✓ Paid
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Payroll processing</p>
          </div>
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-3">
            {finalizeError && <span className="text-xs text-red-600">{finalizeError}</span>}

            {/* Finalize / Re-finalize */}
            {!month.is_finalized ? (
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {finalizing ? 'Finalizing…' : '✓ Finalize Payroll'}
              </button>
            ) : !month.is_paid ? (
              <>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {finalizing ? 'Saving…' : '↺ Re-finalize'}
                </button>
                <button
                  onClick={() => setShowPayModal(true)}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  ₹ Mark as Paid
                </button>
              </>
            ) : (
              <button
                onClick={handleUndoPay}
                className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                ↩ Undo Payment
              </button>
            )}
          </div>
        )}
      </div>

      {/* Settlement details */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Settlement Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Billed (€)</label>
            <input type="number" min="0" step="0.01" value={billedEuros}
              onChange={e => setBilledEuros(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Received (₹)</label>
            <input type="number" min="0" step="0.01" value={receivedInr}
              onChange={e => setReceivedInr(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bank Charges (₹)</label>
            <input type="number" min="0" step="0.01" value={bankCharges}
              onChange={e => setBankCharges(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
            <input type="date" value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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

        {/* Income logging */}
        {Number(month.received_inr) > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              {month.income_transaction_id
                ? '✓ Income & forex transactions logged'
                : 'Log received amount as income and bank charges as expense'}
            </div>
            {month.income_transaction_id ? (
              <button
                onClick={handleReverseIncome}
                className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors"
              >
                ↩ Reverse
              </button>
            ) : (
              <button
                onClick={() => { setShowIncomeModal(true); setIncomeError(null); setIncomeAccountId('') }}
                className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
              >
                ↓ Log Income & Forex
              </button>
            )}
          </div>
        )}
      </div>

      {/* Generate / regenerate */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-blue-800 mb-3">
          {entries.length > 0 ? 'Regenerate Payroll Entries' : 'Generate Payroll Entries'}
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-blue-700 mb-1">Exchange Rate (₹ per €)</label>
            <input type="number" min="0" step="0.0001" value={expendedRate}
              onChange={e => setExpendedRate(e.target.value)}
              className="w-full px-3 py-2 border border-blue-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 89.5" />
          </div>
          <button onClick={handleGenerate} disabled={generating}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {generating ? 'Generating…' : entries.length > 0 ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {genError && <p className="text-xs text-red-600 mt-2">{genError}</p>}
        {entries.length > 0 && (
          <p className="text-xs text-blue-600 mt-2">Regenerating resets all adjustments to zero.</p>
        )}
      </div>

      {/* Entries table — always editable */}
      {entries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Payroll Entries — {entries.length} employee{entries.length !== 1 ? 's' : ''}
            </h2>
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
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(entry => {
                  const v = rowValues[entry.id] ?? { allowances: 0, overtime: 0, incentives: 0, deductions: 0, advance: 0 }
                  const livePayable = calcFinalPayable(
                    Number(entry.salary_inr), v.allowances, v.overtime, v.incentives, v.deductions, v.advance
                  )
                  const isSaving = savingRow === entry.id

                  return (
                    <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${isSaving ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{entry.employee?.name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{entry.employee?.employee_id ?? ''}</div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-700 whitespace-nowrap">
                        €{Number(entry.salary_euro).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-700 whitespace-nowrap">
                        {fmtInr(Number(entry.salary_inr))}
                      </td>

                      {(['allowances', 'overtime', 'incentives', 'deductions', 'advance'] as const).map(field => (
                        <td key={field} className="px-2 py-2">
                          <input
                            type="number" min="0" step="0.01"
                            value={v[field] === 0 ? '' : v[field]}
                            placeholder="0"
                            onChange={e => setRowField(entry.id, field, parseFloat(e.target.value) || 0)}
                            onBlur={() => saveRow(entry)}
                            className="w-24 px-2 py-1.5 border border-gray-200 rounded text-sm text-right bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white hover:border-gray-300 transition-colors"
                          />
                        </td>
                      ))}

                      <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">
                        {isSaving ? <span className="text-gray-400 text-xs">saving…</span> : fmtInr(livePayable)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={8} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Total Payable
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                    {fmtInr(totalPayable)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-5 py-2 text-xs text-gray-400 border-t border-gray-100">
            Changes auto-save when you click out of a field.
          </p>
        </div>
      )}

      {/* Log Income & Forex modal */}
      {showIncomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Log Income & Forex</h2>
              <button onClick={() => setShowIncomeModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-light">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {incomeError && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{incomeError}</div>
              )}

              {/* Preview */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Income</span>
                  <span className="font-semibold text-green-700">
                    + Rs.{Number(month.received_inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-xs text-gray-400 -mt-1">
                  Business Income - {fmtMonth(month.payroll_month)}
                </div>
                {Number(month.bank_charges) > 0 && (
                  <>
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                      <span className="text-gray-500">Bank Forex Charges</span>
                      <span className="font-semibold text-red-600">
                        − Rs.{Number(month.bank_charges).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank Account *</label>
                <select
                  value={incomeAccountId}
                  onChange={e => setIncomeAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select account…</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowIncomeModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleLogIncome}
                disabled={loggingIncome}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loggingIncome ? 'Logging…' : 'Log Transactions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Paid modal */}
      {showPayModal && (
        <MarkPaidModal
          month={month}
          entries={entries.filter(e => e.employee) as (PayrollEntry & { employee: Employee })[]}
          accounts={accounts}
          companyName={companyName}
          companyAddress={companyAddress}
          onSuccess={(updatedMonth) => {
            setMonth(updatedMonth)
            setShowPayModal(false)
            router.refresh()
          }}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {/* Salary slips link */}
      {month.is_finalized && entries.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="font-medium text-green-800">Payroll finalized</p>
            <p className="text-sm text-green-600 mt-0.5">Salary slips are ready to view and download</p>
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
