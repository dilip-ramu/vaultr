// What you made on one order. The numbers on this sheet decide whether you
// are pricing right, so every one of them is checked.

import { describe, it, expect } from 'vitest'
import {
  computeMargin, plannedFromLines, shipmentProgress,
  type OrderMoney, type CostLine,
} from '@/lib/orders/margin'

/** An export order, costed at 88.50, paid at 89.20. */
const base = (over: Partial<OrderMoney> = {}): OrderMoney => ({
  customerValuePlanned: 48000,
  customerValueActual: 48000,
  bookedRate: 88.5,
  realisedRate: 89.2,
  supplierCostPlanned: 3620000,
  supplierCostActual: 3644500,
  ...over,
})

describe('the plain margin', () => {
  it('turns foreign value into rupees and takes off the supplier', () => {
    const m = computeMargin(base())
    expect(m.planned.customerValueInr).toBe(4248000)   // 48000 × 88.50
    expect(m.planned.gross).toBe(628000)
    expect(m.actual.customerValueInr).toBe(4281600)    // 48000 × 89.20
    expect(m.actual.gross).toBe(637100)
  })

  it('leaves a domestic order alone — rate 1, no FX anywhere', () => {
    const m = computeMargin({
      customerValuePlanned: 500000, customerValueActual: 500000,
      bookedRate: 1, realisedRate: 1,
      supplierCostPlanned: 420000, supplierCostActual: 430000,
    })
    expect(m.planned.customerValueInr).toBe(500000)
    expect(m.planned.gross).toBe(80000)
    expect(m.actual.gross).toBe(70000)
    expect(m.fxEffect).toBe(0)
  })

  it('shows margin as a percentage of what was invoiced', () => {
    const m = computeMargin({
      customerValuePlanned: 100, customerValueActual: 100,
      bookedRate: 1, realisedRate: 1,
      supplierCostPlanned: 80, supplierCostActual: 80,
    })
    expect(m.planned.marginPct).toBe(20)
  })

  it('does not divide by zero on an order with nothing invoiced', () => {
    const m = computeMargin({
      customerValuePlanned: 0, customerValueActual: 0,
      bookedRate: 88.5, supplierCostPlanned: 0, supplierCostActual: 0,
    })
    expect(m.planned.marginPct).toBe(0)
    expect(m.actual.net).toBe(0)
  })
})

describe('the exchange rate', () => {
  it('reports what the rate did, in rupees, on what was actually invoiced', () => {
    const m = computeMargin(base())
    expect(m.fxEffect).toBe(33600)   // 48000 × (89.20 − 88.50)
  })

  it('is a loss when the rate moved against you', () => {
    expect(computeMargin(base({ realisedRate: 87.5 })).fxEffect).toBe(-48000)
  })

  it('stands the booked rate in until the money actually lands', () => {
    const m = computeMargin(base({ realisedRate: null }))
    expect(m.actual.rate).toBe(88.5)
    expect(m.fxEffect).toBe(0)
    expect(m.actualIsComplete).toBe(false)
  })

  it('measures FX on the invoiced value, not the planned one', () => {
    // Half the order shipped. The FX line must not pretend the whole order
    // was exposed to the rate.
    const m = computeMargin(base({ customerValueActual: 24000 }))
    expect(m.fxEffect).toBe(16800)   // 24000 × 0.70
  })
})

describe('duty drawback', () => {
  it('works as a percentage of what was invoiced', () => {
    const m = computeMargin(base({ drawback: { basis: 'percent', value: 1.8 } }))
    expect(m.planned.drawback).toBe(76464)     // 1.8% of 42,48,000
    expect(m.actual.drawback).toBe(77068.8)    // 1.8% of 42,81,600
  })

  it('works as a flat amount', () => {
    const m = computeMargin(base({ drawback: { basis: 'amount', value: 76464 } }))
    expect(m.planned.drawback).toBe(76464)
    expect(m.actual.drawback).toBe(76464)
  })

  it('uses the real figure in the Actual column once it has landed', () => {
    const m = computeMargin(base({ drawback: { basis: 'percent', value: 1.8, actual: 74210 } }))
    expect(m.planned.drawback).toBe(76464)     // still the estimate
    expect(m.actual.drawback).toBe(74210)      // what the government actually paid
  })

  it('is nothing at all on an order that has none', () => {
    const m = computeMargin(base({ drawback: null }))
    expect(m.planned.drawback).toBe(0)
    expect(m.actual.drawback).toBe(0)
  })

  it('adds to profit, it does not reduce cost', () => {
    const without = computeMargin(base())
    const with_ = computeMargin(base({ drawback: { basis: 'amount', value: 50000 } }))
    expect(with_.planned.net - without.planned.net).toBe(50000)
    expect(with_.planned.gross).toBe(without.planned.gross)
  })
})

describe('cost and adjustment lines', () => {
  const freight: CostLine = { name: 'Freight & clearing', sign: -1, basis: 'flat', planned: 85000, actual: 91200 }
  const agent: CostLine   = { name: 'Agent commission',   sign: -1, basis: 'pct_customer', planned: 1 }
  const rebate: CostLine  = { name: 'Supplier rebate',    sign: 1,  basis: 'pct_supplier', planned: 0.5 }

  it('takes a flat cost off the profit', () => {
    const m = computeMargin(base({ costs: [freight] }))
    expect(m.planned.costTotal).toBe(-85000)
    expect(m.planned.net).toBe(628000 - 85000)
  })

  it('uses the real cost in the Actual column', () => {
    const m = computeMargin(base({ costs: [freight] }))
    expect(m.actual.costs[0].amount).toBe(-91200)
    expect(m.actual.costs[0].estimated).toBe(false)
  })

  it('falls back to the planned cost, and says it is standing in', () => {
    const m = computeMargin(base({ costs: [agent] }))
    expect(m.actual.costs[0].estimated).toBe(true)
    expect(m.planned.costs[0].estimated).toBe(false)
  })

  it('works out a percentage of what was invoiced', () => {
    const m = computeMargin(base({ costs: [agent] }))
    expect(m.planned.costs[0].amount).toBe(-42480)   // 1% of 42,48,000
    expect(m.actual.costs[0].amount).toBe(-42816)    // 1% of 42,81,600
  })

  it('works out a percentage of the supplier cost', () => {
    const m = computeMargin(base({ costs: [rebate] }))
    expect(m.planned.costs[0].amount).toBe(18100)    // +0.5% of 36,20,000
  })

  it('works out a percentage of the gross margin', () => {
    const m = computeMargin(base({ costs: [{ name: 'Partner share', sign: -1, basis: 'pct_gross', planned: 10 }] }))
    expect(m.planned.costs[0].amount).toBe(-62800)   // 10% of 6,28,000
  })

  it('a percentage line is worked out before any other line changes the total', () => {
    // Two lines that are each a percentage of gross must both use the SAME
    // gross, not a gross that the first one has already eaten into.
    const m = computeMargin(base({ costs: [
      { name: 'A', sign: -1, basis: 'pct_gross', planned: 10 },
      { name: 'B', sign: -1, basis: 'pct_gross', planned: 10 },
    ] }))
    expect(m.planned.costs[0].amount).toBe(-62800)
    expect(m.planned.costs[1].amount).toBe(-62800)
  })

  it('does not care what order the lines are in', () => {
    const a = computeMargin(base({ costs: [freight, agent, rebate] }))
    const b = computeMargin(base({ costs: [rebate, agent, freight] }))
    expect(a.planned.net).toBe(b.planned.net)
    expect(a.actual.net).toBe(b.actual.net)
  })

  it('a plus line adds to the profit', () => {
    const m = computeMargin(base({ costs: [{ name: 'Late penalty recovered', sign: 1, basis: 'flat', planned: 10000 }] }))
    expect(m.planned.net).toBe(628000 + 10000)
  })
})

describe('the whole sheet', () => {
  it('adds up the way the plan says it does', () => {
    const m = computeMargin(base({
      drawback: { basis: 'percent', value: 1.8 },
      costs: [
        { name: 'Freight & clearing', sign: -1, basis: 'flat', planned: 85000, actual: 91200 },
        { name: 'Inspection',         sign: -1, basis: 'flat', planned: 12000, actual: 12000 },
        { name: 'Bank charges',       sign: -1, basis: 'flat', planned: 4500,  actual: 5100 },
        { name: 'Agent commission',   sign: -1, basis: 'pct_customer', planned: 1 },
      ],
    }))
    // Planned: 6,28,000 + 76,464 − 85,000 − 12,000 − 4,500 − 42,480
    expect(m.planned.net).toBe(560484)
    expect(m.planned.marginPct).toBe(13.19)
  })

  it('knows when the Actual column is still partly a guess', () => {
    const everythingKnown = computeMargin(base({
      drawback: { basis: 'percent', value: 1.8, actual: 76464 },
      costs: [{ name: 'Freight', sign: -1, basis: 'flat', planned: 85000, actual: 91200 }],
    }))
    expect(everythingKnown.actualIsComplete).toBe(true)

    const costUnknown = computeMargin(base({
      drawback: { basis: 'percent', value: 1.8, actual: 76464 },
      costs: [{ name: 'Freight', sign: -1, basis: 'flat', planned: 85000 }],
    }))
    expect(costUnknown.actualIsComplete).toBe(false)
  })

  it('is not complete while the supplier has not billed', () => {
    expect(computeMargin(base({ supplierCostActual: 0 })).actualIsComplete).toBe(false)
  })
})

describe('reading the order lines', () => {
  const lines = [
    { qty: 1200, sellRate: 32, costRate: 2300, shippedQty: 1200 },
    { qty: 800,  sellRate: 12, costRate: 860,  shippedQty: 300 },
  ]

  it('adds the sell side in the order currency and the cost side in rupees', () => {
    expect(plannedFromLines(lines)).toEqual({ customerValue: 48000, supplierCost: 3448000 })
  })

  it('handles an order with no lines yet', () => {
    expect(plannedFromLines([])).toEqual({ customerValue: 0, supplierCost: 0 })
  })

  it('says how much of a part-shipped order has gone', () => {
    expect(shipmentProgress(lines)).toEqual({ ordered: 2000, shipped: 1500, balance: 500, pct: 75 })
  })

  it('cannot report more shipped than was ordered', () => {
    const over = [{ qty: 100, sellRate: 1, costRate: 1, shippedQty: 150 }]
    expect(shipmentProgress(over)).toEqual({ ordered: 100, shipped: 100, balance: 0, pct: 100 })
  })

  it('treats a line never shipped as zero, not as missing', () => {
    const p = shipmentProgress([{ qty: 500, sellRate: 1, costRate: 1 }])
    expect(p).toEqual({ ordered: 500, shipped: 0, balance: 500, pct: 0 })
  })
})

describe('rubbish in', () => {
  it('survives a missing rate rather than multiplying by zero', () => {
    const m = computeMargin({
      customerValuePlanned: 1000, customerValueActual: 1000,
      bookedRate: 0, supplierCostPlanned: 0, supplierCostActual: 0,
    })
    expect(m.planned.customerValueInr).toBe(1000)   // rate falls back to 1
  })

  it('survives NaN without poisoning the whole sheet', () => {
    const m = computeMargin({
      customerValuePlanned: NaN, customerValueActual: 100,
      bookedRate: 1, realisedRate: 1,
      supplierCostPlanned: 50, supplierCostActual: 50,
    })
    expect(m.planned.customerValueInr).toBe(0)
    expect(m.actual.net).toBe(50)
  })
})
