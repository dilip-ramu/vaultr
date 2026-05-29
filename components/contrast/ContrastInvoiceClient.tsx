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

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

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
  amount: number
  due_date: string
  status: string
  contrast_invoice_id: string | null
}

interface ExpenseTx {
  id: string
  name: string | null
  amount: number
  date: string
  is_contrast_billed: boolean
  contrast_billing_category_id: string | null
  contrast_invoice_id: string | null
  billing_category: { id: string; name: string } | null
  category: { id: string; name: string } | null
}

interface ManualLine {
  description: string
  amount: number
}

interface Props {
  allExpenses: ExpenseTx[]       // already filtered to categorized-only by the server
  allCourierBills: CourierBill[]
  payrollMonths: PayrollMonth[]
  companyName: string
  uncategorizedCount: number     // unbilled expenses with no billing category
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

  // Manual / ad-hoc lines (staff paid, not in system)
  const [manualLines, setManualLines] = useState<ManualLine[]>([])
  const [newDesc, setNewDesc] = useState('')
  const [newAmount, setNewAmount] = useState('')

  // All unbilled categorized expenses (carry-forward, no month filter)
  const allCouriers = allCourierBills

  // Most recent finalized payroll month (ordered payroll_month DESC)
  const latestPayroll = payrollMonths.length > 0 ? payrollMonths[0] : null

  // Expenses grouped by billing category
  const expenseByCategory = useMemo(() => {
    const map: Record<string, { name: string; amount: number; ids: string[] }> = {}
    for (const e of allExpenses) {
      const key = e.contrast_billing_category_id!
      const name = e.billing_category?.name ?? 'Uncategorized'
      if (!map[key]) map[key] = { name, amount: 0, ids: [] }
      map[key].amount += e.amount
      map[key].ids.push(e.id)
    }
    return Object.values(map)
  }, [allExpenses])

  // ── Totals ────────────────────────────────────────────────────────────────
  const salaryTotal  = useMemo(() => (latestPayroll?.entries ?? []).reduce((s, e) => s + e.final_payable, 0), [latestPayroll])
  const courierTotal = useMemo(() => allCouriers.reduce((s, b) => s + b.amount, 0), [allCouriers])
  const expenseTotal = useMemo(() => allExpenses.reduce((s, e) => s + e.amount, 0), [allExpenses])
  const manualTotal  = useMemo(() => manualLines.reduce((s, l) => s + l.amount, 0), [manualLines])
  const subtotal     = salaryTotal + courierTotal + expenseTotal + manualTotal
  const gstAmount    = Math.round(subtotal * 0.18 * 100) / 100
  const grandTotal   = subtotal + gstAmount

  // ── Manual line helpers ───────────────────────────────────────────────────
  const addManualLine = () => {
    const amt = parseFloat(newAmount)
    if (!newDesc.trim() || isNaN(amt) || amt <= 0) return
    setManualLines(prev => [...prev, { description: newDesc.trim(), amount: amt }])
    setNewDesc('')
    setNewAmount('')
  }

  const removeManualLine = (i: number) => setManualLines(prev => prev.filter((_, idx) => idx !== i))

  // ── Finalize (single action: create draft + finalize + PDF) ──────────────
  const handleFinalize = async () => {
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

      // Step 2: Build items snapshot
      let sortOrder = 0
      const items: ContrastInvoiceData['items'] = []

      for (const entry of (latestPayroll?.entries ?? [])) {
        items.push({
          item_type: 'salary',
          description: `Salary for ${entry.employee.name}`,
          salary_euro: entry.salary_euro,
          expended_rate: entry.expended_rate,
          amount_inr: entry.final_payable,
          sort_order: sortOrder++,
        })
      }
      for (const bill of allCouriers) {
        items.push({
          item_type: 'courier',
          description: `Courier Charges${bill.name ? ` – ${bill.name}` : ''}`,
          amount_inr: bill.amount,
          sort_order: sortOrder++,
        })
      }
      for (const cat of expenseByCategory) {
        items.push({
          item_type: 'expense',
          description: cat.name,
          amount_inr: cat.amount,
          sort_order: sortOrder++,
        })
      }
      for (const line of manualLines) {
        items.push({
          item_type: 'expense',
          description: line.description,
          amount_inr: line.amount,
          sort_order: sortOrder++,
        })
      }

      // Step 3: Finalize immediately — marks everything as billed
      const finalRes = await fetch(`/api/contrast/invoices/${inv.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          transaction_ids: allExpenses.map(e => e.id),
          bill_ids: allCouriers.map(b => b.id),
          payroll_month_ids: latestPayroll ? [latestPayroll.id] : [],
        }),
      })
      if (!finalRes.ok) throw new Error((await finalRes.json()).error ?? 'Finalize failed')

      // Step 4: Set invoice data for PDF download
      setInvoiceData({
        invoice_number: inv.invoice_number,
        invoice_month: currentMonth,
        invoice_date: inv.invoice_date,
        items,
        subtotal,
        gst_amount: gstAmount,
        total: grandTotal,
        company_name: companyName,
      })
      setIsFinalized(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFinalizing(false)
    }
  }

  const hasAnything =
    allExpenses.length > 0 ||
    allCouriers.length > 0 ||
    (latestPayroll?.entries?.length ?? 0) > 0 ||
    manualLines.length > 0

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
            Review items below, then click Finalize to save the invoice and mark everything as billed.
          </p>
        </div>
      </div>

      {/* Nudge: uncategorized expenses exist */}
      {uncategorizedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-800">
              <strong>{uncategorizedCount} expense{uncategorizedCount !== 1 ? 's' : ''}</strong> in Contrast Expenses
              {' '}have no billing category and won&apos;t be on this invoice.
              Assign a billing category to include them.
            </p>
          </div>
          <a
            href="/contrast"
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            Go to Expenses <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* Salaries */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-indigo-50">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-700">Salaries</span>
            {latestPayroll && (
              <span className="text-xs text-indigo-400 ml-1">
                ({monthLabel(latestPayroll.payroll_month)} — most recent)
              </span>
            )}
            <span className="ml-auto text-sm font-bold text-indigo-700">{fmtInr(salaryTotal)}</span>
          </div>
          {(latestPayroll?.entries ?? []).length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-gray-400">
              <Info className="w-4 h-4 text-gray-300" />
              No finalized payroll found. Finalize payroll in Monthly Processing first.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {latestPayroll!.entries.map(entry => (
                <div key={entry.id} className="flex items-center px-5 py-3 gap-4">
                  <span className="flex-1 text-sm text-gray-800">Salary for {entry.employee.name}</span>
                  <span className="text-xs text-gray-400">{entry.salary_euro} EUR @ {entry.expended_rate}</span>
                  <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtInr(entry.final_payable)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Courier charges */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-blue-50">
            <Truck className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">Courier Charges</span>
            <span className="text-xs text-blue-400 ml-1">(all pending)</span>
            <span className="ml-auto text-sm font-bold text-blue-700">{fmtInr(courierTotal)}</span>
          </div>
          {allCouriers.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No pending courier charges linked to Contrast.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {allCouriers.map(bill => (
                <div key={bill.id} className="flex items-center px-5 py-3">
                  <span className="flex-1 text-sm text-gray-800">{bill.name || 'Courier Charge'}</span>
                  <span className="text-xs text-gray-400 mr-4">{bill.due_date}</span>
                  <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtInr(bill.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Operational expenses (categorized only) */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-purple-50">
            <FileText className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700">Operational Expenses</span>
            <span className="text-xs text-purple-400 ml-1">
              ({allExpenses.length} queued from Contrast Expenses)
            </span>
            <span className="ml-auto text-sm font-bold text-purple-700">{fmtInr(expenseTotal)}</span>
          </div>
          {allExpenses.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">
              No expenses queued yet.{' '}
              <a href="/contrast" className="text-indigo-600 hover:underline">
                Assign billing categories in Contrast Expenses
              </a>
              {' '}to queue them here.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenseByCategory.map((cat, i) => (
                <div key={i} className="flex items-center px-5 py-3">
                  <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                  <span className="text-xs text-gray-400 mr-4">{cat.ids.length} tx</span>
                  <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtInr(cat.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual / additional lines */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-orange-50">
            <Plus className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">Additional Items</span>
            <span className="text-xs text-orange-400 ml-1">(paid by staff / not in system)</span>
            <span className="ml-auto text-sm font-bold text-orange-700">{fmtInr(manualTotal)}</span>
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
                <label className="block text-xs text-gray-500 mb-1">Amount (₹)</label>
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
                    <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtInr(line.amount)}</span>
                    {!isFinalized && (
                      <button onClick={() => removeManualLine(i)} className="text-gray-300 hover:text-red-400 transition-colors ml-1">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Add lines here for amounts not in Contrast Expenses — e.g., items a staff member paid for directly.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Grand total */}
      {hasAnything && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {salaryTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Salaries</span><span>{fmtInr(salaryTotal)}</span>
              </div>
            )}
            {courierTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Courier Charges</span><span>{fmtInr(courierTotal)}</span>
              </div>
            )}
            {expenseTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Operational Expenses</span><span>{fmtInr(expenseTotal)}</span>
              </div>
            )}
            {manualTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Additional Items</span><span>{fmtInr(manualTotal)}</span>
              </div>
            )}
            <div className="flex justify-between px-5 py-3 text-sm font-medium text-gray-700">
              <span>Sub Total</span><span>{fmtInr(subtotal)}</span>
            </div>
            <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
              <span>GST @ 18%</span><span>{fmtInr(gstAmount)}</span>
            </div>
            <div className="flex justify-between px-5 py-4 text-base font-bold text-gray-900 bg-gray-50">
              <span>Grand Total</span><span>{fmtInr(grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Action area */}
      {!hasAnything ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-400">
          Nothing to invoice yet.{' '}
          <a href="/contrast" className="text-indigo-600 hover:underline">Assign billing categories</a>
          {' '}to queue expenses, or add manual lines above.
        </div>
      ) : isFinalized ? (
        /* Success state — invoice saved, PDF ready */
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            Invoice finalized — all expenses, courier bills, and payroll marked as billed.
          </div>
          <div className="flex items-center gap-3">
            <ContrastInvoicePDFDownload
              data={invoiceData!}
              label="Download PDF"
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all"
            />
            <a
              href="/contrast/history"
              className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
            >
              View Invoice History →
            </a>
          </div>
        </div>
      ) : (
        /* Finalize button */
        <div className="flex items-center gap-3">
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
          >
            {finalizing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ReceiptText className="w-4 h-4" />
            }
            {finalizing ? 'Finalizing…' : 'Finalize Invoice'}
          </button>
          <p className="text-xs text-gray-400">
            Saves the invoice, marks all items as billed, and generates the PDF.
          </p>
        </div>
      )}
    </div>
  )
}
