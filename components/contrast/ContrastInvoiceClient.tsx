'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  FileText, ChevronDown, CheckCircle2, AlertCircle,
  Loader2, Eye, Download, Users, Truck, ReceiptText
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
  contrast_invoice_id: string | null
  entries: PayrollEntry[]
}

interface CourierBill {
  id: string
  name: string
  amount: number
  due_date: string
  direction: string
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

interface Props {
  payrollMonths: PayrollMonth[]
  courierBills: CourierBill[]
  contrastExpenses: ExpenseTx[]
  companyName: string
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ContrastInvoiceClient({
  payrollMonths, courierBills, contrastExpenses, companyName
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    payrollMonths[0]?.payroll_month ?? ''
  )
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [invoiceData, setInvoiceData] = useState<ContrastInvoiceData | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)
  const [error, setError] = useState('')

  // Selected payroll month data
  const selectedPayroll = useMemo(
    () => payrollMonths.find(m => m.payroll_month === selectedMonth),
    [payrollMonths, selectedMonth]
  )

  // Courier bills for selected month (any unbilled couriers)
  const monthCouriers = courierBills // all unbilled, not filtered by month since billing is cumulative

  // Expenses for selected month only
  const monthExpenses = useMemo(() => {
    if (!selectedMonth) return []
    return contrastExpenses.filter(e => e.date.slice(0, 7) === selectedMonth)
  }, [contrastExpenses, selectedMonth])

  // Expense totals by billing category
  const expenseByCategory = useMemo(() => {
    const map: Record<string, { name: string; amount: number; ids: string[] }> = {}
    for (const e of monthExpenses) {
      const key = e.contrast_billing_category_id ?? '__uncategorized__'
      const name = e.billing_category?.name ?? 'Uncategorized'
      if (!map[key]) map[key] = { name, amount: 0, ids: [] }
      map[key].amount += e.amount
      map[key].ids.push(e.id)
    }
    return map
  }, [monthExpenses])

  // Summary totals
  const salaryTotal = useMemo(() =>
    (selectedPayroll?.entries ?? []).reduce((s, e) => s + e.final_payable, 0)
  , [selectedPayroll])

  const courierTotal = useMemo(() =>
    monthCouriers.reduce((s, b) => s + b.amount, 0)
  , [monthCouriers])

  const expenseTotal = useMemo(() =>
    monthExpenses.reduce((s, e) => s + e.amount, 0)
  , [monthExpenses])

  const subtotal = salaryTotal + courierTotal + expenseTotal
  const gstAmount = Math.round(subtotal * 0.18 * 100) / 100
  const grandTotal = subtotal + gstAmount

  // ── Generate invoice ──────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedMonth || !selectedPayroll) return
    setGenerating(true)
    setError('')

    try {
      // Create draft invoice
      const res = await fetch('/api/contrast/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_month: selectedMonth }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create invoice')
      const inv = await res.json()
      setInvoiceId(inv.id)

      // Build items
      let sortOrder = 0
      const items: ContrastInvoiceData['items'] = []

      // Salary items
      for (const entry of selectedPayroll.entries) {
        items.push({
          item_type: 'salary',
          description: `Salary for ${entry.employee.name}`,
          salary_euro: entry.salary_euro,
          expended_rate: entry.expended_rate,
          amount_inr: entry.final_payable,
          sort_order: sortOrder++,
        })
      }

      // Courier items
      for (const bill of monthCouriers) {
        items.push({
          item_type: 'courier',
          description: `Courier Charges${bill.name ? ` – ${bill.name}` : ''}`,
          amount_inr: bill.amount,
          sort_order: sortOrder++,
        })
      }

      // Expense items (grouped by billing category)
      for (const [, cat] of Object.entries(expenseByCategory)) {
        items.push({
          item_type: 'expense',
          description: cat.name,
          amount_inr: cat.amount,
          sort_order: sortOrder++,
        })
      }

      const data: ContrastInvoiceData = {
        invoice_number: inv.invoice_number,
        invoice_month: selectedMonth,
        invoice_date: inv.invoice_date,
        items,
        subtotal,
        gst_amount: gstAmount,
        total: grandTotal,
        company_name: companyName,
      }
      setInvoiceData(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Finalize invoice ──────────────────────────────────────────────────────
  const handleFinalize = async () => {
    if (!invoiceData || !invoiceId) return
    setFinalizing(true)
    setError('')

    try {
      const transaction_ids = monthExpenses.map(e => e.id)
      const bill_ids = monthCouriers.map(b => b.id)
      const payroll_month_ids = selectedPayroll ? [selectedPayroll.id] : []

      const res = await fetch(`/api/contrast/invoices/${invoiceId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: invoiceData.items,
          transaction_ids,
          bill_ids,
          payroll_month_ids,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Finalize failed')
      setIsFinalized(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFinalizing(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <ReceiptText className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contrast Invoice</h1>
          <p className="text-sm text-gray-500">Auto-generate monthly proforma invoice</p>
        </div>
      </div>

      {/* Month selector */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Select Payroll Month</h2>

        <div className="relative inline-block">
          <button
            onClick={() => setShowMonthPicker(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 min-w-[180px] justify-between"
          >
            <span>{selectedMonth ? monthLabel(selectedMonth) : 'Select month…'}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {showMonthPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[200px] py-1 max-h-60 overflow-y-auto">
              {payrollMonths.map(pm => (
                <button
                  key={pm.id}
                  onClick={() => { setSelectedMonth(pm.payroll_month); setShowMonthPicker(false); setInvoiceData(null); setIsFinalized(false); setInvoiceId(null) }}
                  className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between ${
                    pm.payroll_month === selectedMonth ? 'font-semibold text-indigo-600' : 'text-gray-700'
                  }`}
                >
                  <span>{monthLabel(pm.payroll_month)}</span>
                  {pm.contrast_invoice_id && (
                    <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Invoiced</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {!selectedPayroll && selectedMonth && (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            No finalized payroll found for this month.
          </div>
        )}
      </div>

      {/* Preview sections */}
      {selectedMonth && (
        <div className="grid gap-4">

          {/* Salary lines */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-indigo-50">
              <Users className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-semibold text-indigo-700">Salaries</span>
              <span className="ml-auto text-sm font-bold text-indigo-700">{fmtInr(salaryTotal)}</span>
            </div>
            {(selectedPayroll?.entries ?? []).length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No finalized payroll entries.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {(selectedPayroll?.entries ?? []).map(entry => (
                  <div key={entry.id} className="flex items-center px-5 py-3">
                    <span className="flex-1 text-sm text-gray-800">Salary for {entry.employee.name}</span>
                    <span className="text-xs text-gray-400 mr-4">
                      {entry.salary_euro} EUR @ {entry.expended_rate}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{fmtInr(entry.final_payable)}</span>
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
              <span className="ml-auto text-sm font-bold text-blue-700">{fmtInr(courierTotal)}</span>
            </div>
            {monthCouriers.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No unbilled courier charges.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {monthCouriers.map(bill => (
                  <div key={bill.id} className="flex items-center px-5 py-3">
                    <span className="flex-1 text-sm text-gray-800">{bill.name || 'Courier Charge'}</span>
                    <span className="text-sm font-medium text-gray-900">{fmtInr(bill.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contrast expenses grouped by billing category */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-purple-50">
              <FileText className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-700">Operational Expenses</span>
              <span className="ml-auto text-sm font-bold text-purple-700">{fmtInr(expenseTotal)}</span>
            </div>
            {Object.keys(expenseByCategory).length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">
                No unbilled expenses for {monthLabel(selectedMonth)}.
                {monthExpenses.length === 0 && contrastExpenses.length > 0 && (
                  <span className="block mt-1 text-amber-600">
                    Note: There are unbilled expenses in other months not shown here.
                  </span>
                )}
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {Object.entries(expenseByCategory).map(([key, cat]) => (
                  <div key={key} className="flex items-center px-5 py-3">
                    <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                    <span className="text-xs text-gray-400 mr-4">{cat.ids.length} transaction{cat.ids.length !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-medium text-gray-900">{fmtInr(cat.amount)}</span>
                  </div>
                ))}
                {monthExpenses.some(e => !e.contrast_billing_category_id) && (
                  <div className="px-5 py-2 bg-amber-50">
                    <p className="text-xs text-amber-700">
                      ⚠ Some expenses have no billing category — assign them in Contrast Expenses first.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Grand total summary */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Salaries</span><span>{fmtInr(salaryTotal)}</span>
              </div>
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Courier Charges</span><span>{fmtInr(courierTotal)}</span>
              </div>
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Operational Expenses</span><span>{fmtInr(expenseTotal)}</span>
              </div>
              <div className="flex justify-between px-5 py-3 text-sm text-gray-700 font-medium">
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

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {!invoiceData ? (
              <button
                onClick={handleGenerate}
                disabled={generating || !selectedPayroll}
                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
              >
                {generating
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Eye className="w-4 h-4" />
                }
                {generating ? 'Generating…' : 'Generate Invoice'}
              </button>
            ) : (
              <>
                {/* PDF Download */}
                <ContrastInvoicePDFDownload
                  data={invoiceData}
                  label="Download PDF"
                  className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all"
                />

                {/* Finalize */}
                {!isFinalized ? (
                  <button
                    onClick={handleFinalize}
                    disabled={finalizing}
                    className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                  >
                    {finalizing
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <CheckCircle2 className="w-4 h-4" />
                    }
                    {finalizing ? 'Finalizing…' : 'Finalize & Mark Billed'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Invoice finalized — all records marked as billed
                  </div>
                )}

                {/* Regenerate */}
                <button
                  onClick={() => { setInvoiceData(null); setIsFinalized(false) }}
                  className="px-4 py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {payrollMonths.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-800">No finalized payroll months</p>
            <p className="text-sm text-amber-700 mt-1">
              Finalize a payroll month in Monthly Processing first, then return here to generate the invoice.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
