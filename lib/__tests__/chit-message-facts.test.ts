import { describe, it, expect } from 'vitest'
import {
  factsFor, auctionSettled, monthLabel, firstName, pendingDues, oneMonthOn,
  nextAuctionDateFor,
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
    expect(f.accountNumber).toBe('50100123454321')
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

describe('what a member still owes in all', () => {
  const months = [
    { month_number: 1, dividend_per_member: 1000 },
    { month_number: 2, dividend_per_member: 1500 },
    { month_number: 3, dividend_per_member: 2000 },
  ]

  it('adds up every month run that was not paid for', () => {
    // 25,000 less each month's dividend: 24,000 + 23,500 + 23,000.
    expect(pendingDues({ installment: 25000, auctions: months, paidMonths: [], uptoMonth: 3 }))
      .toBe(70500)
  })

  it('leaves out the months already paid', () => {
    expect(pendingDues({ installment: 25000, auctions: months, paidMonths: [1, 2], uptoMonth: 3 }))
      .toBe(23000)
  })

  // A month that has not been auctioned yet is not owed yet.
  it('counts nothing past this month', () => {
    expect(pendingDues({ installment: 25000, auctions: months, paidMonths: [], uptoMonth: 1 }))
      .toBe(24000)
  })

  it('is nothing when everything is paid', () => {
    expect(pendingDues({ installment: 25000, auctions: months, paidMonths: [1, 2, 3], uptoMonth: 3 }))
      .toBe(0)
  })

  it('never counts a month as negative, however large the dividend', () => {
    expect(pendingDues({
      installment: 25000,
      auctions: [{ month_number: 1, dividend_per_member: 40000 }],
      paidMonths: [], uptoMonth: 1,
    })).toBe(0)
  })
})

describe('the winner’s own netting', () => {
  const months = [
    { month_number: 6, dividend_per_member: 1500 },
    { month_number: 7, dividend_per_member: 1750 },
  ]

  it('deducts what they owe from the winning amount', () => {
    const f = factsFor(input({ allAuctions: months, paidMonths: [6] }))
    // Month 7 unpaid: 25,000 less 1,750.
    expect(f.pendingDues).toBe(23250)
    expect(f.netPayout).toBe(440000)
    expect(f.payoutAfterDues).toBe(416750)
  })

  it('pays the whole amount to somebody who owes nothing', () => {
    const f = factsFor(input({ allAuctions: months, paidMonths: [6, 7] }))
    expect(f.pendingDues).toBe(0)
    expect(f.payoutAfterDues).toBe(440000)
  })

  // Without the months and the payments there is nothing to work it out from,
  // and a message asking for it should not be sent rather than show a wrong
  // figure.
  it('is unknown when the months were not passed in', () => {
    const f = factsFor(input())
    expect(f.pendingDues).toBeNull()
    expect(f.payoutAfterDues).toBeNull()
  })
})

describe('the auction coming, as opposed to the one just held', () => {
  it('names the month the next auction falls in', () => {
    const f = factsFor(input({ nextAuctionDate: '2026-12-05' }))
    expect(f.month).toBe('November 2026')
    expect(f.nextMonth).toBe('December 2026')
    expect(f.nextMonthNumber).toBe(8)
  })

  // A skipped or rescheduled month must not be guessed at by adding one.
  it('takes the month from the date, not by counting', () => {
    expect(factsFor(input({ nextAuctionDate: '2027-01-15' })).nextMonth).toBe('January 2027')
  })

  // The chit has finished, or the next auction is not scheduled. A notice
  // with nothing to announce is held rather than sent half-filled.
  it('has nothing to say when the next auction is unknown', () => {
    const f = factsFor(input({ nextAuctionDate: null }))
    expect(f.nextMonth).toBeNull()
    expect(f.nextAuctionDate).toBeNull()
  })
})

describe('a month on, when nothing says otherwise', () => {
  // A notice must not be held back because next month's auction has not been
  // entered yet. There is always a month after this one.
  it('lands on the same day next month', () => {
    expect(oneMonthOn('2026-11-05', 5)).toBe('2026-12-05')
    expect(oneMonthOn('2026-11-05', null)).toBe('2026-12-05')
  })

  it('crosses the year', () => {
    expect(oneMonthOn('2026-12-05', 5)).toBe('2027-01-05')
  })

  // A chit auctioned on the 31st falls on the 28th in February, not in March.
  it('clamps to the length of the month', () => {
    expect(oneMonthOn('2027-01-31', 31)).toBe('2027-02-28')
    expect(oneMonthOn('2028-01-31', 31)).toBe('2028-02-29')
    expect(oneMonthOn('2026-10-31', 31)).toBe('2026-11-30')
  })

  it('follows the group’s auction day over the date it was actually held', () => {
    // Held late on the 9th, but the chit's day is the 5th.
    expect(oneMonthOn('2026-11-09', 5)).toBe('2026-12-05')
  })

  it('has nothing to say about an unreadable date', () => {
    expect(oneMonthOn('', 5)).toBeNull()
    expect(oneMonthOn('next month', 5)).toBeNull()
  })
})

describe('nextAuctionDateFor — the chit that has not started', () => {
  it('names the first auction when nothing has been auctioned yet', () => {
    // The case that held every "welcome to the chit" message: a brand-new
    // group, no auction row anywhere, so nothing to count a month on from.
    expect(nextAuctionDateFor({
      startDate: '2026-12-05', auctionDay: 5, lastMonthNumber: 0,
      today: '2026-11-25', months: 20,
    })).toBe('2026-12-05')
  })

  it('skips the months that have already gone by', () => {
    // Started in April, nothing recorded, today is November: the next one a
    // member can actually attend is December, not April.
    expect(nextAuctionDateFor({
      startDate: '2026-04-05', auctionDay: 5, lastMonthNumber: 0,
      today: '2026-11-25', months: 20,
    })).toBe('2026-12-05')
  })

  it('counts from the last auction once there is one', () => {
    expect(nextAuctionDateFor({
      startDate: '2026-04-05', auctionDay: 5,
      lastAuctionDate: '2026-11-05', lastMonthNumber: 8,
      today: '2026-11-25', months: 20,
    })).toBe('2026-12-05')
  })

  it('falls back to a month on when the chit has no start date', () => {
    expect(nextAuctionDateFor({
      startDate: null, auctionDay: 5,
      lastAuctionDate: '2026-11-05', lastMonthNumber: 8,
      today: '2026-11-25',
    })).toBe('2026-12-05')
  })

  it('says nothing only when there is nothing at all to go on', () => {
    expect(nextAuctionDateFor({ today: '2026-11-25' })).toBeNull()
  })

  it('still answers for a chit whose months have all run out', () => {
    // Every scheduled date is in the past and nothing was recorded. Saying
    // "the first one" is honest; saying nothing holds the message for ever.
    expect(nextAuctionDateFor({
      startDate: '2024-01-10', auctionDay: 10, lastMonthNumber: 0,
      today: '2026-11-25', months: 12,
    })).toBe('2024-01-10')
  })

  it('lands on the last day of a short month', () => {
    expect(nextAuctionDateFor({
      startDate: '2027-01-31', auctionDay: 31, lastMonthNumber: 0,
      today: '2027-02-01', months: 12,
    })).toBe('2027-02-28')
  })
})
