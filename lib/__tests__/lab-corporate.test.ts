import { describe, it, expect } from 'vitest'
import { applyDividend, applySplit, applyBonus, isSupportedAction } from '@/lib/investments/lab/corporate'

describe('dividends', () => {
  it('credits net cash after assumed tax, leaving the position unchanged', () => {
    const r = applyDividend({ quantity: 100 }, { dividendPerShare: 5, taxPct: 0.1 })
    expect(r.gross).toBe(500)
    expect(r.tax).toBe(50)
    expect(r.net).toBe(450)
  })
  it('no tax => full credit', () => {
    expect(applyDividend({ quantity: 200 }, { dividendPerShare: 2 }).net).toBe(400)
  })
})

describe('splits and bonus preserve total cost basis (avg cost falls)', () => {
  it('a 5:1 split quintuples shares, keeps cost basis', () => {
    const r = applySplit({ quantity: 100, cost_basis: 100000 }, 5)
    expect(r.quantity).toBe(500)
    expect(r.cost_basis).toBe(100000)   // per-share cost 1000 -> 200
  })
  it('a 1:1 bonus doubles shares, keeps cost basis', () => {
    const r = applyBonus({ quantity: 100, cost_basis: 100000 }, 1)
    expect(r.quantity).toBe(200)
    expect(r.cost_basis).toBe(100000)   // per-share cost halves
  })
})

describe('action support', () => {
  it('supports split/bonus, flags the rest', () => {
    expect(isSupportedAction('split')).toBe(true)
    expect(isSupportedAction('bonus')).toBe(true)
    expect(isSupportedAction('merger')).toBe(false)
    expect(isSupportedAction('rights')).toBe(false)
  })
})
