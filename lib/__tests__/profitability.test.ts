import { describe, it, expect } from 'vitest'
import {
  linesFromRaw, summarize, monthlyHistory,
  type ProfitLine, type RawProfitData, type RawTxn,
} from '../profitability'

// ── Helpers ──────────────────────────────────────────────────────────────────

function txn(over: Partial<RawTxn>): RawTxn {
  return {
    id: 't', type: 'expense', amount: 0, date: '2026-05-15',
    bill_id: null, supplier_invoice_id: null, supplier_payment_batch_id: null,
    contrast_invoice_id: null, is_contrast_billed: false,
    ...over,
  }
}

function rawData(over: Partial<RawProfitData> = {}): RawProfitData {
  return {
    transactions: [], customerInvoices: [], commissionStyles: [],
    commissionOrderTxnIds: [], payrollMonths: [], payrollEntries: [],
    supplierInvoices: [],
    ...over,
  }
}

const NOW = new Date('2026-06-04')

// ── linesFromRaw: dedup rules ────────────────────────────────────────────────

describe('linesFromRaw — no double counting', () => {
  it('a transaction linked to a supplier invoice counts in actual but NOT expected', () => {
    const lines = linesFromRaw(rawData({
      transactions: [txn({ id: 't1', amount: 20000, supplier_invoice_id: 'si1' })],
      supplierInvoices: [{ amount: 20000, invoice_date: '2026-05-01', due_date: '2026-05-10' }],
    }))
    const expected = lines.filter(l => l.kind === 'expected')
    const actual = lines.filter(l => l.kind === 'actual')
    // expected: only the invoice document (20000), not the payment txn
    expect(expected.reduce((s, l) => s + l.amount, 0)).toBe(20000)
    expect(actual.reduce((s, l) => s + l.amount, 0)).toBe(20000)
  })

  it('a payroll salary transaction is deduped via payroll_entries.transaction_id', () => {
    const lines = linesFromRaw(rawData({
      transactions: [txn({ id: 't1', amount: 50000 })],
      payrollMonths: [{ id: 'pm1', payroll_month: '2026-05', payment_date: '2026-05-05', received_inr: 0, income_transaction_id: null, forex_transaction_id: null }],
      payrollEntries: [{ payroll_month_id: 'pm1', final_payable: 50000, transaction_id: 't1' }],
    }))
    const expectedExpense = lines.filter(l => l.kind === 'expected' && l.side === 'expense')
    // only the payroll document, not the linked transaction
    expect(expectedExpense).toHaveLength(1)
    expect(expectedExpense[0].source).toBe('payrollSalaries')
  })

  it('an UNLINKED transaction counts in BOTH expected and actual', () => {
    const lines = linesFromRaw(rawData({
      transactions: [txn({ id: 't1', type: 'income', amount: 10000 })],
    }))
    expect(lines.filter(l => l.kind === 'expected')).toHaveLength(1)
    expect(lines.filter(l => l.kind === 'actual')).toHaveLength(1)
  })

  it('transfers are ignored entirely', () => {
    const lines = linesFromRaw(rawData({
      transactions: [txn({ type: 'transfer', amount: 99999 })],
    }))
    expect(lines).toHaveLength(0)
  })

  it('cancelled customer invoices and cancelled commission are excluded', () => {
    const lines = linesFromRaw(rawData({
      customerInvoices: [{ total: 5000, status: 'cancelled', invoice_date: '2026-05-01', due_date: null, transaction_id: null }],
      commissionStyles: [{ commission_inr: 700, order_status: 'cancelled', expected_payment_date: '2026-05-10', linked_transaction_id: null, order_date: null }],
    }))
    expect(lines).toHaveLength(0)
  })

  it('expected items use due date, falling back to document date', () => {
    const lines = linesFromRaw(rawData({
      supplierInvoices: [
        { amount: 100, invoice_date: '2026-04-25', due_date: '2026-05-10' },
        { amount: 200, invoice_date: '2026-04-25', due_date: null },
      ],
    }))
    expect(lines.find(l => l.amount === 100)?.day).toBe('2026-05-10')
    expect(lines.find(l => l.amount === 200)?.day).toBe('2026-04-25')
  })
})

// ── summarize ────────────────────────────────────────────────────────────────

describe('summarize', () => {
  const lines: ProfitLine[] = [
    { kind: 'expected', side: 'income', source: 'customerInvoices', day: '2026-05-20', amount: 100000 },
    { kind: 'expected', side: 'expense', source: 'supplierInvoices', day: '2026-05-10', amount: 25000 },
    { kind: 'actual', side: 'income', source: 'actual', day: '2026-05-15', amount: 10000 },
    { kind: 'actual', side: 'expense', source: 'actual', day: '2026-05-05', amount: 70000 },
    { kind: 'actual', side: 'income', source: 'actual', day: '2026-04-01', amount: 999 }, // outside range
  ]

  it('computes expected, actual and outstanding nets for the range', () => {
    const s = summarize(lines, '2026-05-01', '2026-05-31')
    expect(s.expectedNet).toBe(75000)
    expect(s.actualNet).toBe(-60000)
    expect(s.outstandingNet).toBe(135000)
  })

  it('range boundaries are inclusive', () => {
    const s = summarize(lines, '2026-05-05', '2026-05-05')
    expect(s.actualExpense).toBe(70000)
  })

  it('losing money shows as negative actual net', () => {
    const s = summarize([
      { kind: 'actual', side: 'expense', source: 'actual', day: '2026-05-12', amount: 30000 },
      { kind: 'actual', side: 'income', source: 'actual', day: '2026-05-20', amount: 5000 },
    ], '2026-05-01', '2026-05-31')
    expect(s.actualNet).toBe(-25000)
  })

  it('breakdown attributes expected amounts by source', () => {
    const s = summarize(lines, '2026-05-01', '2026-05-31')
    expect(s.breakdown.customerInvoices).toBe(100000)
    expect(s.breakdown.supplierInvoices).toBe(25000)
  })
})

// ── monthlyHistory ───────────────────────────────────────────────────────────

describe('monthlyHistory', () => {
  it('returns a 13-month window, newest first, gap-filled', () => {
    const m = monthlyHistory([
      { kind: 'actual', side: 'expense', source: 'actual', day: '2026-05-12', amount: 30000 },
    ], NOW)
    expect(m).toHaveLength(13)
    expect(m[0].month).toBe('2026-06')
    expect(m[m.length - 1].month).toBe('2025-06')
    expect(m.find(x => x.month === '2026-05')?.actualNet).toBe(-30000)
  })

  it('ignores malformed dates instead of hanging (the year-0205 bug)', () => {
    const t0 = Date.now()
    const m = monthlyHistory([
      { kind: 'actual', side: 'income', source: 'actual', day: '0205-01-01', amount: 1 },
      { kind: 'actual', side: 'income', source: 'actual', day: 'garbage', amount: 2 },
      { kind: 'actual', side: 'income', source: 'actual', day: null as unknown as string, amount: 3 },
      { kind: 'actual', side: 'income', source: 'actual', day: '2026-05-01', amount: 100 },
    ], NOW)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(m.find(x => x.month === '2026-05')?.actualIncome).toBe(100)
  })

  it('data older than the window is excluded', () => {
    const m = monthlyHistory([
      { kind: 'actual', side: 'income', source: 'actual', day: '2024-01-01', amount: 999 },
    ], NOW)
    expect(m.every(x => x.actualIncome === 0)).toBe(true)
  })

  it('empty input gives empty output', () => {
    expect(monthlyHistory([], NOW)).toHaveLength(0)
  })
})
