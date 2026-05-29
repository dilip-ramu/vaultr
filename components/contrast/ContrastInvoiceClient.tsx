'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  CheckCircle2, AlertCircle, Loader2,
  Users, Truck, ReceiptText, FileText, Info, Plus, X, ArrowRight,
} from 'lucide-react'
import type { ContrastInvoiceData } from './ContrastInvoicePDF'

const ContrastInvoicePDFDownload = dynamic(() => import('./ContrastInvoicePDFDownload'), { ssr: false })

const MONTHS_LONG = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS_LONG[parseInt(m) - 1]} ${y}`
}

function fmtEur(n: number) {
  return `EUR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

function round2(n: number) { return Math.round(n * 100) / 100 }

// ── Types ─────────────────────────────────────────────────────────────────────
interface PayrollEntry {
  id: string
  salary_euro: number
  expended_rate: number
  salary_inr: number
  final_payable: number
  employee: { id: string; name: string }
}

interface PayrollMonth {
  id: string
  payroll_month: string
  payment_date: string | null
  billed_euros: number
  expended_rate: number
  is_finalized: boolean
  entries: PayrollEntry[]
}

interface CourierBill {
  id: string
  name: string
  amount: number    // INR
  due_date: string
  status: string
  contrast_invoice_id: string | null
}

interface ExpenseTx {
  id: string
  name: string | null
  amount: number    // INR
  date: string
  is_contrast_billed: boolean
  contrast_billing_category_id: string | null
  contrast_invoice_id: string | null
  billing_category: { id: string; name: string } | null
  category: { id: string; name: string } | null
}

interface ManualLine {
  description: string
  amount: number    // EUR (entered directly)
}

interface Props {
  allExpenses: ExpenseTx[]        // categorized, unbilled
  allCourierBills: CourierBill[]
  payrollMonths: PayrollMonth[]
  companyName: string
  uncategorizedCount: number
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ContrastInvoiceClient({
  allExpenses, allCourierBills, payrollMonths, companyName, uncategorizedCount,
}: Props) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [finalizing, setFinalizing] = useState(false)
  const [invoiceData, setInvoiceData] = useState<ContrastInvoiceData | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)
  const [error, setError] = useState('')

  // Forex rate: INR per EUR (e.g. 92.50 means Rs. 92.50 = EUR 1)
  const [forexRate, setForexRate] = useState('')
  const forexRateNum = parseFloat(forexRate) || 0
  const hasValidRate = forexRateNum > 0

  // Manual EUR lines (staff paid / not in system)
  const [manualLines, setManualLines] = useState<ManualLine[]>([])
  const [newDesc, setNewDesc] = useState('')
  const [newAmount, setNewAmount] = useState('')

  // Selection state — all items selected by default
  const [selectedCourierIds, setSelectedCourierIds] = useState<Set<string>>(
    () => new Set(allCourierBills.map(b => b.id))
  )
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set(payrollMonths[0]?.entries?.map(e => e.id) ?? [])
  )

  const allCouriers = allCourierBills
  // Most recent payroll month (finalized or not — invoice comes before finalization)
  const latestPayroll = payrollMonths.length > 0 ? payrollMonths[0] : null

  // Selected subsets (what actually goes into the invoice)
  const selectedCouriers = useMemo(
    () => allCouriers.filter(b => selectedCourierIds.has(b.id)),
    [allCouriers, selectedCourierIds]
  )
  const selectedEntries = useMemo(
    () => (latestPayroll?.entries ?? []).filter(e => selectedEntryIds.has(e.id)),
    [latestPayroll, selectedEntryIds]
  )

  const toggleCourier = (id: string) =>
    setSelectedCourierIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleEntry = (id: string) =>
    setSelectedEntryIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  // Expenses grouped by billing category
  const expenseByCategory = useMemo(() => {
    const map: Record<string, { name: string; amountInr: number; ids: string[] }> = {}
    for (const e of allExpenses) {
      const key = e.contrast_billing_category_id!
      const name = e.billing_category?.name ?? 'Uncategorized'
      if (!map[key]) map[key] = { name, amountInr: 0, ids: [] }
      map[key].amountInr += e.amount
      map[key].ids.push(e.id)
    }
    return Object.values(map)
  }, [allExpenses])

  // ── EUR Totals (based on selected items only) ─────────────────────────────
  // Salaries: already in EUR (salary_euro field)
  const salaryEurTotal = useMemo(() =>
    selectedEntries.reduce((s, e) => s + (e.salary_euro || 0), 0),
    [selectedEntries]
  )
  // INR totals (for display / reference)
  const courierInrTotal = useMemo(() => selectedCouriers.reduce((s, b) => s + b.amount, 0), [selectedCouriers])
  const expenseInrTotal = useMemo(() => allExpenses.reduce((s, e) => s + e.amount, 0), [allExpenses])
  // EUR conversions
  const courierEurTotal = hasValidRate ? round2(courierInrTotal / forexRateNum) : 0
  const expenseEurTotal = hasValidRate ? round2(expenseInrTotal / forexRateNum) : 0
  const manualEurTotal  = useMemo(() => manualLines.reduce((s, l) => s + l.amount, 0), [manualLines])
  const subtotalEur     = salaryEurTotal + courierEurTotal + expenseEurTotal + manualEurTotal
  const gstEur          = round2(subtotalEur * 0.18)
  const grandTotalEur   = round2(subtotalEur + gstEur)

  // ── Manual line helpers ───────────────────────────────────────────────────
  const addManualLine = () => {
    const amt = parseFloat(newAmount)
    if (!newDesc.trim() || isNaN(amt) || amt <= 0) return
    setManualLines(prev => [...prev, { description: newDesc.trim(), amount: amt }])
    setNewDesc('')
    setNewAmount('')
  }
  const removeManualLine = (i: number) => setManualLines(prev => prev.filter((_, idx) => idx !== i))

  // ── Finalize: create + finalize invoice in one shot ───────────────────────
  const handleFinalize = async () => {
    if (!hasValidRate && (selectedCouriers.length > 0 || allExpenses.length > 0)) {
      setError('Enter the forex rate (INR per EUR) to convert courier charges and expenses.')
      return
    }
    setFinalizing(true)
    setError('')
    try {
      // Step 1: Create draft invoice record
      const createRes = await fetch('/api/contrast/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_month: currentMonth }),
      })
      if (!createRes.ok) throw new Error((await createRes.json()).error ?? 'Failed to create invoice')
      const inv = await createRes.json()

      // Step 2: Build items snapshot (amounts stored as EUR in amount_inr field)
      let sortOrder = 0
      const items: ContrastInvoiceData['items'] = []

      // Salary lines — EUR direct from salary_euro (selected entries only)
      for (const entry of selectedEntries) {
        items.push({
          item_type: 'salary',
          description: `Salary for ${entry.employee.name}`,
          salary_euro: entry.salary_euro,
          amount_inr: round2(entry.salary_euro || 0),   // stores EUR
          sort_order: sortOrder++,
        })
      }

      // Courier lines — INR converted to EUR (selected bills only)
      for (const bill of selectedCouriers) {
        const eurAmt = round2(bill.amount / forexRateNum)
        items.push({
          item_type: 'courier',
          description: `Courier Charges${bill.name ? ` – ${bill.name}` : ''}`,
          amount_inr: eurAmt,          // stores EUR
          inr_source: bill.amount,     // display only — stripped before DB insert
          forex_rate: forexRateNum,    // display only — stripped before DB insert
          sort_order: sortOrder++,
        })
      }

      // Expense lines — INR converted to EUR, grouped by billing category
      for (const cat of expenseByCategory) {
        const eurAmt = round2(cat.amountInr / forexRateNum)
        items.push({
          item_type: 'expense',
          description: cat.name,
          amount_inr: eurAmt,          // stores EUR
          inr_source: cat.amountInr,   // display only
          forex_rate: forexRateNum,    // display only
          sort_order: sortOrder++,
        })
      }

      // Manual lines — EUR direct (user entered)
      for (const line of manualLines) {
        items.push({
          item_type: 'expense',
          description: line.description,
          amount_inr: line.amount,     // EUR
          sort_order: sortOrder++,
        })
      }

      // Step 3: Finalize immediately
      const finalRes = await fetch(`/api/contrast/invoices/${inv.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          transaction_ids: allExpenses.map(e => e.id),
          bill_ids: selectedCouriers.map(b => b.id),
          payroll_month_ids: latestPayroll && selectedEntries.length > 0 ? [latestPayroll.id] : [],
        }),
      })
      if (!finalRes.ok) throw new Error((await finalRes.json()).error ?? 'Finalize failed')

      setInvoiceData({
        invoice_number: inv.invoice_number,
        invoice_month: currentMonth,
        invoice_date: inv.invoice_date,
        items,
        subtotal: subtotalEur,
        gst_amount: gstEur,
        total: grandTotalEur,
        company_name: companyName,
        forex_rate: hasValidRate ? forexRateNum : undefined,
      })
      setIsFinalized(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFinalizing(false)
    }
  }

  const hasSalaries = selectedEntries.length > 0
  const hasAnything = allExpenses.length > 0 || selectedCouriers.length > 0 || hasSalaries || manualLines.length > 0
  const needsRate   = !hasValidRate && (selectedCouriers.length > 0 || allExpenses.length > 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <ReceiptText className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contrast Invoice</h1>
          <p className="text-sm text-gray-500">Invoice in EUR — salaries direct, expenses converted via forex rate.</p>
        </div>
      </div>

      {/* Uncategorized nudge */}
      {uncategorizedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="flex-1 text-sm text-amber-800">
            <strong>{uncategorizedCount} expense{uncategorizedCount !== 1 ? 's' : ''}</strong> have no billing category and won&apos;t be included.
          </p>
          <a href="/contrast" className="shrink-0 flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
            Go to Expenses <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* ── Forex Rate Input ──────────────────────────────────────────────────── */}
      <div className={`bg-white border rounded-2xl p-5 shadow-sm ${needsRate ? 'border-amber-300' : 'border-gray-100'}`}>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Forex Rate <span className="text-xs font-normal text-gray-400">(INR per EUR)</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Used to convert courier charges and expenses from INR to EUR. Salaries are already in EUR.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">1 EUR =</span>
              <input
                type="number"
                value={forexRate}
                onChange={e => setForexRate(e.target.value)}
                placeholder="e.g. 92.50"
                min="0"
                step="0.01"
                disabled={isFinalized}
                className="w-36 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 disabled:opacity-50"
              />
              <span className="text-sm text-gray-500">INR</span>
              {hasValidRate && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                  ✓ EUR 1 = Rs. {forexRateNum.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          {(allCouriers.length > 0 || allExpenses.length > 0) && hasValidRate && (
            <div className="text-right text-xs text-gray-400 space-y-0.5 pb-2">
              {allCouriers.length > 0 && <p>{fmtInr(courierInrTotal)} → {fmtEur(courierEurTotal)}</p>}
              {allExpenses.length > 0 && <p>{fmtInr(expenseInrTotal)} → {fmtEur(expenseEurTotal)}</p>}
            </div>
          )}
        </div>
        {needsRate && (
          <p className="mt-2 text-xs text-amber-600">
            ⚠ Enter the forex rate to see EUR amounts for courier and expense lines.
          </p>
        )}
      </div>

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* Salaries — already in EUR */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-indigo-50">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-700">Salaries</span>
            {latestPayroll && (
              <span className="text-xs text-indigo-400 ml-1">({monthLabel(latestPayroll.payroll_month)})</span>
            )}
            {latestPayroll && !latestPayroll.is_finalized && (
              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg ml-1">
                <AlertCircle className="w-3 h-3" />
                Not yet finalized — finalize after receiving Contrast payment
              </span>
            )}
            <span className="ml-auto text-sm font-bold text-indigo-700">{fmtEur(salaryEurTotal)}</span>
          </div>
          {!latestPayroll ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-gray-400">
              <Info className="w-4 h-4 text-gray-300" />
              No payroll month found. Set up staff in Monthly Processing first.
            </div>
          ) : (latestPayroll.entries ?? []).length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-gray-400">
              <Info className="w-4 h-4 text-gray-300" />
              No entries for {monthLabel(latestPayroll.payroll_month)} — process payroll first.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {latestPayroll.entries.map(entry => {
                const checked = selectedEntryIds.has(entry.id)
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center px-5 py-3 gap-4 cursor-pointer hover:bg-gray-50 transition-colors ${!checked ? 'opacity-40' : ''}`}
                    onClick={() => !isFinalized && toggleEntry(entry.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEntry(entry.id)}
                      disabled={isFinalized}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                    <span className="flex-1 text-sm text-gray-800">Salary for {entry.employee.name}</span>
                    <span className="text-xs text-gray-400">EUR salary</span>
                    <span className="text-sm font-medium text-gray-900 w-32 text-right">
                      {fmtEur(entry.salary_euro || 0)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Courier charges — INR → EUR */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-blue-50">
            <Truck className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">Courier Charges</span>
            <span className="text-xs text-blue-400 ml-1">(all pending)</span>
            {hasValidRate && allCouriers.length > 0 && (
              <span className="text-xs text-blue-400 ml-1">· {fmtInr(courierInrTotal)} → <strong>{fmtEur(courierEurTotal)}</strong></span>
            )}
            <span className="ml-auto text-sm font-bold text-blue-700">
              {hasValidRate ? fmtEur(courierEurTotal) : fmtInr(courierInrTotal)}
            </span>
          </div>
          {allCouriers.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No pending courier charges linked to Contrast.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {allCouriers.map(bill => {
                const checked = selectedCourierIds.has(bill.id)
                return (
                  <div
                    key={bill.id}
                    className={`flex items-center px-5 py-3 gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${!checked ? 'opacity-40' : ''}`}
                    onClick={() => !isFinalized && toggleCourier(bill.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCourier(bill.id)}
                      disabled={isFinalized}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                    <span className="flex-1 text-sm text-gray-800">{bill.name || 'Courier Charge'}</span>
                    <span className="text-xs text-gray-400">{bill.due_date}</span>
                    <span className="text-sm text-gray-500 w-28 text-right">{fmtInr(bill.amount)}</span>
                    {hasValidRate && (
                      <span className="text-sm font-medium text-gray-900 w-28 text-right">
                        {fmtEur(round2(bill.amount / forexRateNum))}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Operational expenses — INR → EUR */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-purple-50">
            <FileText className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700">Operational Expenses</span>
            <span className="text-xs text-purple-400 ml-1">({allExpenses.length} queued)</span>
            {hasValidRate && allExpenses.length > 0 && (
              <span className="text-xs text-purple-400 ml-1">· {fmtInr(expenseInrTotal)} → <strong>{fmtEur(expenseEurTotal)}</strong></span>
            )}
            <span className="ml-auto text-sm font-bold text-purple-700">
              {hasValidRate ? fmtEur(expenseEurTotal) : fmtInr(expenseInrTotal)}
            </span>
          </div>
          {allExpenses.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">
              No expenses queued.{' '}
              <a href="/contrast" className="text-indigo-600 hover:underline">Assign billing categories</a> to queue them.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenseByCategory.map((cat, i) => (
                <div key={i} className="flex items-center px-5 py-3">
                  <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                  <span className="text-xs text-gray-400 mr-4">{cat.ids.length} tx</span>
                  <span className="text-sm text-gray-500 w-28 text-right">{fmtInr(cat.amountInr)}</span>
                  {hasValidRate && (
                    <span className="text-sm font-medium text-gray-900 w-28 text-right">
                      {fmtEur(round2(cat.amountInr / forexRateNum))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual / additional lines — entered in EUR */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-orange-50">
            <Plus className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">Additional Items</span>
            <span className="text-xs text-orange-400 ml-1">(enter in EUR)</span>
            <span className="ml-auto text-sm font-bold text-orange-700">{fmtEur(manualEurTotal)}</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addManualLine()}
                  placeholder="e.g. Office supplies paid by staff"
                  disabled={isFinalized}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 disabled:opacity-50"
                />
              </div>
              <div className="w-36">
                <label className="block text-xs text-gray-500 mb-1">Amount (EUR)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addManualLine()}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  disabled={isFinalized}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 disabled:opacity-50"
                />
              </div>
              <button
                onClick={addManualLine}
                disabled={!newDesc.trim() || !newAmount || parseFloat(newAmount) <= 0 || isFinalized}
                className="flex items-center gap-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            {manualLines.length > 0 ? (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {manualLines.map((line, i) => (
                  <div key={i} className="flex items-center px-4 py-2.5 gap-3">
                    <span className="flex-1 text-sm text-gray-800">{line.description}</span>
                    <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtEur(line.amount)}</span>
                    {!isFinalized && (
                      <button onClick={() => removeManualLine(i)} className="text-gray-300 hover:text-red-400 transition-colors ml-1">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Add EUR amounts for items not tracked in Contrast Expenses.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── EUR Grand Total ───────────────────────────────────────────────────── */}
      {hasAnything && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {salaryEurTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Salaries</span><span>{fmtEur(salaryEurTotal)}</span>
              </div>
            )}
            {selectedCouriers.length > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Courier Charges</span>
                <span>{hasValidRate ? fmtEur(courierEurTotal) : <span className="text-amber-500">enter rate ↑</span>}</span>
              </div>
            )}
            {allExpenses.length > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Operational Expenses</span>
                <span>{hasValidRate ? fmtEur(expenseEurTotal) : <span className="text-amber-500">enter rate ↑</span>}</span>
              </div>
            )}
            {manualEurTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Additional Items</span><span>{fmtEur(manualEurTotal)}</span>
              </div>
            )}
            <div className="flex justify-between px-5 py-3 text-sm font-medium text-gray-700">
              <span>Sub Total</span><span>{fmtEur(subtotalEur)}</span>
            </div>
            <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
              <span>GST @ 18%</span><span>{fmtEur(gstEur)}</span>
            </div>
            <div className="flex justify-between px-5 py-4 text-base font-bold text-gray-900 bg-gray-50">
              <span>Grand Total</span><span>{fmtEur(grandTotalEur)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
          <p className="text-sm text-red-700">{error}</p>
          <p className="text-xs text-red-500">
            If expenses disappeared but no PDF was shown, check{' '}
            <a href="/contrast/history" className="underline font-medium">Invoice History</a>
            {' '}— the invoice may have saved successfully despite the error.
            If it&apos;s not there, go to{' '}
            <a href="/contrast" className="underline font-medium">Contrast Expenses</a>
            {' '}and use &quot;Mark unbilled&quot; to restore any affected transactions.
          </p>
        </div>
      )}

      {/* ── Action ───────────────────────────────────────────────────────────── */}
      {!hasAnything ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-400">
          Nothing to invoice.{' '}
          <a href="/contrast" className="text-indigo-600 hover:underline">Assign billing categories</a> to queue expenses.
        </div>
      ) : isFinalized ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            Invoice finalized — all items marked as billed. Finalize payroll after receiving payment.
          </div>
          <div className="flex items-center gap-3">
            <ContrastInvoicePDFDownload
              data={invoiceData!}
              label="Download PDF"
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all"
            />
            <a href="/contrast/history" className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
              View Invoice History →
            </a>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={handleFinalize}
            disabled={finalizing || (needsRate)}
            title={needsRate ? 'Enter forex rate above to proceed' : undefined}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
          >
            {finalizing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ReceiptText className="w-4 h-4" />
            }
            {finalizing ? 'Finalizing…' : 'Finalize Invoice'}
          </button>
          {needsRate ? (
            <p className="text-xs text-amber-600">Enter forex rate to enable</p>
          ) : (
            <p className="text-xs text-gray-400">
              Saves invoice · marks all items billed · generates EUR PDF
            </p>
          )}
        </div>
      )}
    </div>
  )
}
