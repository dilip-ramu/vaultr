'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  CheckCircle2, AlertCircle, Loader2,
  Users, Truck, ReceiptText, FileText, Info, Plus, X, ArrowRight, Building2, Minus,
} from 'lucide-react'
import type { ReimbursableInvoiceData } from './ReimbursableInvoicePDF'

const ReimbursableInvoicePDFDownload = dynamic(() => import('./ReimbursableInvoicePDFDownload'), { ssr: false })

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
interface Employee {
  id: string
  name: string
  salary_amount: number
  designation?: string | null
}

interface CourierInvoice {
  id: string
  invoice_number: string
  total: number      // INR
  invoice_date: string
  status: string
  customer_name?: string
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
  amount: number    // EUR
}

interface FixedExpenseRow {
  id: string
  description: string
  amount: number    // EUR
}

interface DeductionRow {
  id: string
  description: string
  amount: number    // EUR (positive; stored as negative in items)
}

const DEFAULT_FIXED_EXPENSES: FixedExpenseRow[] = [
  { id: 'rent',         description: 'Office Rent',   amount: 709.50 },
  { id: 'housekeeping', description: 'House Keeping', amount: 205.06 },
  { id: 'internet',     description: 'Internet',      amount: 224.09 },
  { id: 'electricity',  description: 'Electricity',   amount: 109.82 },
  { id: 'bank_charges', description: 'Bank Charges',  amount: 78 },
]

interface Props {
  employees: Employee[]
  courierInvoices: CourierInvoice[]
  allExpenses: ExpenseTx[]
  companyName: string
  uncategorizedCount: number
  customerId?: string | null
  customerName?: string
  /** Currency the customer is billed in (e.g. EUR, USD). Drives all labels. */
  billingCurrency?: string
  /** Latest market rate from currency_rates for the billing currency. Shown
   *  as a hint next to the rate input so the user has a reference. */
  marketRate?: number | null
  marketRateAsOf?: string | null
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ReimbursableInvoiceClient({
  employees, courierInvoices, allExpenses, companyName, uncategorizedCount,
  customerId = null, customerName = 'Contrast',
  billingCurrency = 'INR', marketRate = null, marketRateAsOf = null,
}: Props) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [finalizing, setFinalizing] = useState(false)
  const [invoiceData, setInvoiceData] = useState<ReimbursableInvoiceData | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)
  const [error, setError] = useState('')

  // Forex rate: INR per EUR
  const [forexRate, setForexRate] = useState('')
  const forexRateNum = parseFloat(forexRate) || 0
  const hasValidRate = forexRateNum > 0

  // Manual EUR lines
  const [manualLines, setManualLines] = useState<ManualLine[]>([])
  const [newDesc, setNewDesc] = useState('')
  const [newAmount, setNewAmount] = useState('')

  // Fixed expenses (editable EUR amounts, pre-populated)
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseRow[]>(DEFAULT_FIXED_EXPENSES)

  // Deductions
  const [deductions, setDeductions] = useState<DeductionRow[]>([])
  const [newDedDesc, setNewDedDesc] = useState('')
  const [newDedAmount, setNewDedAmount] = useState('')

  // ── Selection state — all items selected by default ───────────────────────
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    () => new Set(employees.map(e => e.id))
  )
  const [selectedCourierIds, setSelectedCourierIds] = useState<Set<string>>(
    () => new Set(courierInvoices.map(ci => ci.id))
  )

  const selectedEmployees = useMemo(
    () => employees.filter(e => selectedEmployeeIds.has(e.id)),
    [employees, selectedEmployeeIds]
  )
  const selectedCouriers = useMemo(
    () => courierInvoices.filter(ci => selectedCourierIds.has(ci.id)),
    [courierInvoices, selectedCourierIds]
  )

  const toggleEmployee = (id: string) =>
    setSelectedEmployeeIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleCourier = (id: string) =>
    setSelectedCourierIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  // ── Expenses grouped by billing category ─────────────────────────────────
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

  // ── EUR Totals ─────────────────────────────────────────────────────────────
  const salaryEurTotal  = useMemo(() => selectedEmployees.reduce((s, e) => s + (e.salary_amount || 0), 0), [selectedEmployees])
  const courierInrTotal = useMemo(() => selectedCouriers.reduce((s, ci) => s + ci.total, 0), [selectedCouriers])
  const expenseInrTotal = useMemo(() => allExpenses.reduce((s, e) => s + e.amount, 0), [allExpenses])
  const courierEurTotal = hasValidRate ? round2(courierInrTotal / forexRateNum) : 0
  const expenseEurTotal = hasValidRate ? round2(expenseInrTotal / forexRateNum) : 0
  const manualEurTotal  = useMemo(() => manualLines.reduce((s, l) => s + l.amount, 0), [manualLines])
  const fixedExpTotal   = useMemo(() => fixedExpenses.reduce((s, r) => s + (r.amount || 0), 0), [fixedExpenses])
  const deductionTotal  = useMemo(() => deductions.reduce((s, r) => s + (r.amount || 0), 0), [deductions])
  const subtotalEur     = salaryEurTotal + courierEurTotal + expenseEurTotal + manualEurTotal + fixedExpTotal - deductionTotal
  const gstEur          = round2(subtotalEur * 0.18)
  const grandTotalEur   = round2(subtotalEur + gstEur)

  // ── Helpers ───────────────────────────────────────────────────────────────
  const addManualLine = () => {
    const amt = parseFloat(newAmount)
    if (!newDesc.trim() || isNaN(amt) || amt <= 0) return
    setManualLines(prev => [...prev, { description: newDesc.trim(), amount: amt }])
    setNewDesc(''); setNewAmount('')
  }
  const removeManualLine = (i: number) => setManualLines(prev => prev.filter((_, idx) => idx !== i))

  const updateFixedExpense = (id: string, amount: number) =>
    setFixedExpenses(prev => prev.map(r => r.id === id ? { ...r, amount } : r))

  const addDeduction = () => {
    const amt = parseFloat(newDedAmount)
    if (!newDedDesc.trim() || isNaN(amt) || amt <= 0) return
    setDeductions(prev => [...prev, { id: `ded-${Date.now()}`, description: newDedDesc.trim(), amount: amt }])
    setNewDedDesc(''); setNewDedAmount('')
  }
  const removeDeduction = (id: string) => setDeductions(prev => prev.filter(r => r.id !== id))

  // ── Finalize ──────────────────────────────────────────────────────────────
  const handleFinalize = async () => {
    if (!hasValidRate && (selectedCouriers.length > 0 || allExpenses.length > 0)) {
      setError('Enter the forex rate (INR per EUR) to convert courier charges and expenses.')
      return
    }
    setFinalizing(true)
    setError('')
    try {
      const createRes = await fetch('/api/contrast/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Multi-customer: tag the new invoice with the customer being billed.
        body: JSON.stringify({ invoice_month: currentMonth, customer_id: customerId }),
      })
      if (!createRes.ok) throw new Error((await createRes.json()).error ?? 'Failed to create invoice')
      const inv = await createRes.json()

      let sortOrder = 0
      const items: ReimbursableInvoiceData['items'] = []

      for (const emp of selectedEmployees) {
        items.push({ item_type: 'salary', description: `Salary for ${emp.name}`, salary_amount: emp.salary_amount, amount_inr: round2(emp.salary_amount || 0), sort_order: sortOrder++ })
      }
      for (const ci of selectedCouriers) {
        const eurAmt = round2(ci.total / forexRateNum)
        items.push({ item_type: 'courier', description: `Courier Invoice ${ci.invoice_number}`, amount_inr: eurAmt, inr_source: ci.total, forex_rate: forexRateNum, sort_order: sortOrder++ })
      }
      for (const cat of expenseByCategory) {
        const eurAmt = round2(cat.amountInr / forexRateNum)
        items.push({ item_type: 'expense', description: cat.name, amount_inr: eurAmt, inr_source: cat.amountInr, forex_rate: forexRateNum, sort_order: sortOrder++ })
      }
      for (const fe of fixedExpenses) {
        if ((fe.amount || 0) > 0) {
          items.push({ item_type: 'fixed_expense', description: fe.description, amount_inr: round2(fe.amount), sort_order: sortOrder++ })
        }
      }
      for (const line of manualLines) {
        items.push({ item_type: 'expense', description: line.description, amount_inr: line.amount, sort_order: sortOrder++ })
      }
      for (const ded of deductions) {
        if ((ded.amount || 0) > 0) {
          items.push({ item_type: 'deduction', description: ded.description, amount_inr: -round2(ded.amount), sort_order: sortOrder++ })
        }
      }

      const finalRes = await fetch(`/api/contrast/invoices/${inv.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          transaction_ids: allExpenses.map(e => e.id),
          recoverable_invoice_ids: selectedCouriers.map(ci => ci.id),
          salary_employees: selectedEmployees.map(e => ({ employee_id: e.id, salary_amount: e.salary_amount })),
          invoice_month: currentMonth,
        }),
      })
      if (!finalRes.ok) throw new Error((await finalRes.json()).error ?? 'Finalize failed')

      setInvoiceData({ invoice_number: inv.invoice_number, invoice_month: currentMonth, invoice_date: inv.invoice_date, items, subtotal: subtotalEur, gst_amount: gstEur, total: grandTotalEur, company_name: companyName, forex_rate: hasValidRate ? forexRateNum : undefined })
      setIsFinalized(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFinalizing(false)
    }
  }

  const hasSalaries = selectedEmployees.length > 0
  const hasAnything = allExpenses.length > 0 || selectedCouriers.length > 0 || hasSalaries || manualLines.length > 0 || fixedExpTotal > 0 || deductions.length > 0
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
          <p className="text-sm text-gray-500">
            Invoice for <strong>{monthLabel(currentMonth)}</strong> · EUR · salaries direct, expenses via forex rate
          </p>
        </div>
      </div>

      {/* Uncategorized nudge */}
      {uncategorizedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="flex-1 text-sm text-amber-800">
            <strong>{uncategorizedCount} expense{uncategorizedCount !== 1 ? 's' : ''}</strong> have no billing category and won&apos;t be included.
          </p>
          <a href="/customers/reimbursables" className="shrink-0 flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
            Go to Expenses <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* ── Forex Rate ── */}
      <div className={`bg-white border rounded-2xl p-5 shadow-sm ${needsRate ? 'border-amber-300' : 'border-gray-100'}`}>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Forex Rate <span className="text-xs font-normal text-gray-400">(INR per {billingCurrency})</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Used to convert courier charges and expenses from INR to {billingCurrency}. Salaries and fixed expenses are already in {billingCurrency}.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">1 {billingCurrency} =</span>
              <input
                type="number" value={forexRate} onChange={e => setForexRate(e.target.value)}
                placeholder={marketRate ? marketRate.toFixed(2) : 'e.g. 92.50'} min="0" step="0.01" disabled={isFinalized}
                className="w-36 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 disabled:opacity-50"
              />
              <span className="text-sm text-gray-500">INR</span>
              {hasValidRate && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                  ✓ {billingCurrency} 1 = Rs. {forexRateNum.toFixed(2)}
                </span>
              )}
              {marketRate != null && (
                <button
                  type="button"
                  onClick={() => !isFinalized && setForexRate(String(marketRate))}
                  disabled={isFinalized}
                  className="text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                  title="Tap to use the current market rate"
                >
                  Market: 1 {billingCurrency} = ₹{marketRate.toFixed(2)}
                  {marketRateAsOf && (
                    <span className="ml-1 text-blue-500">
                      ({new Date(marketRateAsOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
                    </span>
                  )}
                </button>
              )}
            </div>
            {marketRate == null && (
              <p className="text-xs text-gray-400 mt-1.5">
                No market rate stored for {billingCurrency}. Set one in <a href="/setup/currencies" className="text-blue-600 hover:underline">Setup → Currencies</a> if you want a reference.
              </p>
            )}
          </div>
          {(selectedCouriers.length > 0 || allExpenses.length > 0) && hasValidRate && (
            <div className="text-right text-xs text-gray-400 space-y-0.5 pb-2">
              {selectedCouriers.length > 0 && <p>{fmtInr(courierInrTotal)} → {fmtEur(courierEurTotal)}</p>}
              {allExpenses.length > 0 && <p>{fmtInr(expenseInrTotal)} → {fmtEur(expenseEurTotal)}</p>}
            </div>
          )}
        </div>
        {needsRate && <p className="mt-2 text-xs text-amber-600">⚠ Enter the forex rate to see EUR amounts for courier and expense lines.</p>}
      </div>

      {/* ── Sections ── */}
      <div className="space-y-3">

        {/* Salaries */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-indigo-50">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-700">Salaries</span>
            <span className="text-xs text-indigo-400 ml-1">({employees.length} active staff)</span>
            <span className="text-xs text-indigo-300 ml-1">· payroll month auto-created on finalize</span>
            <span className="ml-auto text-sm font-bold text-indigo-700">{fmtEur(salaryEurTotal)}</span>
          </div>
          {employees.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-gray-400">
              <Info className="w-4 h-4 text-gray-300" />
              No active staff found.{' '}
              <a href="/payroll/staff" className="text-indigo-600 hover:underline ml-1">Add staff in Staff Particulars →</a>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {employees.map(emp => {
                const checked = selectedEmployeeIds.has(emp.id)
                return (
                  <div key={emp.id} className={`flex items-center px-5 py-3 gap-4 cursor-pointer hover:bg-gray-50 transition-colors ${!checked ? 'opacity-40' : ''}`} onClick={() => !isFinalized && toggleEmployee(emp.id)}>
                    <input type="checkbox" checked={checked} onChange={() => toggleEmployee(emp.id)} disabled={isFinalized} onClick={e => e.stopPropagation()} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{emp.name}</p>
                      {emp.designation && <p className="text-xs text-gray-400">{emp.designation}</p>}
                    </div>
                    <span className="text-xs text-gray-400">EUR salary</span>
                    <span className="text-sm font-medium text-gray-900 w-32 text-right">{fmtEur(emp.salary_amount || 0)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Courier charges */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-blue-50">
            <Truck className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">Courier Charges</span>
            <span className="text-xs text-blue-400 ml-1">(from Recoverables — Contrast invoices)</span>
            {hasValidRate && selectedCouriers.length > 0 && (
              <span className="text-xs text-blue-400 ml-1">· {fmtInr(courierInrTotal)} → <strong>{fmtEur(courierEurTotal)}</strong></span>
            )}
            <span className="ml-auto text-sm font-bold text-blue-700">{hasValidRate ? fmtEur(courierEurTotal) : fmtInr(courierInrTotal)}</span>
          </div>
          {courierInvoices.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">
              No pending courier invoices for Contrast.{' '}
              <a href="/recoverables" className="text-indigo-600 hover:underline">Create in Recoverables →</a>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {courierInvoices.map(ci => {
                const checked = selectedCourierIds.has(ci.id)
                return (
                  <div key={ci.id} className={`flex items-center px-5 py-3 gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${!checked ? 'opacity-40' : ''}`} onClick={() => !isFinalized && toggleCourier(ci.id)}>
                    <input type="checkbox" checked={checked} onChange={() => toggleCourier(ci.id)} disabled={isFinalized} onClick={e => e.stopPropagation()} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{ci.invoice_number}</p>
                      <p className="text-xs text-gray-400">{ci.invoice_date} · {ci.status}</p>
                    </div>
                    <span className="text-sm text-gray-500 w-28 text-right">{fmtInr(ci.total)}</span>
                    {hasValidRate && <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtEur(round2(ci.total / forexRateNum))}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Operational expenses */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-purple-50">
            <FileText className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700">Operational Expenses</span>
            <span className="text-xs text-purple-400 ml-1">({allExpenses.length} queued)</span>
            {hasValidRate && allExpenses.length > 0 && (
              <span className="text-xs text-purple-400 ml-1">· {fmtInr(expenseInrTotal)} → <strong>{fmtEur(expenseEurTotal)}</strong></span>
            )}
            <span className="ml-auto text-sm font-bold text-purple-700">{hasValidRate ? fmtEur(expenseEurTotal) : fmtInr(expenseInrTotal)}</span>
          </div>
          {allExpenses.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">
              No expenses queued.{' '}
              <a href="/customers/reimbursables" className="text-indigo-600 hover:underline">Assign billing categories</a> to queue them.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenseByCategory.map((cat, i) => (
                <div key={i} className="flex items-center px-5 py-3">
                  <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                  <span className="text-xs text-gray-400 mr-4">{cat.ids.length} tx</span>
                  <span className="text-sm text-gray-500 w-28 text-right">{fmtInr(cat.amountInr)}</span>
                  {hasValidRate && <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtEur(round2(cat.amountInr / forexRateNum))}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Expenses */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-teal-50">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-semibold text-teal-700">Fixed Expenses</span>
            <span className="text-xs text-teal-400 ml-1">(enter in EUR)</span>
            <span className="ml-auto text-sm font-bold text-teal-700">{fmtEur(fixedExpTotal)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {fixedExpenses.map(fe => (
              <div key={fe.id} className="flex items-center px-5 py-2.5 gap-4">
                <span className="flex-1 text-sm text-gray-800">{fe.description}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">EUR</span>
                  <input
                    type="number"
                    value={fe.amount === 0 ? '' : fe.amount}
                    onChange={e => updateFixedExpense(fe.id, parseFloat(e.target.value) || 0)}
                    placeholder="0.00" min="0" step="0.01" disabled={isFinalized}
                    className="w-32 px-3 py-1.5 text-sm text-right border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 disabled:opacity-50"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional / manual items */}
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
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualLine()} placeholder="e.g. Office supplies paid by staff" disabled={isFinalized} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 disabled:opacity-50" />
              </div>
              <div className="w-36">
                <label className="block text-xs text-gray-500 mb-1">Amount (EUR)</label>
                <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualLine()} placeholder="0.00" min="0" step="0.01" disabled={isFinalized} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 disabled:opacity-50" />
              </div>
              <button onClick={addManualLine} disabled={!newDesc.trim() || !newAmount || parseFloat(newAmount) <= 0 || isFinalized} className="flex items-center gap-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-40">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            {manualLines.length > 0 ? (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {manualLines.map((line, i) => (
                  <div key={i} className="flex items-center px-4 py-2.5 gap-3">
                    <span className="flex-1 text-sm text-gray-800">{line.description}</span>
                    <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtEur(line.amount)}</span>
                    {!isFinalized && <button onClick={() => removeManualLine(i)} className="text-gray-300 hover:text-red-400 transition-colors ml-1"><X className="w-4 h-4" /></button>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Add EUR amounts for items not tracked in the system.</p>
            )}
          </div>
        </div>

        {/* Deductions */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-red-50">
            <Minus className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-600">Deductions</span>
            <span className="text-xs text-red-400 ml-1">(subtracted from total · enter in EUR)</span>
            {deductionTotal > 0 && (
              <span className="ml-auto text-sm font-bold text-red-600">− {fmtEur(deductionTotal)}</span>
            )}
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input type="text" value={newDedDesc} onChange={e => setNewDedDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDeduction()} placeholder="e.g. Advance adjustment" disabled={isFinalized} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 disabled:opacity-50" />
              </div>
              <div className="w-36">
                <label className="block text-xs text-gray-500 mb-1">Amount (EUR)</label>
                <input type="number" value={newDedAmount} onChange={e => setNewDedAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDeduction()} placeholder="0.00" min="0" step="0.01" disabled={isFinalized} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 disabled:opacity-50" />
              </div>
              <button onClick={addDeduction} disabled={!newDedDesc.trim() || !newDedAmount || parseFloat(newDedAmount) <= 0 || isFinalized} className="flex items-center gap-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-40">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            {deductions.length > 0 ? (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {deductions.map(ded => (
                  <div key={ded.id} className="flex items-center px-4 py-2.5 gap-3">
                    <span className="flex-1 text-sm text-gray-800">{ded.description}</span>
                    <span className="text-sm font-medium text-red-600 w-28 text-right">− {fmtEur(ded.amount)}</span>
                    {!isFinalized && <button onClick={() => removeDeduction(ded.id)} className="text-gray-300 hover:text-red-400 transition-colors ml-1"><X className="w-4 h-4" /></button>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Add deductions to subtract from the invoice total (e.g. advance adjustments).</p>
            )}
          </div>
        </div>

      </div>

      {/* ── EUR Grand Total ── */}
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
            {fixedExpTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Fixed Expenses</span><span>{fmtEur(fixedExpTotal)}</span>
              </div>
            )}
            {manualEurTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Additional Items</span><span>{fmtEur(manualEurTotal)}</span>
              </div>
            )}
            {deductionTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-red-600">
                <span>Deductions</span><span>− {fmtEur(deductionTotal)}</span>
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
            If items disappeared but no PDF was shown, check{' '}
            <a href="/customers/reimbursables/invoices" className="underline font-medium">Invoice History</a>
            {' '}— the invoice may have saved despite the error.
            If not there, go to{' '}
            <a href="/customers/reimbursables" className="underline font-medium">Contrast Expenses</a>
            {' '}and use &quot;Mark unbilled&quot; to restore transactions.
          </p>
        </div>
      )}

      {/* ── Action ── */}
      {!hasAnything ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-400">
          Nothing to invoice.{' '}
          <a href="/customers/reimbursables" className="text-indigo-600 hover:underline">Assign billing categories</a> to queue expenses.
        </div>
      ) : isFinalized ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            Invoice finalized — payroll month created, all items marked as billed. Finalize payroll after receiving payment.
          </div>
          <div className="flex items-center gap-3">
            <ReimbursableInvoicePDFDownload
              data={invoiceData!}
              label="Download PDF"
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all"
            />
            <a href="/customers/reimbursables/invoices" className="text-sm text-gray-500 hover:text-gray-700 hover:underline">View Invoice History →</a>
            <a href="/payroll/monthly" className="text-sm text-gray-500 hover:text-gray-700 hover:underline">Monthly Processing →</a>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={handleFinalize}
            disabled={finalizing || needsRate}
            title={needsRate ? 'Enter forex rate above to proceed' : undefined}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
          >
            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
            {finalizing ? 'Finalizing…' : 'Finalize Invoice'}
          </button>
          {needsRate ? (
            <p className="text-xs text-amber-600">Enter forex rate to enable</p>
          ) : (
            <p className="text-xs text-gray-400">Saves invoice · marks items billed · auto-creates payroll month · generates PDF</p>
          )}
        </div>
      )}
    </div>
  )
}
