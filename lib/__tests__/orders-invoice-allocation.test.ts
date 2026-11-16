import { describe, it, expect } from 'vitest'
import {
  invoicedForOrder, ordersOnInvoice, isShared,
  billableLines, invoicedQtyByLine, nothingBillableWords,
  type InvoiceLike, type OrderLineLike,
} from '@/lib/orders/invoiceAllocation'

const inv = (o: Partial<InvoiceLike> & { id: string }): InvoiceLike =>
  ({ orderId: null, total: 0, lines: [], ...o })

describe('what an order has been invoiced', () => {
  it('adds up only the lines tagged to that order', () => {
    // One invoice, two POs. This is the case the header column could not do.
    const shared = inv({
      id: 'i1', total: 650000,
      lines: [
        { orderId: 'A', amount: 400000 },
        { orderId: 'B', amount: 250000 },
      ],
    })
    expect(invoicedForOrder([shared], 'A')).toBe(400000)
    expect(invoicedForOrder([shared], 'B')).toBe(250000)
  })

  it('adds up two invoices against one order', () => {
    // One PO, invoiced in two goes.
    const first = inv({ id: 'i1', lines: [{ orderId: 'A', amount: 300000 }] })
    const second = inv({ id: 'i2', lines: [{ orderId: 'A', amount: 200000 }] })
    expect(invoicedForOrder([first, second], 'A')).toBe(500000)
  })

  it('counts an older untagged invoice in full against the order it was raised from', () => {
    // Anything raised before the tags existed must keep working exactly as
    // it did, or every old order would read as never invoiced.
    const old = inv({ id: 'i1', orderId: 'A', total: 450000, lines: [{ orderId: null, amount: 450000 }] })
    expect(invoicedForOrder([old], 'A')).toBe(450000)
    expect(invoicedForOrder([old], 'B')).toBe(0)
  })

  it('ignores the header once the lines carry tags', () => {
    // A shared invoice raised FROM order A must not also count in full
    // against A just because the header says so.
    const shared = inv({
      id: 'i1', orderId: 'A', total: 650000,
      lines: [{ orderId: 'A', amount: 400000 }, { orderId: 'B', amount: 250000 }],
    })
    expect(invoicedForOrder([shared], 'A')).toBe(400000)
  })

  it('mixes old and new invoices on the same order', () => {
    const old = inv({ id: 'i1', orderId: 'A', total: 100000, lines: [{ orderId: null, amount: 100000 }] })
    const neu = inv({ id: 'i2', lines: [{ orderId: 'A', amount: 50000 }] })
    expect(invoicedForOrder([old, neu], 'A')).toBe(150000)
  })

  it('is zero for an order nothing has been raised against', () => {
    expect(invoicedForOrder([], 'A')).toBe(0)
    expect(invoicedForOrder([inv({ id: 'i1', lines: [{ orderId: 'B', amount: 10 }] })], 'A')).toBe(0)
  })

  it('does not produce NaN from rubbish amounts', () => {
    const bad = inv({ id: 'i1', lines: [{ orderId: 'A', amount: NaN }] })
    expect(invoicedForOrder([bad], 'A')).toBe(0)
  })
})

describe('which orders an invoice covers', () => {
  it('lists them biggest first', () => {
    const shared = inv({ id: 'i1', lines: [{ orderId: 'B', amount: 250000 }, { orderId: 'A', amount: 400000 }] })
    expect(ordersOnInvoice(shared)).toEqual([
      { orderId: 'A', amount: 400000 },
      { orderId: 'B', amount: 250000 },
    ])
    expect(isShared(shared)).toBe(true)
  })

  it('adds several lines of the same order together', () => {
    const one = inv({ id: 'i1', lines: [{ orderId: 'A', amount: 100 }, { orderId: 'A', amount: 50 }] })
    expect(ordersOnInvoice(one)).toEqual([{ orderId: 'A', amount: 150 }])
    expect(isShared(one)).toBe(false)
  })

  it('falls back to the header for an untagged invoice', () => {
    const old = inv({ id: 'i1', orderId: 'A', total: 900, lines: [{ orderId: null, amount: 900 }] })
    expect(ordersOnInvoice(old)).toEqual([{ orderId: 'A', amount: 900 }])
    expect(isShared(old)).toBe(false)
  })

  it('says nothing for an invoice tied to no order at all', () => {
    expect(ordersOnInvoice(inv({ id: 'i1', total: 500 }))).toEqual([])
  })
})

describe('what is left to invoice', () => {
  const lines: OrderLineLike[] = [
    { id: 'l1', item: 'Polo', qty: 1200, shippedQty: 1200, sellRate: 32 },
    { id: 'l2', item: 'Tee',  qty: 800,  shippedQty: 300,  sellRate: 12 },
    { id: 'l3', item: 'Rib',  qty: 500,  shippedQty: 0,    sellRate: 9 },
  ]

  it('offers what has shipped, not what was ordered', () => {
    const out = billableLines(lines)
    expect(out.map(l => [l.item, l.qty])).toEqual([['Polo', 1200], ['Tee', 300]])
  })

  it('leaves out a line with nothing shipped rather than offering a zero', () => {
    // A zero line is something somebody has to delete.
    expect(billableLines(lines).some(l => l.item === 'Rib')).toBe(false)
  })

  it('takes off what is already invoiced, so a second invoice bills the rest', () => {
    const out = billableLines(lines, { l1: 1000, l2: 300 })
    expect(out.map(l => [l.item, l.qty])).toEqual([['Polo', 200]])
    expect(out[0].invoicedQty).toBe(1000)
    expect(out[0].amount).toBe(200 * 32)
  })

  it('offers nothing once everything shipped is invoiced', () => {
    expect(billableLines(lines, { l1: 1200, l2: 300 })).toEqual([])
  })

  it('never offers a negative, even if more was invoiced than shipped', () => {
    expect(billableLines(lines, { l1: 5000 }).some(l => l.orderLineId === 'l1')).toBe(false)
  })

  it('prices each line at the customer rate', () => {
    expect(billableLines(lines)[1]).toMatchObject({ rate: 12, qty: 300, amount: 3600 })
  })
})

describe('pieces already invoiced per order line', () => {
  it('adds the quantities off the invoice lines', () => {
    const invoices = [
      inv({ id: 'i1', lines: [{ orderId: 'A', amount: 100, qty: 600, orderLineId: 'l1' }] }),
      inv({ id: 'i2', lines: [{ orderId: 'A', amount: 100, qty: 400, orderLineId: 'l1' }] }),
    ]
    expect(invoicedQtyByLine(invoices)).toEqual({ l1: 1000 })
  })

  it('ignores a line that is not tied to an order line', () => {
    expect(invoicedQtyByLine([inv({ id: 'i1', lines: [{ orderId: 'A', amount: 5, qty: 5 }] })])).toEqual({})
  })
})

describe('saying why there is nothing to invoice', () => {
  it('tells you when nothing has shipped', () => {
    const words = nothingBillableWords([{ id: 'l1', item: 'Polo', qty: 100, shippedQty: 0, sellRate: 1 }], {})
    expect(words).toContain('Nothing has shipped')
  })

  it('tells you when it is all invoiced already', () => {
    const words = nothingBillableWords([{ id: 'l1', item: 'Polo', qty: 100, shippedQty: 100, sellRate: 1 }], { l1: 100 })
    expect(words).toContain('already invoiced')
  })

  it('says nothing when there is something to bill', () => {
    expect(nothingBillableWords([{ id: 'l1', item: 'Polo', qty: 100, shippedQty: 100, sellRate: 1 }], {})).toBeNull()
  })

  it('tells you when the order has no lines', () => {
    expect(nothingBillableWords([], {})).toContain('no lines')
  })
})
