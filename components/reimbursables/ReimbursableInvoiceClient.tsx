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

/** Currency-aware number formatter. Was hardcoded to EUR because Contrast
 *  was the only reimbursable customer; now every customer picks their own
 *  billing currency and this needs to reflect it. Falls back to a
 *  code-prefixed string when Intl doesn't have a canonical symbol for the
 *  currency (rare). */
function fmtCur(n: number, cur: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
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
  amount: number
  /** Per-row currency override. Empty/undefined = the customer's
   *  billingCurrency (no conversion). If set to something else — commonly
   *  'INR' when the customer is billed in EUR — the amount is converted via
   *  the forex rate before being added to the invoice total. */
  currency?: string
}

interface DeductionRow {
  id: string
  description: string
  amount: number    // EUR (positive; stored as negative in items)
}

// v63: the previous DEFAULT_FIXED_EXPENSES hardcode was Contrast-specific
// (Office Rent 709.50 EUR, etc). It's gone — the customer's own list is
// seeded from customers.fixed_expenses via the initialFixedExpenses prop.

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
  /** Customer's own fixed monthly expenses (v63) — pre-populates the "Fixed"
   *  section. Empty array means no template; the user can add rows inline. */
  initialFixedExpenses?: { description: string; amount: number; currency?: string }[]
  /** All companies the user has (v44). The picker at the top of the invoice
   *  builder lets the user pick which one this invoice is billed FROM. */
  companies?: {
    id: string
    name: string
    address: string | null
    gstin: string | null
    phone: string | null
    email: string | null
    bank_account_name: string | null
    bank_account_number: string | null
    bank_ifsc: string | null
    bank_name: string | null
    swift_code: string | null
    logo_url: string | null
    is_default: boolean
  }[]
  /** Which company is selected by default (companies.is_default=true). */
  defaultCompanyId?: string | null
  /** Auth profile full-name — flows into the PDF's "Contact" line under
   *  Bill From when the company doesn't have a dedicated contact field. */
  profileFullName?: string | null
  /** Bill-to (customer) details — flows into the PDF's To block. */
  billTo?: {
    name: string
    contact?: string
    email?: string
    address?: string
    country?: string
  }
  /** Edit mode — when set, the builder loads this invoice's items instead
   *  of starting from a blank draft. Finalize becomes "Update invoice" and
   *  writes back to the same DB row (Deploy 3 existingInvoiceId path). */
  existingInvoice?: {
    id: string
    customer_id: string | null
    invoice_number: string
    invoice_date: string
    invoice_month: string | null
    notes: string | null
    company_id: string | null
    items: {
      item_type: string | null
      description: string | null
      salary_amount: number | null
      expended_rate: number | null
      salary_currency: string | null
      amount: number
      inr_source: number | null
      forex_rate: number | null
      line_number: number
    }[]
    selectedEmployeeIds: string[]
    selectedCourierIds:  string[]
  } | null
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ReimbursableInvoiceClient({
  employees, courierInvoices, allExpenses, companyName, uncategorizedCount,
  customerId = null, customerName = '',
  billingCurrency = 'INR', marketRate = null, marketRateAsOf = null,
  initialFixedExpenses = [],
  companies = [], defaultCompanyId = null, profileFullName = null,
  billTo,
}: Props) {
  // Bill-From company picker — user can override per-invoice. Initial
  // selection is the company flagged is_default in v44.
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    defaultCompanyId ?? companies[0]?.id ?? ''
  )
  const selectedCompany = useMemo(
    () => companies.find(c => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId]
  )
  const billFrom = useMemo(() => selectedCompany ? ({
    name:                selectedCompany.name,
    logo_url:            selectedCompany.logo_url,
    contact:             profileFullName ?? undefined,
    email:               selectedCompany.email             ?? undefined,
    phone:               selectedCompany.phone             ?? undefined,
    address:             selectedCompany.address           ?? undefined,
    bank_account_name:   selectedCompany.bank_account_name ?? undefined,
    bank_account_number: selectedCompany.bank_account_number ?? undefined,
    bank_ifsc:           selectedCompany.bank_ifsc         ?? undefined,
    bank_name:           selectedCompany.bank_name         ?? undefined,
    swift_code:          selectedCompany.swift_code        ?? undefined,
  }) : undefined, [selectedCompany, profileFullName])
  // When the customer is billed in INR, courier/expense INR amounts don't
  // need conversion — hide the forex-rate block entirely and short-circuit
  // any downstream conversions to a 1:1 pass-through.
  const isInrBilled = (billingCurrency || 'INR').toUpperCase() === 'INR'
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [finalizing, setFinalizing] = useState(false)
  const [invoiceData, setInvoiceData] = useState<ReimbursableInvoiceData | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)
  const [error, setError] = useState('')
  // Tracks the DB id of an invoice that's already been finalized once so
  // clicking "Edit invoice" → tweak → Finalize UPDATES the same row instead
  // of creating a duplicate. Null on first render (fresh invoice).
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null)

  // Forex rate: INR per EUR
  const [forexRate, setForexRate] = useState('')
  const forexRateNum = parseFloat(forexRate) || 0
  // INR-billed customers don't need conversion — treat as 1:1 always.
  // Non-INR customers need an actual rate to be typed.
  const hasValidRate = isInrBilled || forexRateNum > 0
  /** Divisor used to convert INR-denominated inputs (courier, expense) into
   *  the customer's billing currency. 1 for INR-billed customers, else the
   *  user-typed forex rate. */
  const forexDivisor = isInrBilled ? 1 : forexRateNum

  // Manual EUR lines
  const [manualLines, setManualLines] = useState<ManualLine[]>([])
  const [newDesc, setNewDesc] = useState('')
  const [newAmount, setNewAmount] = useState('')

  // Fixed expenses — seeded from customers.fixed_expenses via prop.
  // Currency preserved verbatim; if a row is in a currency other than the
  // customer's billing currency, it's converted below via the forex rate.
  // Any per-invoice edits are local; not written back to the customer row.
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseRow[]>(
    initialFixedExpenses.map((f, i) => ({ id: `seed-${i}`, description: f.description, amount: f.amount, currency: f.currency }))
  )

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
  const courierEurTotal = hasValidRate ? round2(courierInrTotal / forexDivisor) : 0
  const expenseEurTotal = hasValidRate ? round2(expenseInrTotal / forexDivisor) : 0
  const manualEurTotal  = useMemo(() => manualLines.reduce((s, l) => s + l.amount, 0), [manualLines])
  /** Convert a fixed-expense row's amount into the customer's billing
   *  currency. Same rule set as courier/expense conversion:
   *   - Row currency matches billingCurrency (or unset)   → pass through
   *   - Row currency is INR, billing is a foreign currency → divide by forex
   *   - Row currency is a foreign currency, billing is INR → multiply by forex
   *   - Any other cross-currency mismatch                 → pass through
   *     (rare; user should pre-convert manually — future work).
   */
  const convertFixedRowToBilling = (r: FixedExpenseRow): number => {
    const cur = (r.currency || billingCurrency).toUpperCase()
    if (cur === (billingCurrency || 'INR').toUpperCase()) return r.amount || 0
    if (cur === 'INR' && !isInrBilled && forexRateNum > 0) return (r.amount || 0) / forexRateNum
    if (isInrBilled && forexRateNum > 0)                   return (r.amount || 0) * forexRateNum
    return r.amount || 0
  }
  const fixedExpTotal   = useMemo(
    () => fixedExpenses.reduce((s, r) => s + convertFixedRowToBilling(r), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixedExpenses, billingCurrency, isInrBilled, forexRateNum]
  )
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
      // Re-use the same invoice row when re-finalizing (Edit → Finalize
      // again). Otherwise create a fresh draft.
      let inv: { id: string; invoice_number: string; invoice_date: string }
      if (existingInvoiceId) {
        inv = {
          id: existingInvoiceId,
          invoice_number: invoiceData?.invoice_number ?? '',
          invoice_date:   invoiceData?.invoice_date   ?? new Date().toISOString().slice(0, 10),
        }
      } else {
        const createRes = await fetch('/api/contrast/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Multi-customer: tag the new invoice with the customer being billed.
          body: JSON.stringify({ invoice_month: currentMonth, customer_id: customerId, company_id: selectedCompanyId || undefined }),
        })
        if (!createRes.ok) throw new Error((await createRes.json()).error ?? 'Failed to create invoice')
        inv = await createRes.json()
        setExistingInvoiceId(inv.id)
      }

      let sortOrder = 0
      const items: ReimbursableInvoiceData['items'] = []

      for (const emp of selectedEmployees) {
        items.push({ item_type: 'salary', description: `Salary for ${emp.name}`, salary_amount: emp.salary_amount, amount_inr: round2(emp.salary_amount || 0), sort_order: sortOrder++ })
      }
      for (const ci of selectedCouriers) {
        const eurAmt = round2(ci.total / forexDivisor)
        items.push({ item_type: 'courier', description: `Courier Invoice ${ci.invoice_number}`, amount_inr: eurAmt, inr_source: ci.total, forex_rate: forexDivisor, sort_order: sortOrder++ })
      }
      for (const cat of expenseByCategory) {
        const eurAmt = round2(cat.amountInr / forexDivisor)
        items.push({ item_type: 'expense', description: cat.name, amount_inr: eurAmt, inr_source: cat.amountInr, forex_rate: forexDivisor, sort_order: sortOrder++ })
      }
      for (const fe of fixedExpenses) {
        if ((fe.amount || 0) > 0) {
          // Convert to billing currency before persisting the line's amount.
          // If the row was in the same currency as the invoice this is a
          // no-op; otherwise the forex rate scales it.
          const billed = convertFixedRowToBilling(fe)
          items.push({ item_type: 'fixed_expense', description: fe.description, amount_inr: round2(billed), sort_order: sortOrder++ })
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

      setInvoiceData({
        invoice_number: inv.invoice_number,
        invoice_month:  currentMonth,
        invoice_date:   inv.invoice_date,
        items,
        subtotal:       subtotalEur,
        gst_amount:     gstEur,
        total:          grandTotalEur,
        currency:       billingCurrency,
        company_name:   companyName,
        bill_from:      billFrom,
        bill_to:        billTo,
        forex_rate:     hasValidRate && !isInrBilled ? forexRateNum : undefined,
      })
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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center overflow-hidden">
          {selectedCompany?.logo_url
            ? <img src={selectedCompany.logo_url} alt={selectedCompany.name} className="w-full h-full object-contain" />
            : <ReceiptText className="w-5 h-5 text-indigo-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">
            Invoice{customerName ? ` · ${customerName}` : ''}
          </h1>
          <p className="text-sm text-gray-500">
            Invoice for <strong>{monthLabel(currentMonth)}</strong> · {billingCurrency} · salaries direct, expenses via forex rate
          </p>
        </div>
        {/* Bill From company chips — hidden when only one company exists.
            Same visual language as the customer chips at the top of the page:
            colored circle + name, active chip tinted with the company's hue.
            The logo (if any) replaces the initial inside the circle. */}
        {companies.length > 1 && (
          <div className="flex flex-col items-end gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Bill From</label>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {companies.map(c => {
                const active = c.id === selectedCompanyId
                const hue    = c.is_default ? '#3B4AC7' : '#2A7A50'
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => !isFinalized && setSelectedCompanyId(c.id)}
                    disabled={isFinalized}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50"
                    style={{
                      borderColor: active ? hue : 'var(--border)',
                      background:  active ? `${hue}18` : 'var(--surface)',
                      color:       active ? hue : 'var(--text)',
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 overflow-hidden"
                      style={{ background: hue }}
                    >
                      {c.logo_url
                        ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover" />
                        : c.name[0]?.toUpperCase() ?? '?'}
                    </span>
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Uncategorized nudge */}
      {uncategorizedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="flex-1 text-sm text-amber-800">
            <strong>{uncategorizedCount} expense{uncategorizedCount !== 1 ? 's' : ''}</strong> have no billing category and won&apos;t be included.
          </p>
          <a href="/customers/invoices/reimbursables" className="shrink-0 flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
            Go to Expenses <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* ── Forex Rate ── Hidden entirely for INR-billed customers since no
             conversion is needed (all amounts already in rupees). */}
      {!isInrBilled && (
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
              {selectedCouriers.length > 0 && <p>{fmtInr(courierInrTotal)} → {fmtCur(courierEurTotal, billingCurrency)}</p>}
              {allExpenses.length > 0 && <p>{fmtInr(expenseInrTotal)} → {fmtCur(expenseEurTotal, billingCurrency)}</p>}
            </div>
          )}
        </div>
        {needsRate && <p className="mt-2 text-xs text-amber-600">⚠ Enter the forex rate to see {billingCurrency} amounts for courier and expense lines.</p>}
      </div>
      )}

      {/* ── Sections ── */}
      <div className="space-y-3">

        {/* Salaries */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-indigo-50">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-700">Salaries</span>
            <span className="text-xs text-indigo-400 ml-1">({employees.length} active staff)</span>
            <span className="text-xs text-indigo-300 ml-1">· payroll month auto-created on finalize</span>
            <span className="ml-auto text-sm font-bold text-indigo-700">{fmtCur(salaryEurTotal, billingCurrency)}</span>
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
                    <span className="text-xs text-gray-400">{billingCurrency} salary</span>
                    <span className="text-sm font-medium text-gray-900 w-32 text-right">{fmtCur(emp.salary_amount || 0, billingCurrency)}</span>
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
              <span className="text-xs text-blue-400 ml-1">· {fmtInr(courierInrTotal)} → <strong>{fmtCur(courierEurTotal, billingCurrency)}</strong></span>
            )}
            <span className="ml-auto text-sm font-bold text-blue-700">{hasValidRate ? fmtCur(courierEurTotal, billingCurrency) : fmtInr(courierInrTotal)}</span>
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
                    {hasValidRate && <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtCur(round2(ci.total / forexDivisor), billingCurrency)}</span>}
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
              <span className="text-xs text-purple-400 ml-1">· {fmtInr(expenseInrTotal)} → <strong>{fmtCur(expenseEurTotal, billingCurrency)}</strong></span>
            )}
            <span className="ml-auto text-sm font-bold text-purple-700">{hasValidRate ? fmtCur(expenseEurTotal, billingCurrency) : fmtInr(expenseInrTotal)}</span>
          </div>
          {allExpenses.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">
              No expenses queued.{' '}
              <a href="/customers/invoices/reimbursables" className="text-indigo-600 hover:underline">Assign billing categories</a> to queue them.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenseByCategory.map((cat, i) => (
                <div key={i} className="flex items-center px-5 py-3">
                  <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                  <span className="text-xs text-gray-400 mr-4">{cat.ids.length} tx</span>
                  <span className="text-sm text-gray-500 w-28 text-right">{fmtInr(cat.amountInr)}</span>
                  {hasValidRate && <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtCur(round2(cat.amountInr / forexDivisor), billingCurrency)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Expenses — each row can override the customer's billing
             currency. Rows in a different currency get converted to the
             billing currency in the total (via the forex rate). */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-teal-50">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-semibold text-teal-700">Fixed Expenses</span>
            <span className="text-xs text-teal-400 ml-1">(default: {billingCurrency})</span>
            <span className="ml-auto text-sm font-bold text-teal-700">{fmtCur(fixedExpTotal, billingCurrency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {fixedExpenses.map(fe => {
              const rowCur = (fe.currency || billingCurrency).toUpperCase()
              const converted = rowCur !== (billingCurrency || 'INR').toUpperCase()
                ? convertFixedRowToBilling(fe)
                : null
              return (
                <div key={fe.id} className="flex items-center px-5 py-2.5 gap-3">
                  <span className="flex-1 text-sm text-gray-800">{fe.description}</span>
                  <select
                    value={fe.currency ?? ''}
                    onChange={e => setFixedExpenses(prev => prev.map(r => r.id === fe.id ? { ...r, currency: e.target.value || undefined } : r))}
                    disabled={isFinalized}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-50"
                    title="Per-row currency. Blank = customer's billing currency."
                  >
                    <option value="">{billingCurrency}</option>
                    {['INR','EUR','USD','GBP','AED','SGD','AUD','CAD','JPY','CHF'].filter(c => c !== billingCurrency).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={fe.amount === 0 ? '' : fe.amount}
                    onChange={e => updateFixedExpense(fe.id, parseFloat(e.target.value) || 0)}
                    placeholder="0.00" min="0" step="0.01" disabled={isFinalized}
                    className="w-28 px-3 py-1.5 text-sm text-right border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 disabled:opacity-50"
                  />
                  {converted != null && (
                    <span className="text-[10px] text-teal-500 w-24 text-right tabular-nums">
                      ≈ {fmtCur(converted, billingCurrency)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Additional / manual items */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-orange-50">
            <Plus className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">Additional Items</span>
            <span className="text-xs text-orange-400 ml-1">(enter in {billingCurrency})</span>
            <span className="ml-auto text-sm font-bold text-orange-700">{fmtCur(manualEurTotal, billingCurrency)}</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualLine()} placeholder="e.g. Office supplies paid by staff" disabled={isFinalized} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 disabled:opacity-50" />
              </div>
              <div className="w-36">
                <label className="block text-xs text-gray-500 mb-1">Amount ({billingCurrency})</label>
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
                    <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmtCur(line.amount, billingCurrency)}</span>
                    {!isFinalized && <button onClick={() => removeManualLine(i)} className="text-gray-300 hover:text-red-400 transition-colors ml-1"><X className="w-4 h-4" /></button>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Add {billingCurrency} amounts for items not tracked in the system.</p>
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
              <span className="ml-auto text-sm font-bold text-red-600">− {fmtCur(deductionTotal, billingCurrency)}</span>
            )}
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input type="text" value={newDedDesc} onChange={e => setNewDedDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDeduction()} placeholder="e.g. Advance adjustment" disabled={isFinalized} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 disabled:opacity-50" />
              </div>
              <div className="w-36">
                <label className="block text-xs text-gray-500 mb-1">Amount ({billingCurrency})</label>
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
                    <span className="text-sm font-medium text-red-600 w-28 text-right">− {fmtCur(ded.amount, billingCurrency)}</span>
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
                <span>Salaries</span><span>{fmtCur(salaryEurTotal, billingCurrency)}</span>
              </div>
            )}
            {selectedCouriers.length > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Courier Charges</span>
                <span>{hasValidRate ? fmtCur(courierEurTotal, billingCurrency) : <span className="text-amber-500">enter rate ↑</span>}</span>
              </div>
            )}
            {allExpenses.length > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Operational Expenses</span>
                <span>{hasValidRate ? fmtCur(expenseEurTotal, billingCurrency) : <span className="text-amber-500">enter rate ↑</span>}</span>
              </div>
            )}
            {fixedExpTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Fixed Expenses</span><span>{fmtCur(fixedExpTotal, billingCurrency)}</span>
              </div>
            )}
            {manualEurTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
                <span>Additional Items</span><span>{fmtCur(manualEurTotal, billingCurrency)}</span>
              </div>
            )}
            {deductionTotal > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm text-red-600">
                <span>Deductions</span><span>− {fmtCur(deductionTotal, billingCurrency)}</span>
              </div>
            )}
            <div className="flex justify-between px-5 py-3 text-sm font-medium text-gray-700">
              <span>Sub Total</span><span>{fmtCur(subtotalEur, billingCurrency)}</span>
            </div>
            <div className="flex justify-between px-5 py-3 text-sm text-gray-600">
              <span>GST @ 18%</span><span>{fmtCur(gstEur, billingCurrency)}</span>
            </div>
            <div className="flex justify-between px-5 py-4 text-base font-bold text-gray-900 bg-gray-50">
              <span>Grand Total</span><span>{fmtCur(grandTotalEur, billingCurrency)}</span>
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
            <a href="/customers/invoices/reimbursables" className="underline font-medium">Contrast Expenses</a>
            {' '}and use &quot;Mark unbilled&quot; to restore transactions.
          </p>
        </div>
      )}

      {/* ── Action ── */}
      {!hasAnything ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-400">
          Nothing to invoice.{' '}
          <a href="/customers/invoices/reimbursables" className="text-indigo-600 hover:underline">Assign billing categories</a> to queue expenses.
        </div>
      ) : isFinalized ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            Invoice finalized — payroll month created, all items marked as billed. Finalize payroll after receiving payment.
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <ReimbursableInvoicePDFDownload
              data={invoiceData!}
              label="Download PDF"
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all"
            />
            {/* "Edit invoice" flips the form back to draft. The next Finalize
                call re-runs delete-then-insert on the API side so the mirror
                stays consistent. Historical PDF is superseded by the new one. */}
            <button
              type="button"
              onClick={() => setIsFinalized(false)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm transition-all"
            >
              <ReceiptText className="w-4 h-4" /> Edit invoice
            </button>
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
            {finalizing
              ? (existingInvoiceId ? 'Updating…' : 'Finalizing…')
              : (existingInvoiceId ? 'Update invoice' : 'Finalize Invoice')}
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
