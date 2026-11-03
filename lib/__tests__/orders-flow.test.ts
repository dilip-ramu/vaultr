import { describe, it, expect } from 'vitest'
import { orderFlow, nextStep, flowProgress, type OrderFacts } from '@/lib/orders/flow'
import { supplierPack, safeName, uniqueNames } from '@/lib/orders/pack'
import { summariseOrders, type OrderSummaryRow } from '@/lib/orders/summary'

const blank: OrderFacts = {
  customerFiles: 0, supplierFiles: 0,
  hasSalesOrder: false, hasPurchaseOrder: false,
  costAgreed: false, costsEntered: false, hasCustomerInvoice: false,
}

describe('the order flow', () => {
  it('runs in the order the work happens', () => {
    expect(orderFlow(blank).map(s => s.key)).toEqual(['files', 'sales_order', 'purchase_order', 'pl', 'invoice'])
  })

  it('points at the first thing not done, and only that one', () => {
    const steps = orderFlow(blank)
    expect(steps.filter(s => s.current).map(s => s.key)).toEqual(['files'])
  })

  it('moves on as each step is done', () => {
    expect(nextStep({ ...blank, customerFiles: 2 })?.key).toBe('sales_order')
    expect(nextStep({ ...blank, customerFiles: 2, hasSalesOrder: true })?.key).toBe('purchase_order')
  })

  it('does not argue with an order that skipped a step', () => {
    // Purchase order already placed, no sales order was ever made. The flow
    // points at the gap but every other step stays available.
    const f = { ...blank, customerFiles: 1, hasPurchaseOrder: true }
    expect(nextStep(f)?.key).toBe('sales_order')
    expect(orderFlow(f).find(s => s.key === 'purchase_order')?.done).toBe(true)
  })

  it('does not call the P/L done on a supplier price alone', () => {
    // A gross margin is not a profit. Freight and clearing have to be looked
    // at before the number means anything.
    expect(orderFlow({ ...blank, costAgreed: true }).find(s => s.key === 'pl')?.done).toBe(false)
    expect(orderFlow({ ...blank, costAgreed: true, costsEntered: true }).find(s => s.key === 'pl')?.done).toBe(true)
  })

  it('points at nothing once everything is done', () => {
    const all: OrderFacts = { ...blank, customerFiles: 1, hasSalesOrder: true, hasPurchaseOrder: true, costAgreed: true, costsEntered: true, hasCustomerInvoice: true }
    expect(nextStep(all)).toBe(null)
    expect(flowProgress(all)).toBe(100)
  })

  it('points at nothing on a closed order', () => {
    expect(nextStep({ ...blank, closed: true })).toBe(null)
  })

  it('counts how far along you are', () => {
    expect(flowProgress(blank)).toBe(0)
    expect(flowProgress({ ...blank, customerFiles: 1, hasSalesOrder: true })).toBe(40)
  })

  it('says how many files, not just that there are some', () => {
    expect(orderFlow({ ...blank, customerFiles: 1 })[0].doneNote).toBe('1 file from the customer')
    expect(orderFlow({ ...blank, customerFiles: 3 })[0].doneNote).toBe('3 files from the customer')
  })
})

describe('the supplier pack', () => {
  const files = [{ name: 'tech pack.pdf', path: 'u/1.pdf' }, { name: 'artwork.ai', path: 'u/2.ai' }]

  it('leads with the purchase order, then the summary, then the files', () => {
    const p = supplierPack({ orderNumber: 'ORD-26-0001', poNumber: 'PNGN-PO260002', files })
    expect(p.entries.map(e => e.kind)).toEqual(['purchase-order', 'summary', 'file', 'file'])
    expect(p.entries[0].entry).toBe('PNGN-PO260002.pdf')
  })

  it('names the zip after the purchase order and the supplier', () => {
    const p = supplierPack({ orderNumber: 'ORD-26-0001', poNumber: 'PNGN-PO260002', supplierName: 'Bharathi Fab Tex', files })
    expect(p.zipName).toBe('PNGN-PO260002 - Bharathi Fab Tex.zip')
  })

  it('still packs the files before a purchase order exists, and says what is missing', () => {
    const p = supplierPack({ orderNumber: 'ORD-26-0001', files })
    expect(p.entries.map(e => e.kind)).toEqual(['summary', 'file', 'file'])
    expect(p.zipName).toBe('ORD-26-0001.zip')
    expect(p.summaryLine).toContain('Raise the purchase order first')
  })

  it('never drops a file because two share a name', () => {
    const dup = [{ name: 'artwork.pdf', path: 'a' }, { name: 'artwork.pdf', path: 'b' }, { name: 'artwork.pdf', path: 'c' }]
    const p = supplierPack({ orderNumber: 'O1', files: dup })
    expect(p.entries.filter(e => e.kind === 'file').map(e => e.entry))
      .toEqual(['artwork.pdf', 'artwork (2).pdf', 'artwork (3).pdf'])
  })

  it('keeps the extension when it renames a duplicate', () => {
    expect(uniqueNames(['a.tar.gz', 'a.tar.gz'])).toEqual(['a.tar.gz', 'a.tar (2).gz'])
  })

  it('strips characters a zip or Windows will refuse', () => {
    expect(safeName('size: chart */ v2.pdf')).toBe('size- chart - v2.pdf')
    expect(safeName('../../etc/passwd')).toBe('-..-etc-passwd')
    expect(safeName('')).toBe('file')
  })
})

describe('the orders summary', () => {
  const row = (over: Partial<OrderSummaryRow>): OrderSummaryRow => ({
    stage: 'shipped', net: 0, valueInr: 0, receivable: 0, payable: 0, drawbackDue: 0, shipBalance: 0, ...over,
  })

  it('keeps forecast profit and banked profit apart', () => {
    const s = summariseOrders([
      row({ stage: 'shipped', net: 500000, valueInr: 4000000 }),
      row({ stage: 'closed', net: 300000, valueInr: 2000000 }),
    ])
    expect(s.pendingProfit).toBe(500000)
    expect(s.realisedProfit).toBe(300000)
  })

  it('counts only open orders as tied up', () => {
    const s = summariseOrders([
      row({ stage: 'ordered', valueInr: 1000000 }),
      row({ stage: 'closed', valueInr: 9000000 }),
    ])
    expect(s.openValue).toBe(1000000)
    expect(s.openCount).toBe(1)
    expect(s.closedCount).toBe(1)
  })

  it('weights the margin by value, so one big thin order is not hidden', () => {
    const s = summariseOrders([
      row({ stage: 'shipped', net: 440000, valueInr: 4000000 }),  // 11%
      row({ stage: 'shipped', net: 60000, valueInr: 200000 }),    // 30%
    ])
    // Simple average would say 20.5%. Weighted says what the book is doing.
    expect(s.openMarginPct).toBe(11.9)
  })

  it('works out what the open book is worth in cash', () => {
    const s = summariseOrders([row({ receivable: 2000000, payable: 1500000, drawbackDue: 76464 })])
    expect(s.netExpected).toBe(576464)
  })

  it('still counts money owed on an order that is closed', () => {
    const s = summariseOrders([row({ stage: 'closed', receivable: 100000 })])
    expect(s.receivable).toBe(100000)
  })

  it('ignores a cancelled order entirely', () => {
    const s = summariseOrders([row({ stage: 'cancelled', net: 999, valueInr: 999, receivable: 999, payable: 999 })])
    expect(s).toMatchObject({ openCount: 0, pendingProfit: 0, receivable: 0, payable: 0 })
  })

  it('adds up what is still to ship', () => {
    const s = summariseOrders([row({ shipBalance: 500 }), row({ shipBalance: 300 }), row({ stage: 'closed', shipBalance: 99 })])
    expect(s.toShip).toBe(800)
  })

  it('survives an empty book', () => {
    expect(summariseOrders([])).toMatchObject({ openCount: 0, openMarginPct: 0, netExpected: 0 })
  })
})
