import { describe, it, expect } from 'vitest'
import {
  forexCost, forexValue, forexGain, forexRateChangePct, hasRate, validateForex,
} from '@/lib/assets/forex'

// Rates as set on the Currencies page: ₹ per unit.
const rates = { EUR: 95, USD: 84 }

// €500 bought when the euro was ₹91.
const euros = { fx_currency: 'EUR', fx_amount: 500, fx_acquired_rate: 91 }

describe('what it cost and what it is worth', () => {
  it('cost is what you actually paid in rupees', () => {
    expect(forexCost(euros)).toBe(45500)          // 500 × 91
  })

  it('value is the same currency at TODAY’s rate', () => {
    expect(forexValue(euros, rates)).toBe(47500)  // 500 × 95
  })

  // This is the whole point of the asset: you didn't spend anything, and you're
  // ₹2,000 richer, purely because the euro moved.
  it('the gain is the rate move, nothing else', () => {
    expect(forexGain(euros, rates)).toBe(2000)
    expect(forexRateChangePct(euros, rates)).toBe(4.4)
  })

  it('goes negative when the rupee strengthens', () => {
    const weak = { EUR: 88 }
    expect(forexGain(euros, weak)).toBe(-1500)
    expect(forexRateChangePct(euros, weak)).toBe(-3.3)
  })
})

describe('a currency with no rate on the Currencies page', () => {
  const pounds = { fx_currency: 'GBP', fx_amount: 200, fx_acquired_rate: 105 }

  // THE TRAP, again: unknown is not zero, and it is not cost.
  // Zero deletes £200 from your net worth. Cost pretends the rate never moved —
  // which is the only thing this asset does.
  it('is worth UNKNOWN — not zero, not cost', () => {
    expect(forexValue(pounds, rates)).toBeNull()
    expect(forexGain(pounds, rates)).toBeNull()
    expect(forexCost(pounds)).toBe(21000)          // …but the cost is still known
  })

  it('says plainly that it has no rate, so the UI can tell you to go set one', () => {
    expect(hasRate(pounds, rates)).toBe(false)
    expect(hasRate(euros, rates)).toBe(true)
  })

  it('treats a zero or junk rate as no rate at all', () => {
    expect(forexValue(euros, { EUR: 0 })).toBeNull()
    expect(forexValue(euros, { EUR: NaN })).toBeNull()
  })

  it('is worth exactly zero when you hold none — that IS knowable', () => {
    expect(forexValue({ fx_currency: 'EUR', fx_amount: 0 }, rates)).toBe(0)
  })
})

describe('validation', () => {
  it('needs a currency, an amount, and the rate you got it at', () => {
    expect(validateForex({ fx_amount: 500, fx_acquired_rate: 91 }).ok).toBe(false)
    expect(validateForex({ fx_currency: 'EUR', fx_acquired_rate: 91 }).ok).toBe(false)
    expect(validateForex({ fx_currency: 'EUR', fx_amount: 500 }).ok).toBe(false)
    expect(validateForex(euros).ok).toBe(true)
  })

  it('explains what is missing rather than just refusing', () => {
    expect(validateForex({}).errors.join(' ')).toContain('currency')
  })
})
