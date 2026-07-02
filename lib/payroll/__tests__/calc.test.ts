import { describe, it, expect } from 'vitest'
import { calcEffectiveRate, calcSalaryInr, calcFinalPayable } from '../types'

describe('calcEffectiveRate', () => {
  it('(received − bank charges) / billed euros, rounded to 4dp', () => {
    // (₹5,00,000 − ₹500) / €5,000 = 99.9
    expect(calcEffectiveRate(500000, 500, 5000)).toBe(99.9)
  })

  it('rounds to 4 decimal places', () => {
    // (100000 − 0) / 3333 = 30.00300030... → 30.003
    expect(calcEffectiveRate(100000, 0, 3333)).toBe(30.003)
  })

  it('returns 0 when billed euros is zero (no divide-by-zero)', () => {
    expect(calcEffectiveRate(500000, 500, 0)).toBe(0)
  })

  it('returns 0 when billed euros is negative', () => {
    expect(calcEffectiveRate(500000, 500, -10)).toBe(0)
  })

  it('bank charges larger than received gives a negative rate (visible, not hidden)', () => {
    expect(calcEffectiveRate(100, 500, 10)).toBe(-40)
  })
})

describe('calcSalaryInr', () => {
  it('euro salary × expended rate, rounded to paise', () => {
    // €1,200 × 99.9 = ₹1,19,880
    expect(calcSalaryInr(1200, 99.9, 'EUR')).toBe(119880)
  })

  it('rounds to 2 decimal places', () => {
    // €1,234.56 × 91.2345 = 112,634.4576... → 112634.46
    expect(calcSalaryInr(1234.56, 91.2345, 'EUR')).toBe(112634.46)
  })

  it('zero salary or zero rate gives zero (non-INR)', () => {
    expect(calcSalaryInr(0, 99.9, 'EUR')).toBe(0)
    expect(calcSalaryInr(1200, 0, 'EUR')).toBe(0)
  })

  it('INR salary passes through 1:1, ignoring the rate', () => {
    expect(calcSalaryInr(1200, 99.9, 'INR')).toBe(1200)
    expect(calcSalaryInr(1234.567, 99.9, 'INR')).toBe(1234.57) // still rounds to paise
  })

  it('defaults to INR passthrough when currency is omitted', () => {
    expect(calcSalaryInr(1200, 99.9)).toBe(1200)
  })
})

describe('calcFinalPayable', () => {
  it('salary + allowances + overtime + incentives − deductions − advance', () => {
    expect(calcFinalPayable(100000, 5000, 2000, 1000, 3000, 10000)).toBe(95000)
  })

  it('no extras: final payable equals salary', () => {
    expect(calcFinalPayable(119880, 0, 0, 0, 0, 0)).toBe(119880)
  })

  it('deductions exceeding salary go negative (visible, not clamped)', () => {
    expect(calcFinalPayable(10000, 0, 0, 0, 5000, 20000)).toBe(-15000)
  })

  it('rounds to paise', () => {
    expect(calcFinalPayable(100.555, 0.001, 0, 0, 0, 0)).toBe(100.56)
  })
})
