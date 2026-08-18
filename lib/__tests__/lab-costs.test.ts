import { describe, it, expect } from 'vitest'
import { computeCosts, DEFAULT_COST_MODEL } from '@/lib/investments/lab/costs'

describe('lab costs', () => {
  it('buy fills higher (slippage) and charges cash out', () => {
    const c = computeCosts({ side: 'buy', price: 1000, quantity: 100 })
    expect(c.execPrice).toBeGreaterThan(1000)                 // adverse slippage
    expect(c.gross).toBeCloseTo(c.execPrice * 100, 2)
    expect(c.chargesTotal).toBeGreaterThan(0)
    expect(c.cashDelta).toBeCloseTo(-(c.gross + c.chargesTotal), 2)  // cash leaves
    expect(c.charges.stamp).toBeGreaterThan(0)                // stamp on buy
  })

  it('sell fills lower and brings cash in, no stamp duty', () => {
    const c = computeCosts({ side: 'sell', price: 1000, quantity: 100 })
    expect(c.execPrice).toBeLessThan(1000)
    expect(c.cashDelta).toBeCloseTo(c.gross - c.chargesTotal, 2)
    expect(c.cashDelta).toBeGreaterThan(0)
    expect(c.charges.stamp).toBe(0)                            // no stamp on sell
  })

  it('is configurable via the cost model', () => {
    const zero = { ...DEFAULT_COST_MODEL, slippage_pct: 0, stt_pct: 0, exchange_pct: 0, sebi_pct: 0, stamp_pct_buy: 0, gst_pct: 0 }
    const c = computeCosts({ side: 'buy', price: 500, quantity: 10, model: zero })
    expect(c.execPrice).toBe(500)
    expect(c.chargesTotal).toBe(0)
    expect(c.cashDelta).toBe(-5000)
  })
})
