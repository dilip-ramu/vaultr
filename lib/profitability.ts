// ── Profitability engine ─────────────────────────────────────────────────────
// Expected  = booked documents (customer invoices, commission, payroll income,
//             supplier invoices, payroll salaries) + transactions NOT linked to
//             any document (so nothing is counted twice).
// Actual    = realised money: every income/expense transaction.
// Outstanding = Expected − Actual.
//
// Date basis for Expected: due date (falls back to document date when absent).
// Date basis for Actual: transaction date.

// ── Raw row shapes (only the columns the page fetches) ───────────────────────

export interface ProfitTxn {
  id: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  date: string
  bill_id: string | null
  supplier_invoice_id: string | null
  supplier_payment_batch_id: string | null
  contrast_invoice_id: string | null
  is_contrast_billed: boolean
}

export interface ProfitCustomerInvoice {
  id: string
  total: number
  status: string
  invoice_date: string
  due_date: string | null
  transaction_id: string | null
}

export interface ProfitCommissionStyle {
  id: string
  commission_inr: number
  order_status: string
  expected_payment_date: string | null
  linked_transaction_id: string | null
  order_date: string | null // flattened from parent order
}

export interface ProfitPayrollMonth {
  id: string
  payroll_month: string // "YYYY-MM"
  payment_date: string | null
  received_inr: number
  income_transaction_id: string | null
  forex_transaction_id: string | null
}

export interface ProfitPayrollEntry {
  id: string
  payroll_month_id: string
  final_payable: number
  transaction_id: string | null
}

export interface ProfitSupplierInvoice {
  id: string
  amount: number
  invoice_date: string
  due_date: string | null
}

export interface ProfitabilityData {
  transactions: ProfitTxn[]
  customerInvoices: ProfitCustomerInvoice[]
  commissionStyles: ProfitCommissionStyle[]
  commissionOrderTxnIds: (string | null)[]
  payrollMonths: ProfitPayrollMonth[]
  payrollEntries: ProfitPayrollEntry[]
  supplierInvoices: ProfitSupplierInvoice[]
}

// ── Output shapes ────────────────────────────────────────────────────────────

export interface SourceBreakdown {
  customerInvoices: number
  commission: number
  payrollIncome: number
  directIncome: number      // unlinked income transactions
  supplierInvoices: number
  payrollSalaries: number
  directExpense: number     // unlinked expense transactions
}

export interface ProfitSummary {
  expectedIncome: number
  expectedExpense: number
  expectedNet: number
  actualIncome: number
  actualExpense: number
  actualNet: number
  outstandingIncome: number
  outstandingExpense: number
  outstandingNet: number
  breakdown: SourceBreakdown
}

export interface MonthlyProfit extends ProfitSummary {
  month: string // "YYYY-MM"
}

// ── Internal: a dated line item feeding either side ──────────────────────────

interface Line {
  date: string // YYYY-MM-DD
  amount: number
  side: 'income' | 'expense'
  source: keyof SourceBreakdown
}

const monthOf = (d: string) => d.slice(0, 7)

/** Transaction ids already represented by a document — excluded from Expected. */
export function linkedTxnIds(data: ProfitabilityData): Set<string> {
  const ids = new Set<string>()
  const add = (v: string | null | undefined) => { if (v) ids.add(v) }
  for (const inv of data.customerInvoices) add(inv.transaction_id)
  for (const s of data.commissionStyles) add(s.linked_transaction_id)
  for (const id of data.commissionOrderTxnIds) add(id)
  for (const pm of data.payrollMonths) { add(pm.income_transaction_id); add(pm.forex_transaction_id) }
  for (const pe of data.payrollEntries) add(pe.transaction_id)
  for (const t of data.transactions) {
    if (t.bill_id || t.supplier_invoice_id || t.supplier_payment_batch_id ||
        t.contrast_invoice_id || t.is_contrast_billed) ids.add(t.id)
  }
  return ids
}

/** All Expected line items, dated by due date (fallback: document date). */
export function expectedLines(data: ProfitabilityData): Line[] {
  const lines: Line[] = []
  const linked = linkedTxnIds(data)

  for (const inv of data.customerInvoices) {
    if (inv.status === 'cancelled') continue
    lines.push({
      date: inv.due_date ?? inv.invoice_date,
      amount: inv.total, side: 'income', source: 'customerInvoices',
    })
  }

  for (const s of data.commissionStyles) {
    if (s.order_status === 'cancelled' || !s.commission_inr) continue
    const date = s.expected_payment_date ?? s.order_date
    if (!date) continue
    lines.push({ date, amount: s.commission_inr, side: 'income', source: 'commission' })
  }

  // Payroll months by id for entry dating
  const pmById = new Map(data.payrollMonths.map(pm => [pm.id, pm]))
  for (const pm of data.payrollMonths) {
    if (!pm.received_inr) continue
    lines.push({
      date: pm.payment_date ?? `${pm.payroll_month}-01`,
      amount: pm.received_inr, side: 'income', source: 'payrollIncome',
    })
  }

  for (const pe of data.payrollEntries) {
    if (!pe.final_payable) continue
    const pm = pmById.get(pe.payroll_month_id)
    if (!pm) continue
    lines.push({
      date: pm.payment_date ?? `${pm.payroll_month}-01`,
      amount: pe.final_payable, side: 'expense', source: 'payrollSalaries',
    })
  }

  for (const inv of data.supplierInvoices) {
    lines.push({
      date: inv.due_date ?? inv.invoice_date,
      amount: inv.amount, side: 'expense', source: 'supplierInvoices',
    })
  }

  // Direct (unlinked) transactions count in Expected too — they are both
  // expected and realised.
  for (const t of data.transactions) {
    if (t.type === 'transfer' || linked.has(t.id)) continue
    lines.push({
      date: t.date, amount: t.amount,
      side: t.type,
      source: t.type === 'income' ? 'directIncome' : 'directExpense',
    })
  }

  return lines
}

function emptyBreakdown(): SourceBreakdown {
  return {
    customerInvoices: 0, commission: 0, payrollIncome: 0, directIncome: 0,
    supplierInvoices: 0, payrollSalaries: 0, directExpense: 0,
  }
}

function emptySummary(): ProfitSummary {
  return {
    expectedIncome: 0, expectedExpense: 0, expectedNet: 0,
    actualIncome: 0, actualExpense: 0, actualNet: 0,
    outstandingIncome: 0, outstandingExpense: 0, outstandingNet: 0,
    breakdown: emptyBreakdown(),
  }
}

function finalize(s: ProfitSummary): ProfitSummary {
  s.expectedNet = s.expectedIncome - s.expectedExpense
  s.actualNet = s.actualIncome - s.actualExpense
  s.outstandingIncome = s.expectedIncome - s.actualIncome
  s.outstandingExpense = s.expectedExpense - s.actualExpense
  s.outstandingNet = s.expectedNet - s.actualNet
  return s
}

/** Summary for an arbitrary [from, to] date range (inclusive, YYYY-MM-DD). */
export function summarize(data: ProfitabilityData, from: string, to: string): ProfitSummary {
  const s = emptySummary()
  const inRange = (d: string) => d >= from && d <= to

  for (const l of expectedLines(data)) {
    if (!inRange(l.date)) continue
    if (l.side === 'income') s.expectedIncome += l.amount
    else s.expectedExpense += l.amount
    s.breakdown[l.source] += l.amount
  }

  for (const t of data.transactions) {
    if (t.type === 'transfer' || !inRange(t.date)) continue
    if (t.type === 'income') s.actualIncome += t.amount
    else s.actualExpense += t.amount
  }

  return finalize(s)
}

/** Per-calendar-month summaries (1st → last of each month), newest first.
 *  Covers every month from the earliest data point to the current month. */
export function monthlyHistory(data: ProfitabilityData, now = new Date()): MonthlyProfit[] {
  const buckets = new Map<string, ProfitSummary>()
  const bucket = (m: string) => {
    let b = buckets.get(m)
    if (!b) { b = emptySummary(); buckets.set(m, b) }
    return b
  }

  for (const l of expectedLines(data)) {
    const b = bucket(monthOf(l.date))
    if (l.side === 'income') b.expectedIncome += l.amount
    else b.expectedExpense += l.amount
    b.breakdown[l.source] += l.amount
  }

  for (const t of data.transactions) {
    if (t.type === 'transfer') continue
    const b = bucket(monthOf(t.date))
    if (t.type === 'income') b.actualIncome += t.amount
    else b.actualExpense += t.amount
  }

  if (buckets.size === 0) return []

  // Fill gaps from earliest month to the current month so the list is continuous
  const months = [...buckets.keys()].sort()
  const first = months[0]
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const last = current > months[months.length - 1] ? current : months[months.length - 1]

  const out: MonthlyProfit[] = []
  let [y, m] = first.split('-').map(Number)
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push({ month: key, ...finalize(buckets.get(key) ?? emptySummary()) })
    if (key === last) break
    m++; if (m > 12) { m = 1; y++ }
  }

  return out.reverse() // newest first
}
