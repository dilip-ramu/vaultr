import { describe, it, expect } from 'vitest'
import { billPosition, billTone, billDraftFromOrder } from '@/lib/orders/supplierBill'

const pos = (bills: { amount: number; isPaid?: boolean }[], expected: number, shipped = 0) =>
  billPosition({ bills, expected, shipped })

describe('where the order stands against the bills', () => {
  it('says plainly when nothing has been billed', () => {
    const p = pos([], 250000)
    expect(p.state).toBe('none')
    expect(p.billed).toBe(0)
    expect(p.words).toContain('No supplier bill yet')
    // The figure still standing in for the real one is named, because that is
    // what makes the Actual column a forecast rather than a fact.
    expect(p.words).toContain('₹2,50,000')
  })

  it('shouts when goods have shipped and no bill has arrived', () => {
    const p = pos([], 250000, 1800)
    expect(p.shippedUnbilled).toBe(true)
    expect(p.words).toContain('Goods have shipped')
    expect(billTone(p)).toBe('bad')
  })

  it('does not shout before anything has shipped', () => {
    const p = pos([], 250000, 0)
    expect(p.shippedUnbilled).toBe(false)
    expect(billTone(p)).toBe('plain')
  })

  it('counts a bill that matches what was costed as matched', () => {
    const p = pos([{ amount: 250000 }], 250000)
    expect(p.state).toBe('matched')
    expect(p.words).toBe('Billed ₹2,50,000, as costed.')
    expect(billTone(p)).toBe('good')
  })

  it('treats a rounding difference as rounding, not a discrepancy', () => {
    expect(pos([{ amount: 249_995 }], 250000).state).toBe('matched')
    expect(pos([{ amount: 250_006 }], 250000).state).toBe('matched')
  })

  it('says how much is still to come when the bills fall short', () => {
    const p = pos([{ amount: 150000 }], 250000)
    expect(p.state).toBe('under')
    expect(p.difference).toBe(-100000)
    expect(p.words).toBe('Billed ₹1,50,000 of the ₹2,50,000 costed — ₹1,00,000 still to come.')
  })

  it('flags a bill over what was costed, because that is the one to look at', () => {
    const p = pos([{ amount: 280000 }], 250000)
    expect(p.state).toBe('over')
    expect(p.difference).toBe(30000)
    expect(p.words).toContain('₹30,000 more than planned')
    expect(billTone(p)).toBe('warn')
  })

  it('adds several bills up and says how many', () => {
    const p = pos([{ amount: 150000 }, { amount: 100000 }], 250000)
    expect(p.count).toBe(2)
    expect(p.billed).toBe(250000)
    expect(p.words).toBe('2 bills, ₹2,50,000 in all — as costed.')
  })

  it('counts how many are paid', () => {
    const p = pos([{ amount: 100000, isPaid: true }, { amount: 150000 }], 250000)
    expect(p.paidCount).toBe(1)
  })

  it('still reads sensibly on an order with nothing costed', () => {
    const p = pos([], 0)
    expect(p.state).toBe('none')
    expect(p.expected).toBe(0)
  })

  it('calls a bill on a zero-cost order over, not matched', () => {
    // Nothing was costed and a bill turned up: that needs looking at.
    expect(pos([{ amount: 5000 }], 0).state).toBe('over')
  })

  it('survives rubbish figures without producing NaN', () => {
    const p = billPosition({ bills: [{ amount: NaN }], expected: Number('x') })
    expect(p.billed).toBe(0)
    expect(p.expected).toBe(0)
    expect(Number.isFinite(p.difference)).toBe(true)
  })

  it('takes a wider tolerance when told to', () => {
    expect(pos([{ amount: 240000 }], 250000).state).toBe('under')
    expect(billPosition({ bills: [{ amount: 240000 }], expected: 250000, tolerancePct: 5 }).state).toBe('matched')
  })
})

describe('the draft a bill starts from', () => {
  it('opens at what was costed when nothing is billed yet', () => {
    const d = billDraftFromOrder({ orderNumber: 'ORD-12', poNumber: 'PO-7', supplierId: 's1', expected: 250000 })
    expect(d).toMatchObject({ supplierId: 's1', amount: 250000 })
    expect(d.notes).toBe('Against purchase order PO-7 (order ORD-12).')
  })

  it('opens at what is LEFT when part of it is already billed', () => {
    // A second bill on a part shipment must not open at the full value and
    // invite somebody to bill the order twice.
    const d = billDraftFromOrder({ orderNumber: 'ORD-12', expected: 250000, billed: 150000 })
    expect(d.amount).toBe(100000)
  })

  it('never opens below zero when the supplier has over-billed', () => {
    const d = billDraftFromOrder({ orderNumber: 'ORD-12', expected: 250000, billed: 300000 })
    expect(d.amount).toBe(0)
  })

  it('falls back to the order number when no purchase order was raised', () => {
    const d = billDraftFromOrder({ orderNumber: 'ORD-12', expected: 1000 })
    expect(d.notes).toBe('Against order ORD-12.')
    expect(d.supplierId).toBe('')
  })
})
