import { describe, it, expect } from 'vitest'
import { outstanding, creditMetrics, loanMetrics, creditSummary, type AccountLike } from '../account-metrics'

const card = (over: Partial<AccountLike>): AccountLike => ({ type: 'credit', ...over })
const loan = (over: Partial<AccountLike>): AccountLike => ({ type: 'loan', ...over })

describe('outstanding', () => {
  it('owed = negative balance; positive balance owes nothing', () => {
    expect(outstanding(card({ balance: -8400 }))).toBe(8400)
    expect(outstanding(card({ balance: 500 }))).toBe(0) // overpaid card
    expect(outstanding(card({ balance: 0 }))).toBe(0)
  })
})

describe('creditMetrics', () => {
  it('available = limit − outstanding, utilisation = owed/limit', () => {
    const m = creditMetrics(card({ balance: -20000, credit_limit: 100000 }))
    expect(m.outstanding).toBe(20000)
    expect(m.available).toBe(80000)
    expect(m.utilisation).toBe(0.2)
    expect(m.overLimit).toBe(false)
  })

  it('flags over-limit and never shows negative available', () => {
    const m = creditMetrics(card({ balance: -120000, credit_limit: 100000 }))
    expect(m.available).toBe(0)
    expect(m.overLimit).toBe(true)
    expect(m.utilisation).toBe(1.2)
  })

  it('no limit set → available/utilisation unknown (null), not zero', () => {
    const m = creditMetrics(card({ balance: -5000 }))
    expect(m.outstanding).toBe(5000)
    expect(m.available).toBe(null)
    expect(m.utilisation).toBe(null)
  })

  it('overpaid card reports a credit balance', () => {
    const m = creditMetrics(card({ balance: 1500, credit_limit: 50000 }))
    expect(m.outstanding).toBe(0)
    expect(m.available).toBe(50000)
    expect(m.creditBalance).toBe(1500)
  })
})

describe('loanMetrics', () => {
  it('repaid = principal − outstanding, with progress', () => {
    const m = loanMetrics(loan({ balance: -300000, loan_principal: 500000, emi_amount: 12000, interest_rate: 9.5 }))
    expect(m.outstanding).toBe(300000)
    expect(m.repaid).toBe(200000)
    expect(m.progress).toBe(0.4)
    expect(m.emi).toBe(12000)
    expect(m.rate).toBe(9.5)
  })

  it('no principal → repaid/progress unknown', () => {
    const m = loanMetrics(loan({ balance: -100000 }))
    expect(m.outstanding).toBe(100000)
    expect(m.repaid).toBe(null)
    expect(m.progress).toBe(null)
  })
})

describe('creditSummary (dashboard rollup)', () => {
  it('totals available, outstanding and overall utilisation', () => {
    const s = creditSummary([
      card({ balance: -20000, credit_limit: 100000 }),  // owe 20k, avail 80k
      card({ balance: -5000,  credit_limit: 50000 }),   // owe 5k, avail 45k
      loan({ balance: -300000, loan_principal: 500000 }), // owe 300k
      { type: 'savings', balance: 100000 },             // ignored
    ])
    expect(s.totalAvailable).toBe(125000)
    expect(s.totalCardOutstanding).toBe(25000)
    expect(s.totalLoanOutstanding).toBe(300000)
    expect(s.totalOutstanding).toBe(325000)
    expect(s.totalLimit).toBe(150000)
    expect(s.overallUtilisation).toBe(0.17) // 25k/150k rounded for display
  })

  it('no cards with limits → utilisation null', () => {
    const s = creditSummary([card({ balance: -1000 })])
    expect(s.overallUtilisation).toBe(null)
    expect(s.totalCardOutstanding).toBe(1000)
  })
})
