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

/** Per-calendar-month summaries (1st → last of each month), newest first.
 *  Covers every month from the earliest data point to the current month. */
export function monthlyHistory(lines: ProfitLine[], now = new Date()): MonthlyProfit[] {
  const buckets = new Map<string, ProfitSummary>()
  for (const l of lines) {
    const m = l.day.slice(0, 7)
    let b = buckets.get(m)
    if (!b) { b = emptySummary(); buckets.set(m, b) }
    addLine(b, l)
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
