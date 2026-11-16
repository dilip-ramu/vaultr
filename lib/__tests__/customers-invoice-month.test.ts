import { describe, it, expect } from 'vitest'
import {
  monthKey, monthLabel, previousMonth, invoiceMonth, waitingRows, waitingWords,
  monthSummary, monthComparison,
  type AllocationLike, type ExpenseLike, type InvoiceLike, type WaitingRow,
} from '@/lib/customers/invoiceMonth'

const alloc = (customerName: string, amount: number, customerId: string | null = null): AllocationLike =>
  ({ customerName, amount, customerId })
const exp = (customerName: string, amount: number, sorted: boolean, customerId: string | null = null): ExpenseLike =>
  ({ customerName, amount, sorted, customerId })
const inv = (o: Partial<InvoiceLike> = {}): InvoiceLike => ({
  id: 'i1', number: 'INV-1', customerId: null, customerName: 'Contrast',
  date: '2026-11-04', month: '2026-11', total: 1000, balanceDue: 1000,
  status: 'sent', dueDate: null, ...o,
})

describe('months', () => {
  it('reads a month off a date', () => {
    expect(monthKey('2026-11-04')).toBe('2026-11')
  })

  it('says the month in words', () => {
    expect(monthLabel('2026-11')).toBe('November 2026')
    expect(monthLabel('2026-01')).toBe('January 2026')
  })

  it('hands back anything it cannot read', () => {
    expect(monthLabel('rubbish')).toBe('rubbish')
    expect(monthLabel('2026-13')).toBe('2026-13')
  })

  it('steps back a month, and back over a year end', () => {
    expect(previousMonth('2026-11')).toBe('2026-10')
    expect(previousMonth('2026-01')).toBe('2025-12')
  })

  it('trusts invoice_month over the date', () => {
    // A November invoice raised on 2 December is still November's billing.
    expect(invoiceMonth(inv({ month: '2026-11', date: '2026-12-02' }))).toBe('2026-11')
  })

  it('falls back to the date when the month is missing or malformed', () => {
    expect(invoiceMonth(inv({ month: null, date: '2026-12-02' }))).toBe('2026-12')
    expect(invoiceMonth(inv({ month: 'nov', date: '2026-12-02' }))).toBe('2026-12')
  })
})

describe('what is waiting', () => {
  it('counts consignments and their value per customer', () => {
    const rows = waitingRows([alloc('Contrast', 500), alloc('Contrast', 250)], [], [], '2026-11')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ customerName: 'Contrast', consignments: 2, consignmentValue: 750 })
  })

  it('keeps sorted and unsorted expenses apart, because only one is a job to do', () => {
    const rows = waitingRows([], [exp('Acme', 100, false), exp('Acme', 50, true)], [], '2026-11')
    expect(rows[0]).toMatchObject({ expensesUnsorted: 1, expensesSorted: 1, expenseValue: 150 })
  })

  it('leaves out a customer with nothing waiting', () => {
    expect(waitingRows([], [], [inv()], '2026-11')).toEqual([])
  })

  it('still lists a customer already invoiced this month', () => {
    // Consignments that land after the invoice went out are exactly what gets
    // missed, so being invoiced must not hide the row.
    const rows = waitingRows([alloc('Contrast', 500)], [], [inv({ customerName: 'Contrast' })], '2026-11')
    expect(rows).toHaveLength(1)
    expect(rows[0].invoicedThisMonth).toBe(1)
  })

  it('does not count last month’s invoice as this month’s', () => {
    const rows = waitingRows([alloc('Contrast', 500)], [], [inv({ month: '2026-10' })], '2026-11')
    expect(rows[0].invoicedThisMonth).toBe(0)
  })

  it('matches a customer by id when there is one, and by name when there is not', () => {
    const rows = waitingRows(
      [alloc('Contrast Ltd', 100, 'c1')],
      [exp('contrast ltd  ', 50, true, 'c1')],
      [], '2026-11')
    expect(rows).toHaveLength(1)
    expect(rows[0].customerId).toBe('c1')
  })

  it('picks up an id that only one of the two sides carries', () => {
    const rows = waitingRows([alloc('Acme', 100, null)], [exp('Acme', 50, true, 'c9')], [], '2026-11')
    expect(rows[0].customerId).toBe('c9')
  })

  it('puts the heaviest customer first', () => {
    const rows = waitingRows([alloc('Small', 10), alloc('Big', 9000)], [], [], '2026-11')
    expect(rows.map(r => r.customerName)).toEqual(['Big', 'Small'])
  })

  it('sends a row with expenses to the reimbursable flow, and one without to courier', () => {
    const withExp = waitingRows([alloc('A', 1)], [exp('A', 1, false)], [], '2026-11')[0]
    const courierOnly = waitingRows([alloc('B', 1)], [], [], '2026-11')[0]
    expect(withExp.action).toBe('reimbursable')
    expect(courierOnly.action).toBe('courier')
  })

  it('rounds money to paise rather than carrying float noise', () => {
    const rows = waitingRows([alloc('A', 0.1), alloc('A', 0.2)], [], [], '2026-11')
    expect(rows[0].consignmentValue).toBe(0.3)
  })
})

describe('the words on a row', () => {
  const row = (o: Partial<WaitingRow>): WaitingRow => ({
    customerId: null, customerName: 'A', consignments: 0, consignmentValue: 0,
    expensesSorted: 0, expensesUnsorted: 0, expenseValue: 0, invoicedThisMonth: 0,
    action: 'courier', ...o,
  })

  it('says what there is to do', () => {
    expect(waitingWords(row({ consignments: 142 }))).toBe('142 consignments to bill')
    expect(waitingWords(row({ expensesUnsorted: 4, expensesSorted: 18 })))
      .toBe('4 expenses still to sort · 18 sorted and ready')
  })

  it('gets the singular right', () => {
    expect(waitingWords(row({ consignments: 1 }))).toBe('1 consignment to bill')
    expect(waitingWords(row({ expensesUnsorted: 1 }))).toBe('1 expense still to sort')
  })
})

describe('the month in figures', () => {
  it('adds up what was invoiced and what is still owed', () => {
    const s = monthSummary([
      inv({ id: 'a', total: 1000, balanceDue: 1000, status: 'sent' }),
      inv({ id: 'b', total: 500, balanceDue: 0, status: 'paid' }),
    ], '2026-11', '2026-11-20')
    expect(s).toMatchObject({ count: 2, total: 1500, outstanding: 1000 })
  })

  it('leaves a cancelled invoice out of the count altogether', () => {
    const s = monthSummary([inv({ status: 'cancelled', total: 1000 })], '2026-11', '2026-11-20')
    expect(s.count).toBe(0)
    expect(s.total).toBe(0)
  })

  it('counts an unpaid invoice past its due date as overdue', () => {
    const s = monthSummary([
      inv({ id: 'a', status: 'sent', dueDate: '2026-11-10' }),
      inv({ id: 'b', status: 'sent', dueDate: '2026-11-30' }),
      inv({ id: 'c', status: 'paid', dueDate: '2026-11-01', balanceDue: 0 }),
    ], '2026-11', '2026-11-20')
    expect(s.overdue).toBe(1)
  })

  it('ignores another month', () => {
    expect(monthSummary([inv({ month: '2026-10' })], '2026-11', '2026-11-20').count).toBe(0)
  })
})

describe('this month against last', () => {
  const sum = (count: number): ReturnType<typeof monthSummary> =>
    ({ count, total: 0, outstanding: 0, overdue: 0 })

  it('says plainly when this month is short', () => {
    expect(monthComparison(sum(2), sum(7))).toBe('2 so far, against 7 the month before — 5 fewer.')
  })

  it('says when nothing has been done yet', () => {
    expect(monthComparison(sum(0), sum(7))).toBe('Nothing invoiced yet. 7 went out the month before.')
  })

  it('does not nag when the count matches or is higher', () => {
    expect(monthComparison(sum(7), sum(7))).toBe('7 so far, the same as the month before.')
    expect(monthComparison(sum(9), sum(7))).toBe('9 so far, against 7 the month before.')
  })

  it('handles a first-ever month', () => {
    expect(monthComparison(sum(0), sum(0))).toBe('No invoices either month.')
    expect(monthComparison(sum(3), sum(0))).toBe('3 so far. Nothing was invoiced the month before.')
  })
})
