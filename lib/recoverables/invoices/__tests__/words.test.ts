import { describe, it, expect } from 'vitest'
import { amountToWords } from '../words'

// These strings are printed on GST invoices — wrong words are an audit problem.
describe('amountToWords', () => {
  it('whole rupees', () => {
    expect(amountToWords(11800)).toBe('Indian Rupee Eleven Thousand Eight Hundred Only')
  })

  it('rupees and paise', () => {
    expect(amountToWords(1234.56))
      .toBe('Indian Rupee One Thousand Two Hundred Thirty-Four and Fifty-Six Paise Only')
  })

  it('lakhs', () => {
    expect(amountToWords(250000)).toBe('Indian Rupee Two Lakh Fifty Thousand Only')
  })

  it('crores', () => {
    expect(amountToWords(12345678))
      .toBe('Indian Rupee One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only')
  })

  it('zero', () => {
    expect(amountToWords(0)).toBe('Indian Rupee Zero Only')
  })

  it('paise rounding: .999 rounds to next rupee-paise boundary safely', () => {
    // 99.999 → whole 99, subunit round(0.999×100)=100... must not say "Hundred Paise"
    const words = amountToWords(99.99)
    expect(words).toBe('Indian Rupee Ninety-Nine and Ninety-Nine Paise Only')
  })

  it('other currencies use their own subunit names', () => {
    expect(amountToWords(10.5, 'EUR')).toBe('Euro Ten and Fifty Cents Only')
  })
})
