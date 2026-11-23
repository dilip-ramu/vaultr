import { describe, it, expect } from 'vitest'
import {
  factsFor, auctionSettled, monthLabel, firstName,
  type FactsInput, type GroupRow, type AuctionRow, type MemberRow,
} from '@/lib/chit/messageFacts'

const group: GroupRow = {
  name: 'Uma 5 Lakh A', chit_value: 500000, members: 20,
  commission_pct: 5, bid_ceiling_pct: 30, commission_model: 'MONTHLY',
  auction_day: 5, auction_time: '18:30', start_date: '2026-04-05',
}

const auction: AuctionRow = {
  month_number: 7, auction_date: '2026-11-05', winner_member_id: 'w1',
  bid_amount: 60000, commission: 25000, net_payout: 440000, dividend_per_member: 1750,
}

const member: MemberRow = {
  id: 'm1', name: 'Ravi', phone: '9876543210', member_code: 'M-014',
  address: '12 Kumaran Road', aadhaar: '1234 5678 4321', pan: 'ABCDE1234K',
  nominees: [{ name: 'Lakshmi', relation: 'wife' }], guarantors: [{ name: 'Murugan' }],
  bank_name: 'HDFC Bank', bank_account_name: 'R Ravi', bank_account_number: '50100123454321',
  bank_branch: 'Tiruppur Main', bank_ifsc: 'HDFC0001234',
}

const input = (o: Partial<FactsInput> = {}): FactsInput => ({
  group, auction, member, slotNumber: 7,
  winner: { name: 'Selvam', member_code: 'M-003' },
  nextAuctionDate: '2026-12-05', duesDueDays: 10, today: '2026-11-20',
  ...o,
})

describe('the month in words', () => {
  it('reads as a person would say it', () => {
    expect(monthLabel('2026-11-05')).toBe('November 2026')
  })
  it('passes anything it does not recognise through', () => {
    expect(monthLabel('later')).toBe('later')
  })
})

describe('the first nominee or guarantor', () => {
  it('takes the name off the first entry', () => {
    expect(firstName([{ name: 'Lakshmi' }, { name: 'Other' }])).toBe('Lakshmi')
  })
  it('has nothing to say for an empty or nameless list', () => {
    expect(firstName([])).toBeNull()
    expect(firstName([{ relation: 'wife' }])).toBeNull()
    expect(firstName(null)).toBeNull()
  })
})

describe('the figures behind a message', () => {
  it('works out what this member owes after their dividend', () => {
    const f = factsFor(input())
    expect(f.installment).toBe(25000)
    expect(f.amountDue).toBe(23250)
    expect(f.dividend).toBe(1750)
  })

  it('counts the due date from the auction, not the next one', () => {
    expect(factsFor(input()).dueDate).toBe('2026-11-15')
  })

  // Unset, the dues are owed by the next auction at the latest.
  it('falls back to the next auction when no due days are set', () => {
    expect(factsFor(input({ duesDueDays: null })).dueDate).toBe('2026-12-05')
  })

  it('carries the chit, its terms and its dates', () => {
    const f = factsFor(input())
    expect(f.groupName).toBe('Uma 5 Lakh A')
    expect(f.totalMonths).toBe(20)
    expect(f.startDate).toBe('2026-04-05')
    expect(f.endDate).toBe('2027-11-05')
    expect(f.auctionDay).toBe(5)
    expect(f.commissionAmount).toBe(25000)
    expect(f.maxDiscount).toBe(150000)
    expect(f.maxDiscountPct).toBe(30)
  })

  // An upfront chit runs one month longer than it has members.
  it('counts the extra month of an upfront chit', () => {
    const f = factsFor(input({ group: { ...group, commission_model: 'UPFRONT' } }))
    expect(f.totalMonths).toBe(21)
    expect(f.endDate).toBe('2027-12-05')
  })

  it('carries the member, their bank and their papers', () => {
    const f = factsFor(input())
    expect(f.memberName).toBe('Ravi')
    expect(f.slotNumber).toBe(7)
    expect(f.nomineeName).toBe('Lakshmi')
    expect(f.guarantorName).toBe('Murugan')
    expect(f.bankIfsc).toBe('HDFC0001234')
    expect(f.accountEnding).toBe('50100123454321')
  })

  it('names the winner separately from the reader', () => {
    const f = factsFor(input())
    expect(f.memberName).toBe('Ravi')
    expect(f.winnerName).toBe('Selvam')
    expect(f.winnerCode).toBe('M-003')
  })

  it('works out the discount shared with members', () => {
    // 60,000 bid less 25,000 commission.
    expect(factsFor(input()).discountShared).toBe(35000)
  })

  it('uses the rules frozen when bidding opened, over today’s settings', () => {
    const f = factsFor(input({ window: { ceiling_amount: 120000, min_increment: 500 } }))
    expect(f.maxDiscount).toBe(120000)
    expect(f.minBid).toBe(500)
  })

  // Before the first auction there is a group but no month, and a message that
  // needs a figure from one must not be filled with zeros.
  it('leaves every auction figure unknown when there is no auction', () => {
    const f = factsFor(input({ auction: null }))
    expect(f.amountDue).toBeNull()
    expect(f.dividend).toBeNull()
    expect(f.bidAmount).toBeNull()
    expect(f.netPayout).toBeNull()
    expect(f.dueDate).toBeNull()
    expect(f.auctionDate).toBeNull()
    // The chit's own terms are still known.
    expect(f.installment).toBe(25000)
    expect(f.chitValue).toBe(500000)
  })

  it('passes today through, so the days overdue can be counted', () => {
    expect(factsFor(input()).today).toBe('2026-11-20')
  })
})

describe('whether the auction has been recorded', () => {
  it('is settled once somebody has won', () => {
    expect(auctionSettled(auction)).toBe(true)
  })

  it('is settled by a recorded discount even with no winner', () => {
    expect(auctionSettled({ ...auction, winner_member_id: null })).toBe(true)
  })

  // The foreman's upfront month: a row exists, but no auction happened.
  it('is not settled by an empty row', () => {
    expect(auctionSettled({ month_number: 1, auction_date: '2026-04-05', bid_amount: 0 })).toBe(false)
    expect(auctionSettled(null)).toBe(false)
    expect(auctionSettled()).toBe(false)
  })
})
