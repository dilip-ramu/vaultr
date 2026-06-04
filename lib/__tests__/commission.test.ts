import { describe, it, expect } from 'vitest'
import { computeStyleAmounts } from '../commission'

const base = {
  quantity: '100',
  rate_per_piece: '50',
  commission_type: 'percentage' as const,
  commission_value: '10',
}

describe('computeStyleAmounts', () => {
  it('percentage: 10% of (100 pcs × ₹50) = ₹500', () => {
    const r = computeStyleAmounts(base, null, 'INR')
    expect(r.total).toBe(5000)
    expect(r.comm).toBe(500)
    expect(r.inr).toBe(500)
  })

  it('per-piece: 100 pcs × ₹2.5 = ₹250', () => {
    const r = computeStyleAmounts(
      { ...base, commission_type: 'per_piece', commission_value: '2.5' },
      null, 'INR',
    )
    expect(r.comm).toBe(250)
  })

  it('fixed: commission is the value itself, regardless of quantity', () => {
    const r = computeStyleAmounts(
      { ...base, commission_type: 'fixed', commission_value: '1234' },
      null, 'INR',
    )
    expect(r.comm).toBe(1234)
  })

  it('foreign currency converts at exchange rate: €500 × 90 = ₹45,000', () => {
    const r = computeStyleAmounts(base, 90, 'EUR')
    expect(r.comm).toBe(500)     // in EUR
    expect(r.inr).toBe(45000)
  })

  it('foreign currency with NO rate gives inr = 0, never the unconverted amount', () => {
    const r = computeStyleAmounts(base, null, 'EUR')
    expect(r.inr).toBe(0)
  })

  it('accepts numbers as well as form strings', () => {
    const r = computeStyleAmounts(
      { quantity: 100, rate_per_piece: 50, commission_type: 'percentage', commission_value: 10 },
      null, 'INR',
    )
    expect(r.comm).toBe(500)
  })

  it('blank/garbage form input counts as zero', () => {
    const r = computeStyleAmounts(
      { quantity: '', rate_per_piece: 'abc', commission_type: 'percentage', commission_value: '10' },
      null, 'INR',
    )
    expect(r.total).toBe(0)
    expect(r.comm).toBe(0)
  })
})
