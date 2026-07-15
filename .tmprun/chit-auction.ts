import { describe, it, expect } from './shim'
import {
  monthlyInstallment, numberOfMonths, monthlyCommission, bidCeiling,
  runAuction, groupTotals, validateGroup, monthlyDue,
  type GroupParams,
} from '../lib/chit/auction'

// A ₹1,00,000 chit, 20 members, 5% commission, 30% bid ceiling.
const MONTHLY: GroupParams = {
  chitValue: 100000, members: 20, commissionPct: 5, bidCeilingPct: 30, model: 'MONTHLY',
}
const UPFRONT: GroupParams = { ...MONTHLY, model: 'UPFRONT' }

describe('the group figures', () => {
  it('installment is the pot split across members', () => {
    expect(monthlyInstallment(MONTHLY)).toBe(5000)          // 100000 / 20
  })

  it('MONTHLY runs one month per member', () => {
    expect(numberOfMonths(MONTHLY)).toBe(20)
  })

  it('UPFRONT runs an extra month, because month 1 is the foreman’s', () => {
    expect(numberOfMonths(UPFRONT)).toBe(21)
  })

  it('the fixed commission is a percent of the pot', () => {
    expect(monthlyCommission(MONTHLY)).toBe(5000)           // 5% of 100000
  })

  it('the ceiling caps how far a bid can go', () => {
    expect(bidCeiling(MONTHLY)).toBe(30000)                 // 30% of 100000
  })
})

describe('a MONTHLY auction', () => {
  // A member bids away ₹15,000 to take the pot this month.
  const r = runAuction({ group: MONTHLY, monthNumber: 3, bidAmount: 15000 })

  it('the winner takes the pot minus their own bid', () => {
    expect(r.netPayout).toBe(85000)                         // 100000 − 15000
  })

  it('the foreman takes the fixed cut — out of the discount, not the payout', () => {
    expect(r.commission).toBe(5000)
  })

  it('what’s left of the discount is shared to every member', () => {
    // (15000 − 5000) / 20 = 500 each
    expect(r.dividendPerMember).toBe(500)
  })

  it('so this month a member pays the installment less their dividend', () => {
    expect(r.netInstallment).toBe(4500)                     // 5000 − 500
  })

  it('a higher commission shrinks the DIVIDEND, never the payout', () => {
    const dear = runAuction({ group: { ...MONTHLY, commissionPct: 10 }, monthNumber: 3, bidAmount: 15000 })
    expect(dear.netPayout).toBe(85000)                      // winner unaffected
    expect(dear.dividendPerMember).toBe(250)               // (15000 − 10000) / 20 — members earn less
  })
})

describe('the bid ceiling actually bites', () => {
  it('caps a bid that exceeds it, and says it did', () => {
    const r = runAuction({ group: MONTHLY, monthNumber: 5, bidAmount: 45000 })   // over the 30000 cap
    expect(r.discount).toBe(30000)
    expect(r.cappedFrom).toBe(45000)
    expect(r.netPayout).toBe(70000)                        // 100000 − 30000, not − 45000
  })

  it('leaves an in-range bid untouched', () => {
    expect(runAuction({ group: MONTHLY, monthNumber: 5, bidAmount: 12000 }).cappedFrom).toBeUndefined()
  })
})

describe('the UPFRONT model', () => {
  it('month 1: the foreman takes the whole pot, nobody is paid', () => {
    const r = runAuction({ group: UPFRONT, monthNumber: 1, bidAmount: 99999 })
    expect(r.isForemanMonth).toBe(true)
    expect(r.commission).toBe(100000)     // the entire pot is the fee
    expect(r.netPayout).toBe(0)           // no member is paid
    expect(r.dividendPerMember).toBe(0)   // and nothing is shared
    expect(r.netInstallment).toBe(5000)   // members still pay their installment
  })

  it('month 2 onward: no commission, winner takes the FULL pot less their bid', () => {
    const r = runAuction({ group: UPFRONT, monthNumber: 2, bidAmount: 15000 })
    expect(r.isForemanMonth).toBe(false)
    expect(r.commission).toBe(0)                       // the foreman already took theirs, upfront
    expect(r.netPayout).toBe(85000)                    // 100000 − 15000
    // the whole discount is the members' dividend — nothing is skimmed
    expect(r.dividendPerMember).toBe(750)              // 15000 / 20
    expect(r.netInstallment).toBe(4250)                // 5000 − 750
  })

  it('the bid still cannot exceed the ceiling in later months', () => {
    const r = runAuction({ group: UPFRONT, monthNumber: 4, bidAmount: 50000 })
    expect(r.discount).toBe(30000)
    expect(r.netPayout).toBe(70000)
  })
})

describe('a bid of zero — nobody wanting a discount', () => {
  it('MONTHLY still pays the foreman, so the dividend can go negative-free', () => {
    const r = runAuction({ group: MONTHLY, monthNumber: 8, bidAmount: 0 })
    expect(r.netPayout).toBe(100000)          // winner takes the whole pot
    expect(r.commission).toBe(5000)
    // discount 0 − commission 5000 would be negative; the members don't PAY the
    // foreman out of pocket, so the dividend floors at zero.
    expect(r.dividendPerMember).toBe(0)
    expect(r.netInstallment).toBe(5000)
  })
})

describe('excluding some members from the dividend', () => {
  it('divides the dividend across only the paying members you name', () => {
    const r = runAuction({ group: MONTHLY, monthNumber: 3, bidAmount: 15000, payingMembers: 10 })
    expect(r.dividendPerMember).toBe(1000)    // (15000 − 5000) / 10
  })
})

describe('whole-group projection', () => {
  it('MONTHLY: the foreman earns the fixed cut every month', () => {
    const t = groupTotals(MONTHLY)
    expect(t.months).toBe(20)
    expect(t.foremanTotal).toBe(100000)       // 5000 × 20
    expect(t.grossPerMember).toBe(100000)     // 5000 × 20
  })

  it('UPFRONT: the foreman earns the first pot, once', () => {
    const t = groupTotals(UPFRONT)
    expect(t.months).toBe(21)
    expect(t.foremanTotal).toBe(100000)       // the one upfront pot
    expect(t.grossPerMember).toBe(105000)     // 5000 × 21 — members pay one extra month
  })
})

describe('validation', () => {
  it('needs a pot and at least two members', () => {
    expect(validateGroup({ chitValue: 0, members: 20, commissionPct: 5, bidCeilingPct: 30, model: 'MONTHLY' }).ok).toBe(false)
    expect(validateGroup({ chitValue: 100000, members: 1, commissionPct: 5, bidCeilingPct: 30, model: 'MONTHLY' }).ok).toBe(false)
    expect(validateGroup(MONTHLY).ok).toBe(true)
  })

  it('rejects nonsense percentages and a missing model', () => {
    expect(validateGroup({ ...MONTHLY, commissionPct: 150 }).ok).toBe(false)
    expect(validateGroup({ chitValue: 100000, members: 20 }).ok).toBe(false)   // no model
  })
})

describe('what a member owes for a month, after the dividend', () => {
  // MONTHLY, ₹1L / 20, someone bid ₹15,000: dividend was ₹500/member (tested
  // above). So the due that month is 5000 − 500 = 4500 — NOT the flat 5000.
  it('subtracts the same month’s dividend from the installment', () => {
    const inst = monthlyInstallment(MONTHLY)   // 5000
    const div = runAuction({ group: MONTHLY, monthNumber: 3, bidAmount: 15000 }).dividendPerMember  // 500
    expect(monthlyDue(inst, div)).toBe(4500)
  })

  it('is the full installment before the month’s auction has run (no dividend)', () => {
    expect(monthlyDue(5000, 0)).toBe(5000)
  })

  it('never goes below zero, even if a dividend somehow exceeds the installment', () => {
    expect(monthlyDue(5000, 9000)).toBe(0)
  })

  it('matches the auction’s own netInstallment', () => {
    const r = runAuction({ group: MONTHLY, monthNumber: 3, bidAmount: 15000 })
    expect(monthlyDue(monthlyInstallment(MONTHLY), r.dividendPerMember)).toBe(r.netInstallment)
  })
})
