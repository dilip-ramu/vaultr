// What rate you actually got. The answer feeds the P/L, so every path
// through the arithmetic is checked.

import { describe, it, expect } from 'vitest'
import {
  computeReceipt, adjustmentValue, receiptWorkings, blendedRate,
  type ReceiptInput,
} from '@/lib/orders/receipt'

const base = (over: Partial<ReceiptInput> = {}): ReceiptInput => ({
  remittanceInr: 4228500, bankCharges: 2500, invoiceFx: 48000, ...over,
})

describe('the plain case', () => {
  it('divides the rupees that landed by the currency that settled', () => {
    // (42,28,500 − 2,500) ÷ 48,000
    const r = computeReceipt(base())
    expect(r.netInr).toBe(4226000)
    expect(r.settledFx).toBe(48000)
    expect(r.realisedRate).toBe(88.0417)
  })

  it('works with no bank charges at all', () => {
    expect(computeReceipt(base({ bankCharges: 0 })).realisedRate).toBe(88.0938)
  })

  it('ignores a negative charge rather than paying you for it', () => {
    expect(computeReceipt(base({ bankCharges: -2500 })).netInr).toBe(4228500)
  })

  it('quotes the rate to four places, because two loses money on a remittance', () => {
    const r = computeReceipt({ remittanceInr: 1000000, bankCharges: 0, invoiceFx: 11111 })
    expect(r.realisedRate).toBe(90.0009)
  })
})

describe('an adjustment in the order currency', () => {
  it('a short payment settles less, so the rate on what settled is higher', () => {
    const r = computeReceipt(base({ adjustment: { amount: 500, currency: 'fx', sign: 'deduct' } }))
    expect(r.settledFx).toBe(47500)
    expect(r.realisedRate).toBe(88.9684)
  })

  it('an addition settles more', () => {
    const r = computeReceipt(base({ adjustment: { amount: 500, currency: 'fx', sign: 'add' } }))
    expect(r.settledFx).toBe(48500)
  })

  it('leaves the rupees alone', () => {
    expect(computeReceipt(base({ adjustment: { amount: 500, currency: 'fx', sign: 'deduct' } })).netInr)
      .toBe(computeReceipt(base()).netInr)
  })
})

describe('an adjustment in rupees', () => {
  it('goes with the rupees, because converting it would need the rate itself', () => {
    const r = computeReceipt(base({ adjustment: { amount: 20000, currency: 'inr', sign: 'deduct' } }))
    expect(r.netInr).toBe(4206000)
    expect(r.settledFx).toBe(48000)
  })

  it('an addition raises what you got', () => {
    expect(computeReceipt(base({ adjustment: { amount: 20000, currency: 'inr', sign: 'add' } })).netInr)
      .toBe(4246000)
  })
})

describe('the sign', () => {
  it('adds for an addition and subtracts for a deduction', () => {
    expect(adjustmentValue({ amount: 500, currency: 'fx', sign: 'add' })).toBe(500)
    expect(adjustmentValue({ amount: 500, currency: 'fx', sign: 'deduct' })).toBe(-500)
  })

  it('takes the size from the amount however it was typed', () => {
    // Somebody typing −500 and choosing Deduct means 500 off, not 500 on.
    expect(adjustmentValue({ amount: -500, currency: 'fx', sign: 'deduct' })).toBe(-500)
  })

  it('is nothing when there is no adjustment', () => {
    expect(adjustmentValue(null)).toBe(0)
    expect(adjustmentValue(undefined)).toBe(0)
  })
})

describe('when it cannot be worked out', () => {
  it('refuses to divide by nothing settled', () => {
    const r = computeReceipt(base({ invoiceFx: 0 }))
    expect(r.realisedRate).toBe(null)
    expect(r.problem).toContain('Nothing settled')
  })

  it('refuses when an adjustment wipes out the whole invoice', () => {
    expect(computeReceipt(base({ adjustment: { amount: 48000, currency: 'fx', sign: 'deduct' } })).realisedRate).toBe(null)
  })

  it('refuses when the charges swallow the remittance', () => {
    const r = computeReceipt({ remittanceInr: 2000, bankCharges: 2000, invoiceFx: 100 })
    expect(r.realisedRate).toBe(null)
    expect(r.problem).toBe('Nothing received after charges')
  })

  it('survives rubbish instead of returning NaN', () => {
    const r = computeReceipt({ remittanceInr: NaN, bankCharges: NaN, invoiceFx: NaN })
    expect(r.realisedRate).toBe(null)
    expect(Number.isNaN(r.netInr)).toBe(false)
  })
})

describe('showing the sum', () => {
  it('writes out both sides so the rate is not a number to be trusted blindly', () => {
    const lines = receiptWorkings(base(), 'USD')
    expect(lines[0]).toContain('bank charges')
    expect(lines).toContain('= ₹42,26,000')
    expect(lines[lines.length - 1]).toBe('= USD 48,000 settled')
  })

  it('shows a currency adjustment on the currency side only', () => {
    const lines = receiptWorkings(base({ adjustment: { amount: 500, currency: 'fx', sign: 'deduct' } }), 'USD')
    expect(lines.join(' ')).toContain('− USD 500 deduction')
    expect(lines.join(' ')).not.toContain('₹500')
  })

  it('shows a rupee adjustment on the rupee side only', () => {
    const lines = receiptWorkings(base({ adjustment: { amount: 20000, currency: 'inr', sign: 'add' } }), 'USD')
    expect(lines.join(' ')).toContain('+ ₹20,000 addition')
  })
})

describe('the rate across several receipts', () => {
  it('weights by what each one settled, rather than averaging the rates', () => {
    // $40,000 at 88 and $1,000 at 95 is not 91.5.
    const rate = blendedRate([
      { netInr: 3520000, settledFx: 40000 },
      { netInr: 95000, settledFx: 1000 },
    ])
    expect(rate).toBe(88.1707)
  })

  it('is a single receipt when there is only one', () => {
    expect(blendedRate([{ netInr: 4226000, settledFx: 48000 }])).toBe(88.0417)
  })

  it('is nothing when nothing has settled', () => {
    expect(blendedRate([])).toBe(null)
    expect(blendedRate([{ netInr: 1000, settledFx: 0 }])).toBe(null)
  })
})
