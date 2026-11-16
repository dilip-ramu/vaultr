import { describe, it, expect } from 'vitest'
import {
  sortRows, filterRows, nextSort, defaultDir, turnover, isFiltering, NO_FILTERS,
  type ListRowLike, type Sort,
} from '@/lib/orders/listView'

const row = (o: Partial<ListRowLike> & { number: string }): ListRowLike => ({
  customer_name: 'Acme', customer_po_no: null, order_date: '2026-11-01',
  stage: 'confirmed', value: 0, valueInr: 0, invoicedInr: 0, net: 0, marginPct: 0, ...o,
})

describe('which way a column sorts first', () => {
  it('reads text A to Z and money from the top', () => {
    expect(defaultDir('customer')).toBe('asc')
    expect(defaultDir('number')).toBe('asc')
    expect(defaultDir('stage')).toBe('asc')
    expect(defaultDir('value')).toBe('desc')
    expect(defaultDir('profit')).toBe('desc')
    expect(defaultDir('date')).toBe('desc')
  })

  it('starts a new column at its natural direction and flips the same one', () => {
    const now: Sort = { key: 'date', dir: 'desc' }
    expect(nextSort(now, 'customer')).toEqual({ key: 'customer', dir: 'asc' })
    expect(nextSort(now, 'date')).toEqual({ key: 'date', dir: 'asc' })
    expect(nextSort({ key: 'date', dir: 'asc' }, 'date')).toEqual({ key: 'date', dir: 'desc' })
  })
})

describe('sorting', () => {
  it('ranks money in rupees, not by the number in the cell', () => {
    // $48,000 is the bigger order; 200000 > 48000 is the trap.
    const rows = [
      row({ number: '0001', currency: 'INR', value: 200000, valueInr: 200000 } as never),
      row({ number: '0002', value: 48000, valueInr: 4_224_000 }),
    ]
    expect(sortRows(rows, { key: 'value', dir: 'desc' }).map(r => r.number)).toEqual(['0002', '0001'])
  })

  it('ranks stages by where they sit in the job, not alphabetically', () => {
    // Alphabetically 'cancelled' would come before 'confirmed'.
    const rows = [row({ number: 'c', stage: 'cancelled' }), row({ number: 'a', stage: 'enquiry' }), row({ number: 'b', stage: 'shipped' })]
    expect(sortRows(rows, { key: 'stage', dir: 'asc' }).map(r => r.stage))
      .toEqual(['enquiry', 'shipped', 'cancelled'])
  })

  it('sorts order numbers as numbers, so 0010 follows 0009', () => {
    const rows = [row({ number: '0010' }), row({ number: '0009' }), row({ number: '0002' })]
    expect(sortRows(rows, { key: 'number', dir: 'asc' }).map(r => r.number)).toEqual(['0002', '0009', '0010'])
  })

  it('sorts customers, dates, profit and margin', () => {
    const rows = [
      row({ number: '1', customer_name: 'Zeta', order_date: '2026-01-01', net: 500, marginPct: 30 }),
      row({ number: '2', customer_name: 'Alpha', order_date: '2026-06-01', net: 900, marginPct: 10 }),
    ]
    expect(sortRows(rows, { key: 'customer', dir: 'asc' })[0].customer_name).toBe('Alpha')
    expect(sortRows(rows, { key: 'date', dir: 'desc' })[0].order_date).toBe('2026-06-01')
    expect(sortRows(rows, { key: 'profit', dir: 'desc' })[0].net).toBe(900)
    expect(sortRows(rows, { key: 'margin', dir: 'desc' })[0].marginPct).toBe(30)
  })

  it('breaks a tie on the order number so rows never swap about', () => {
    const rows = [row({ number: '0003' }), row({ number: '0001' }), row({ number: '0002' })]
    expect(sortRows(rows, { key: 'date', dir: 'desc' }).map(r => r.number)).toEqual(['0001', '0002', '0003'])
  })

  it('leaves the list it was given untouched', () => {
    const rows = [row({ number: '2' }), row({ number: '1' })]
    sortRows(rows, { key: 'number', dir: 'asc' })
    expect(rows.map(r => r.number)).toEqual(['2', '1'])
  })

  it('treats a missing PO number as empty rather than failing', () => {
    const rows = [row({ number: '1', customer_po_no: null }), row({ number: '2', customer_po_no: 'PO-9' })]
    expect(sortRows(rows, { key: 'po', dir: 'asc' }).map(r => r.number)).toEqual(['1', '2'])
  })
})

describe('filtering', () => {
  const rows = [
    row({ number: '0001', customer_name: 'Contrast', customer_po_no: 'PO-77', stage: 'confirmed' }),
    row({ number: '0002', customer_name: 'Nova Textiles', stage: 'closed' }),
    row({ number: '0003', customer_name: 'Acme', stage: 'cancelled' }),
    row({ number: '0004', customer_name: 'Acme', stage: 'shipped' }),
  ]

  it('hides closed and cancelled on open, as the page always did', () => {
    expect(filterRows(rows, NO_FILTERS).map(r => r.number)).toEqual(['0001', '0004'])
  })

  it('shows everything on all', () => {
    expect(filterRows(rows, { ...NO_FILTERS, show: 'all' })).toHaveLength(4)
  })

  it('searches the number, the customer and their PO', () => {
    expect(filterRows(rows, { ...NO_FILTERS, search: '0004' }).map(r => r.number)).toEqual(['0004'])
    expect(filterRows(rows, { ...NO_FILTERS, search: 'acme' }).map(r => r.number)).toEqual(['0004'])
    expect(filterRows(rows, { ...NO_FILTERS, search: 'po-77' }).map(r => r.number)).toEqual(['0001'])
  })

  it('ignores case and stray spaces in the search', () => {
    expect(filterRows(rows, { ...NO_FILTERS, search: '  CONTRAST ' }).map(r => r.number)).toEqual(['0001'])
  })

  it('lets a chosen stage override the open switch', () => {
    // Asking for closed and being shown nothing is how a filter feels broken.
    expect(filterRows(rows, { ...NO_FILTERS, stages: ['closed'] }).map(r => r.number)).toEqual(['0002'])
  })

  it('keeps several stages at once', () => {
    expect(filterRows(rows, { ...NO_FILTERS, stages: ['closed', 'cancelled'] }).map(r => r.number))
      .toEqual(['0002', '0003'])
  })

  it('knows whether anything is being filtered', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false)
    expect(isFiltering({ ...NO_FILTERS, search: 'x' })).toBe(true)
    expect(isFiltering({ ...NO_FILTERS, stages: ['closed'] })).toBe(true)
  })
})

describe('turnover', () => {
  it('counts what has been invoiced, and the rest beside it', () => {
    const t = turnover([
      row({ number: '1', valueInr: 1_000_000, invoicedInr: 1_000_000 }),
      row({ number: '2', valueInr: 500_000, invoicedInr: 0 }),
    ])
    expect(t.invoicedInr).toBe(1_000_000)
    expect(t.uninvoicedInr).toBe(500_000)
    expect(t.totalInr).toBe(1_500_000)
    expect(t.count).toBe(2)
  })

  it('counts a part-invoiced order on both sides', () => {
    const t = turnover([row({ number: '1', valueInr: 1_000_000, invoicedInr: 400_000 })])
    expect(t.invoicedInr).toBe(400_000)
    expect(t.uninvoicedInr).toBe(600_000)
  })

  it('does not let an over-invoiced order reduce the remainder', () => {
    // The extra is already counted as invoiced; a negative remainder would
    // quietly cancel out another order's genuine one.
    const t = turnover([
      row({ number: '1', valueInr: 100_000, invoicedInr: 130_000 }),
      row({ number: '2', valueInr: 100_000, invoicedInr: 0 }),
    ])
    expect(t.invoicedInr).toBe(130_000)
    expect(t.uninvoicedInr).toBe(100_000)
  })

  it('is all zeroes on an empty list', () => {
    expect(turnover([])).toEqual({ invoicedInr: 0, uninvoicedInr: 0, totalInr: 0, count: 0 })
  })

  it('ignores rubbish figures rather than producing NaN', () => {
    const t = turnover([row({ number: '1', valueInr: NaN, invoicedInr: Number('x') })])
    expect(t.totalInr).toBe(0)
  })
})
