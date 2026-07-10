'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { PayrollMonth, PayrollEntry, Employee } from '@/lib/payroll/types'
import { calcFinalPayable } from '@/lib/payroll/types'
import MarkPaidModal from './MarkPaidModal'
import AccountChipPicker from '@/components/shared/AccountChipPicker'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

interface Account { id: string; name: string; type: string; color?: string | null; avatar_url?: string | null; custom_type_id?: string | null; custom_type_name?: string | null; custom_type_color?: string | null; custom_type_icon?: string | null }

interface Customer { id: string; name: string }

interface Props {
  month: PayrollMonth
  entries: PayrollEntry[]
  accounts: Account[]
  companyName?: string | null
  companyAddress?: string | null
  companiesById?: import('@/lib/companies/templates').CompaniesById
  customers?: Customer[]
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

/** Currency symbol for the employee's salary_currency. Falls back to the 3-letter
 *  code when we don't have a canonical symbol. */
function currencySymbol(cur?: string | null): string {
  // Fallback to INR when salary_currency is missing — most staff are paid in
  // rupees, and using EUR here was showing € on payroll rows that had no
  // currency set yet.
  const c = (cur ?? 'INR').toUpperCase()
  if (c === 'INR') return '₹'
  if (c === 'EUR') return '€'
  if (c === 'USD') return '$'
  if (c === 'GBP') return '£'
  if (c === 'JPY' || c === 'CNY') return '¥'
  return c + ' '
}

// ── Bank CSV helpers ──────────────────────────────────────────────────────────
function cleanCsvField(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/[,\r\n]+/g, ' ')   // commas and newlines break CSV
    .replace(/[₹€$£¥]/g, '')     // no currency symbols
    .replace(/\s+/g, ' ')
    .trim()
}

function generateBankCSV(
  entries: PayrollEntry[],
  rowValues: Record<string, RowValues>,
  monthLabel: string,
): string {
  // Columns: APO, Amount, Account Number, Beneficiary Name, INR, NFT, IFSC Code, Remarks
  // No header row. Static prefills: APO="APO", INR="INR", NFT="NFT"
  const rows: string[][] = []
  for (const entry of entries) {
    const emp = entry.employee
    if (!emp) continue
    if (!emp.ifsc || !emp.account_number) continue

    const v = rowValues[entry.id] ?? { allowances: 0, overtime: 0, incentives: 0, deductions: 0, advance: 0 }
    const amount = Math.round(
      calcFinalPayable(Number(entry.salary_inr), v.allowances, v.overtime, v.incentives, v.deductions, v.advance)
    )
    if (amount <= 0) continue

    rows.push([
      'APO',
      String(amount),
      cleanCsvField(emp.account_number),
      cleanCsvField(emp.name),
      'INR',
      'NFT',
      cleanCsvField(emp.ifsc),
      cleanCsvField(`Salary ${monthLabel}`),
    ])
  }

  if (rows.length === 0) return ''
  return rows.map(r => r.join(',') + ';').join('\n')
}

function triggerCSVDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

type RowValues = {
  allowances: number
  overtime: number
  incentives: number
  deductions: number
  advance: number
}

export default function MonthDetailClient({ month: initialMonth, entries: initialEntries, accounts, companyName, companyAddress, companiesById, customers = [] }: Props) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth)
  const [entries, setEntries] = useState(initialEntries)
  const [showPayModal, setShowPayModal] = useState(false)
  // Works-for filter — 'all' | 'me' | <customer_id>. Filters the visible rows
  // AND the "check all" behavior.
  const [worksForFilter, setWorksForFilter] = useState<string>('all')
  // Which entries to actually pay when Mark Paid runs. Everyone checked by
  // default; user unchecks people they want to skip this batch.
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
    () => new Set(initialEntries.map(e => e.id))
  )

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

  // Which of the user's customers actually have staff in this month? Used to
  // decide which Works-for chips to render.
  const worksForOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string; count: number }> = [
      { key: 'me', label: 'Me', count: 0 },
    ]
    const cusMap = new Map<string, number>()
    for (const e of entries) {
      const cid = (e.employee as Employee | undefined)?.works_for_customer_id ?? null
      if (!cid) opts[0].count++
      else cusMap.set(cid, (cusMap.get(cid) ?? 0) + 1)
    }
    for (const c of customers) {
      const count = cusMap.get(c.id) ?? 0
      if (count > 0) opts.push({ key: c.id, label: c.name, count })
    }
    return opts.filter(o => o.count > 0)
  }, [entries, customers])

  // Filter visible entries by the Works-for chip.
  const visibleEntries = useMemo(() => {
    if (worksForFilter === 'all') return entries
    return entries.filter(e => {
      const cid = (e.employee as Employee | undefined)?.works_for_customer_id ?? null
      if (worksForFilter === 'me') return !cid
      return cid === worksForFilter
    })
  }, [entries, worksForFilter])

  // Total that will actually be paid this batch (only checked, visible rows).
  const selectedTotal = useMemo(() =>
    visibleEntries.reduce((s, e) => {
      if (!selectedEntries.has(e.id)) return s
      const v = rowValues[e.id]
      if (!v) return s + Number(e.final_payable)
      return s + calcFinalPayable(Number(e.salary_inr), v.allowances, v.overtime, v.incentives, v.deductions, v.advance)
    }, 0),
  [visibleEntries, rowValues, selectedEntries])

  function toggleEntry(id: string) {
    setSelectedEntries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    const visibleIds = visibleEntries.map(e => e.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedEntries.has(id))
    setSelectedEntries(prev => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

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
    // Rate is optional — required only for foreign-currency salaries (the API
    // enforces that). Rupee-only payrolls generate at 1:1 with no rate.
    const rate = parseFloat(expendedRate) || 0
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
    if (!await confirmDialog('Reverse payment? This will delete all salary transactions for this month.')) return
    const res = await fetch(`/api/payroll/months/${month.id}/pay`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) { setMonth(data.month); router.refresh() }
    else notify(data.error ?? 'Failed to reverse payment')
  }

  async function handleFinalize() {
    if (!await confirmDialog(`Finalize payroll for ${fmtMonth(month.payroll_month)}?`)) return
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
    if (!await confirmDialog('Delete the income and forex expense transactions for this month?')) return
    const res = await fetch(`/api/payroll/months/${month.id}/income`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) setMonth(data.month)
    else notify(data.error ?? 'Failed to reverse')
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
          <button onClick={() => router.push('/payroll/processing')} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-sm">
            ← Back
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{fmtMonth(month.payroll_month)}</h1>
              {month.is_finalized && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[var(--brand-light)] text-[var(--income)] rounded-full text-sm font-medium">
                  ✓ Finalized
                </span>
              )}
              {month.is_paid && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[var(--surface-2)] text-[var(--transfer)] rounded-full text-sm font-medium">
                  ✓ Paid
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">Payroll processing</p>
          </div>
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-3">
            {finalizeError && <span className="text-xs text-[var(--expense)]">{finalizeError}</span>}

            {/* Finalize / Re-finalize */}
            {!month.is_finalized ? (
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  disabled:opacity-50 transition-colors"
              >
                {finalizing ? 'Finalizing…' : '✓ Finalize Payroll'}
              </button>
            ) : !month.is_paid ? (
              <>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="px-4 py-2 border border-[var(--border)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-50 transition-colors"
                >
                  {finalizing ? 'Saving…' : '↺ Re-finalize'}
                </button>
                <button
                  onClick={() => setShowPayModal(true)}
                  className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  transition-colors"
                >
                  ₹ Mark as Paid
                </button>
              </>
            ) : (
              <button
                onClick={handleUndoPay}
                className="px-4 py-2 border border-[var(--border)] text-[var(--expense)] rounded-lg text-sm font-medium hover:bg-[var(--surface-2)] transition-colors"
              >
                ↩ Undo Payment
              </button>
            )}
          </div>
        )}
      </div>

      {/* Settlement details */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-4">Settlement Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Billed (€)</label>
            <input type="number" min="0" step="0.01" value={billedEuros}
              onChange={e => setBilledEuros(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Received (₹)</label>
            <input type="number" min="0" step="0.01" value={receivedInr}
              onChange={e => setReceivedInr(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Bank Charges (₹)</label>
            <input type="number" min="0" step="0.01" value={bankCharges}
              onChange={e => setBankCharges(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Payment Date</label>
            <input type="date" value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)} onBlur={saveMeta}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]" />
          </div>
        </div>
        {effectiveRate !== null && (
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <span className="text-[var(--text-faint)]">Effective Rate:</span>
            <span className="font-mono font-semibold text-[var(--text)]">
              ₹{effectiveRate.toLocaleString('en-IN', { minimumFractionDigits: 4 })} / €
            </span>
            <span className="text-xs text-[var(--text-faint)]">(auto-calculated)</span>
          </div>
        )}

        {/* Income logging */}
        {Number(month.received_inr) > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-muted)]">
              {month.income_transaction_id
                ? '✓ Income & forex transactions logged'
                : month.contrast_invoice_id
                  ? 'Log received amount as income — this also marks the linked customer invoice as paid'
                  : 'Log received amount as income and bank charges as expense'}
            </div>
            {month.income_transaction_id ? (
              <button
                onClick={handleReverseIncome}
                className="px-3 py-1.5 border border-[var(--border)] text-[var(--expense)] rounded-lg text-xs font-medium hover:bg-[var(--surface-2)] transition-colors"
              >
                ↩ Reverse
              </button>
            ) : (
              <button
                onClick={() => { setShowIncomeModal(true); setIncomeError(null); setIncomeAccountId('') }}
                className="px-4 py-1.5 btn-brand text-white rounded-lg text-xs font-medium  transition-colors"
              >
                ↓ Log Income & Forex
              </button>
            )}
          </div>
        )}
      </div>

      {/* Generate / regenerate */}
      <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[var(--transfer)] mb-3">
          {entries.length > 0 ? 'Regenerate Payroll Entries' : 'Generate Payroll Entries'}
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-[var(--transfer)] mb-1">Exchange Rate (₹ per €) <span className="font-normal text-[var(--text-faint)]">— only for foreign-currency salaries</span></label>
            <input type="number" min="0" step="0.0001" value={expendedRate}
              onChange={e => setExpendedRate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--surface)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
              placeholder="Leave blank for ₹ salaries" />
          </div>
          <button onClick={handleGenerate} disabled={generating}
            className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  disabled:opacity-50 transition-colors">
            {generating ? 'Generating…' : entries.length > 0 ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {genError && <p className="text-xs text-[var(--expense)] mt-2">{genError}</p>}
        {entries.length > 0 && (
          <p className="text-xs text-[var(--transfer)] mt-2">Regenerating resets all adjustments to zero.</p>
        )}
      </div>

      {/* Entries table — always editable */}
      {entries.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Payroll Entries — {entries.length} employee{entries.length !== 1 ? 's' : ''}
            </h2>
            <div className="text-sm text-[var(--text-muted)]">
              Total: <span className="font-semibold text-[var(--text)]">{fmtInr(totalPayable)}</span>
              {selectedEntries.size !== entries.length && (
                <span className="ml-3">
                  Selected: <span className="font-semibold text-[var(--transfer)]">{fmtInr(selectedTotal)}</span>
                </span>
              )}
            </div>
          </div>
          {/* Works-for filter chips — only show when we have > 1 group */}
          {worksForOptions.length > 1 && (
            <div className="px-5 py-2 border-b border-[var(--border)] flex flex-wrap gap-2 bg-[var(--surface-2)]">
              <button
                onClick={() => setWorksForFilter('all')}
                className="px-2.5 py-1 rounded-full text-xs font-medium"
                style={
                  worksForFilter === 'all'
                    ? { background: 'var(--brand)', color: '#fff' }
                    : { background: '#fff', color: '#4b5563', border: '1px solid #e5e7eb' }
                }
              >
                All ({entries.length})
              </button>
              {worksForOptions.map(o => (
                <button
                  key={o.key}
                  onClick={() => setWorksForFilter(o.key)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={
                    worksForFilter === o.key
                      ? { background: 'var(--brand)', color: '#fff' }
                      : { background: '#fff', color: '#4b5563', border: '1px solid #e5e7eb' }
                  }
                >
                  {o.label} ({o.count})
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-10">
                    <input
                      type="checkbox"
                      checked={visibleEntries.length > 0 && visibleEntries.every(e => selectedEntries.has(e.id))}
                      onChange={toggleAllVisible}
                      title="Select all shown"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Salary</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Salary ₹</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Allowances</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Overtime</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Incentives</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Deductions</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Advance</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-2)]">
                {visibleEntries.map(entry => {
                  const v = rowValues[entry.id] ?? { allowances: 0, overtime: 0, incentives: 0, deductions: 0, advance: 0 }
                  const livePayable = calcFinalPayable(
                    Number(entry.salary_inr), v.allowances, v.overtime, v.incentives, v.deductions, v.advance
                  )
                  const isSaving = savingRow === entry.id
                  const isChecked = selectedEntries.has(entry.id)

                  return (
                    <tr key={entry.id} className={`hover:bg-[var(--surface-2)] transition-colors ${isSaving ? 'opacity-60' : ''} ${!isChecked ? 'opacity-40' : ''}`}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEntry(entry.id)}
                          disabled={month.is_paid}
                          title={month.is_paid ? 'Month already paid — cannot change selection' : 'Include in this batch'}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-[var(--text)]">{entry.employee?.name ?? '—'}</div>
                        <div className="text-xs text-[var(--text-faint)]">{entry.employee?.employee_id ?? ''}</div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-[var(--text)] whitespace-nowrap">
                        {currencySymbol(entry.employee?.salary_currency)}{Number(entry.salary_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-[var(--text)] whitespace-nowrap">
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
                            className="w-24 px-2 py-1.5 border border-[var(--border)] rounded text-sm text-right bg-[var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] focus:bg-[var(--surface)] hover:border-[var(--border)] transition-colors"
                          />
                        </td>
                      ))}

                      <td className="px-4 py-2 text-right font-mono font-semibold text-[var(--text)] whitespace-nowrap">
                        {isSaving ? <span className="text-[var(--text-faint)] text-xs">saving…</span> : fmtInr(livePayable)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-[var(--surface-2)] border-t border-[var(--border)]">
                <tr>
                  <td colSpan={8} className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Total Payable
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[var(--text)]">
                    {fmtInr(totalPayable)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-5 py-2 text-xs text-[var(--text-faint)] border-t border-[var(--border)]">
            Changes auto-save when you click out of a field.
          </p>
        </div>
      )}

      {/* Log Income & Forex modal */}
      {showIncomeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-[var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
              <h2 className="text-lg font-semibold text-[var(--text)]">Log Income & Forex</h2>
              <button onClick={() => setShowIncomeModal(false)} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-xl font-light">×</button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {incomeError && (
                <div className="bg-[var(--surface-2)] text-[var(--expense)] text-sm px-4 py-2 rounded-lg">{incomeError}</div>
              )}

              {/* Preview */}
              <div className="bg-[var(--surface-2)] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Income</span>
                  <span className="font-semibold text-[var(--income)]">
                    + Rs.{Number(month.received_inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-faint)] -mt-1">
                  Business Income - {fmtMonth(month.payroll_month)}
                </div>
                {Number(month.bank_charges) > 0 && (
                  <>
                    <div className="border-t border-[var(--border)] pt-2 flex justify-between">
                      <span className="text-[var(--text-muted)]">Bank Forex Charges</span>
                      <span className="font-semibold text-[var(--expense)]">
                        − Rs.{Number(month.bank_charges).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">Bank Account *</label>
                <AccountChipPicker
                  accounts={accounts}
                  selectedId={incomeAccountId}
                  onSelect={setIncomeAccountId}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-2)] rounded-b-2xl shrink-0">
              <button onClick={() => setShowIncomeModal(false)} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
              <button
                onClick={handleLogIncome}
                disabled={loggingIncome}
                className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  disabled:opacity-50 transition-colors"
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
          entries={entries.filter(e => e.employee && selectedEntries.has(e.id)) as (PayrollEntry & { employee: Employee })[]}
          accounts={accounts}
          companyName={companyName}
          companyAddress={companyAddress}
          companiesById={companiesById}
          onSuccess={(updatedMonth) => {
            setMonth(updatedMonth)
            setShowPayModal(false)
            router.refresh()
          }}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {/* Salary slips link + bank CSV download */}
      {month.is_finalized && entries.length > 0 && (
        <div className="bg-[var(--brand-light)] border border-[var(--border)] rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-[var(--income)]">Payroll finalized</p>
            <p className="text-sm text-[var(--income)] mt-0.5">Salary slips ready · download bank transfer CSV for bulk payment</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                const csv = generateBankCSV(entries, rowValues, fmtMonth(month.payroll_month))
                if (!csv) { notify('No eligible entries — check that employees have IFSC code and account number filled in.'); return }
                triggerCSVDownload(csv, 'BULK.csv')
              }}
              className="px-4 py-2 border border-[var(--border)] text-[var(--income)] bg-[var(--surface)] rounded-lg text-sm font-medium hover:bg-[var(--brand-light)] transition-colors"
            >
              ↓ Bank Transfer CSV
            </button>
            <button
              onClick={() => router.push(`/payroll/slips?month=${month.id}`)}
              className="px-4 py-2 btn-brand text-white rounded-lg text-sm font-medium  transition-colors"
            >
              View Salary Slips →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
