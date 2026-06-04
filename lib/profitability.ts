// ── Profitability engine ─────────────────────────────────────────────────────
// All heavy aggregation happens in Postgres (get_profitability_lines RPC, see
// supabase/migration_v31_profitability.sql). The RPC returns small per-day
// aggregates; this module just buckets them into ranges and months.
//
// Expected  = booked documents (customer invoices, commission, payroll income,
//             supplier invoices, payroll salaries) + transactions NOT linked to
//             any document (so nothing is counted twice). Dated by due date.
// Actual    = realised money: every income/expense transaction, by txn date.
// Outstanding = Expected − Actual.

export type ProfitSource =
  | 'customerInvoices' | 'commission' | 'payrollIncome' | 'directIncome'
  | 'supplierInvoices' | 'payrollSalaries' | 'directExpense' | 'actual'

export interface ProfitLine {
  kind: 'expected' | 'actual'
  side: 'income' | 'expense'
  source: ProfitSource
  day: string // YYYY-MM-DD
  amount: number
}

export type SourceBreakdown = Record<Exclude<ProfitSource, 'actual'>, number>

// ── Raw row shapes (used only by the fallback path when the RPC is absent) ──

export interface RawTxn {
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

export interface RawProfitData {
  transactions: RawTxn[]
  customerInvoices: { total: number; status: string; invoice_date: string; due_date: string | null; transaction_id: string | null }[]
  commissionStyles: { commission_inr: number; order_status: string; expected_payment_date: string | null; linked_transaction_id: string | null; order_date: string | null }[]
  commissionOrderTxnIds: (string | null)[]
  payrollMonths: { id: string; payroll_month: string; payment_date: string | null; received_inr: number; income_transaction_id: string | null; forex_transaction_id: string | null }[]
  payrollEntries: { payroll_month_id: string; final_payable: number; transaction_id: string | null }[]
  supplierInvoices: { amount: number; invoice_date: string; due_date: string | null }[]
}

/** Build profit lines in JS — fallback when get_profitability_lines() RPC
 *  hasn't been created in the database yet. Mirrors migration_v31 exactly. */
export function linesFromRaw(data: RawProfitData): ProfitLine[] {
  const lines: ProfitLine[] = []
  const push = (kind: ProfitLine['kind'], side: ProfitLine['side'], source: ProfitSource, day: string | null, amount: number) => {
    if (day && amount) lines.push({ kind, side, source, day, amount })
  }

  // Transaction ids already represented by a document
  const linked = new Set<string>()
  const mark = (v: string | null) => { if (v) linked.add(v) }
  for (const i of data.customerInvoices) mark(i.transaction_id)
  for (const s of data.commissionStyles) mark(s.linked_transaction_id)
  for (const id of data.commissionOrderTxnIds) mark(id)
  for (const pm of data.payrollMonths) { mark(pm.income_transaction_id); mark(pm.forex_transaction_id) }
  for (const pe of data.payrollEntries) mark(pe.transaction_id)

  for (const i of data.customerInvoices) {
    if (i.status !== 'cancelled') push('expected', 'income', 'customerInvoices', i.due_date ?? i.invoice_date, i.total)
  }
  for (const s of data.commissionStyles) {
    if (s.order_status !== 'cancelled') push('expected', 'income', 'commission', s.expected_payment_date ?? s.order_date, s.commission_inr)
  }
  const pmById = new Map(data.payrollMonths.map(pm => [pm.id, pm]))
  for (const pm of data.payrollMonths) {
    push('expected', 'income', 'payrollIncome', pm.payment_date ?? `${pm.payroll_month}-01`, pm.received_inr)
  }
  for (const pe of data.payrollEntries) {
    const pm = pmById.get(pe.payroll_month_id)
    if (pm) push('expected', 'expense', 'payrollSalaries', pm.payment_date ?? `${pm.payroll_month}-01`, pe.final_payable)
  }
  for (const i of data.supplierInvoices) {
    push('expected', 'expense', 'supplierInvoices', i.due_date ?? i.invoice_date, i.amount)
  }
  for (const t of data.transactions) {
    if (t.type === 'transfer') continue
    push('actual', t.type, 'actual', t.date, t.amount)
    const isLinked = linked.has(t.id) || !!(t.bill_id || t.supplier_invoice_id || t.supplier_payment_batch_id || t.contrast_invoice_id || t.is_contrast_billed)
    if (!isLinked) {
      push('expected', t.type, t.type === 'income' ? 'directIncome' : 'directExpense', t.date, t.amount)
    }
  }

  return lines
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

function addLine(s: ProfitSummary, l: ProfitLine) {
  if (l.kind === 'actual') {
    if (l.side === 'income') s.actualIncome += l.amount
    else s.actualExpense += l.amount
  } else {
    if (l.side === 'income') s.expectedIncome += l.amount
    else s.expectedExpense += l.amount
    if (l.source !== 'actual') s.breakdown[l.source] += l.amount
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
export function summarize(lines: ProfitLine[], from: string, to: string): ProfitSummary {
  const s = emptySummary()
  for (const l of lines) {
    if (l.day >= from && l.day <= to) addLine(s, l)
  }
  return finalize(s)
}

// Valid "YYYY-MM" within a sane window — guards against typo'd dates
// (e.g. year 0205) which would otherwise make the gap-fill loop run forever.
const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
function isSaneMonth(key: string, now: Date): boolean {
  if (!VALID_MONTH.test(key)) return false
  const y = Number(key.slice(0, 4))
  return y >= 1990 && y <= now.getFullYear() + 10
}

/** Per-calendar-month summaries (1st → last of each month), newest first.
 *  Covers every month from the earliest data point to the current month. */
export function monthlyHistory(lines: ProfitLine[], now = new Date()): MonthlyProfit[] {
  const buckets = new Map<string, ProfitSummary>()
  for (const l of lines) {
    if (typeof l.day !== 'string') continue
    const m = l.day.slice(0, 7)
    if (!isSaneMonth(m, now)) continue
    let b = buckets.get(m)
    if (!b) { b = emptySummary(); buckets.set(m, b) }
    addLine(b, l)
  }

  if (buckets.size === 0) return []

  // Window: last 13 months only (current month + 12 back), gap-filled
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const windowStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`

  const out: MonthlyProfit[] = []
  let [y, m] = windowStart.split('-').map(Number)
  for (let i = 0; i < 13; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push({ month: key, ...finalize(buckets.get(key) ?? emptySummary()) })
    if (key >= current) break
    m++; if (m > 12) { m = 1; y++ }
  }

  return out.reverse() // newest first
}
