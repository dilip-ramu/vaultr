import { describe, it, expect } from 'vitest'
import { computeNav, drawdown } from '@/lib/investments/lab/accounting'
import type { MarkedPosition } from '@/lib/investments/lab/types'

const pos = (o: Partial<MarkedPosition>): MarkedPosition => ({
  symbol: 'X', exchange: 'NSE', quantity: 10, cost_basis: 10000, price: 1000, sector: null, market_cap_band: null, ...o,
})

describe('computeNav', () => {
  it('values priced positions and adds cash', () => {
    const nav = computeNav(500000, [pos({ symbol: 'A', quantity: 100, price: 1000, cost_basis: 95000 })])
    expect(nav.positionsValue).toBe(100000)
    expect(nav.totalValue).toBe(600000)
    expect(nav.invested).toBe(95000)
    expect(nav.unrealizedPnl).toBe(5000)
    expect(nav.holdingsCount).toBe(1)
  })

  it('EXCLUDES and NAMES an unpriced position (never zeroes it)', () => {
    const nav = computeNav(500000, [
      pos({ symbol: 'A', quantity: 100, price: 1000, cost_basis: 95000 }),
      pos({ symbol: 'B', quantity: 50, price: null, cost_basis: 40000 }),
    ])
    expect(nav.unpriced).toContain('B')
    expect(nav.positionsValue).toBe(100000)   // B not added
    expect(nav.totalValue).toBe(600000)
  })
})

describe('drawdown', () => {
  it('tracks the running peak and drop from it', () => {
    const a = drawdown(1_000_000, null)
    expect(a.peak).toBe(1_000_000)
    expect(a.drawdownPct).toBe(0)
    const b = drawdown(1_100_000, a.peak)
    expect(b.peak).toBe(1_100_000)
    const c = drawdown(990_000, b.peak)
    expect(c.peak).toBe(1_100_000)            // peak holds
    expect(c.drawdownPct).toBeCloseTo(-10, 1) // 990k is 10% below 1.1M
  })
})
