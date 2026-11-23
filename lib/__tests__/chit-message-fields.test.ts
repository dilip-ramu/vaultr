import { describe, it, expect } from 'vitest'
import {
  FIELDS, field, money, dateWords, safeVar, daysOverdue, valueFor,
  renderFields, fieldWords, fieldProblem, fieldsFor, ordinal, trimPct,
  type Facts, type FieldId,
} from '@/lib/chit/messageFields'

const facts = (o: Partial<Facts> = {}): Facts => ({
  memberName: 'Ravi', groupName: 'Uma 5 Lakh A', month: 'November 2026',
  chitValue: 500000, installment: 25000, membersCount: 20, monthNumber: 7,
  auctionDate: '2026-11-05', auctionTime: '6:30 PM', nextAuctionDate: '2026-12-05',
  amountDue: 23750, dividend: 1250, dueDate: '2026-11-15',
  bidAmount: 60000, netPayout: 425000,
  bankName: 'HDFC Bank', accountEnding: '123456784321',
  memberCode: 'M-014', today: '2026-11-20',
  totalMonths: 20, startDate: '2026-04-05', endDate: '2027-11-05', auctionDay: 5,
  commissionPct: 5, commissionAmount: 25000,
  minBid: 100, maxDiscount: 150000, maxDiscountPct: 30,
  ...o,
})

describe('the catalogue itself', () => {
  it('has no duplicate ids', () => {
    const ids = FIELDS.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Meta rejects these characters in an example value, and the examples come
  // from here — so a bad sample would make a template unsubmittable with no
  // way for the user to fix it.
  it('has samples Meta will accept', () => {
    for (const f of FIELDS) {
      expect(f.sample).not.toMatch(/[#$%]/)
      expect(f.sample).not.toMatch(/[\n\r\t]/)
      expect(f.sample.trim()).not.toBe('')
    }
  })

  it('finds a field by id, and tolerates spacing', () => {
    expect(field('member_name')?.label).toBe('member name')
    expect(field(' member_name ')?.label).toBe('member name')
    expect(field('nonsense')).toBeUndefined()
  })
})

describe('formatting', () => {
  it('writes rupees the Indian way', () => {
    expect(money(500000)).toBe('5,00,000')
    expect(money(23750.4)).toBe('23,750')
    expect(money(Number.NaN)).toBe('0')
  })

  it('writes a date as a person reads it', () => {
    expect(dateWords('2026-11-05')).toBe('5 November 2026')
    expect(dateWords('2026-11-05T00:00:00Z')).toBe('5 November 2026')
    expect(dateWords(null)).toBeNull()
    expect(dateWords('')).toBeNull()
  })

  it('flattens anything Meta would reject in a variable', () => {
    expect(safeVar('a\nb')).toBe('a b')
    expect(safeVar('  spaced   out ')).toBe('spaced out')
    expect(safeVar(null)).toBe('')
  })
})

describe('counting the days late', () => {
  it('counts from the due date', () => {
    expect(daysOverdue('2026-11-15', '2026-11-20')).toBe(5)
  })
  it('is zero on the day and before it', () => {
    expect(daysOverdue('2026-11-15', '2026-11-15')).toBe(0)
    expect(daysOverdue('2026-11-15', '2026-11-01')).toBe(0)
  })
  it('is zero when either date is missing or malformed', () => {
    expect(daysOverdue(null, '2026-11-20')).toBe(0)
    expect(daysOverdue('15/11/2026', '2026-11-20')).toBe(0)
  })
})

describe('what a field is worth', () => {
  it('fills in the ordinary ones', () => {
    const f = facts()
    expect(valueFor('member_name', f)).toBe('Ravi')
    expect(valueFor('chit_value', f)).toBe('5,00,000')
    expect(valueFor('auction_date', f)).toBe('5 November 2026')
    expect(valueFor('month_number', f)).toBe('7')
  })

  // The whole account number must never reach a WhatsApp message.
  it('gives only the last four digits of an account', () => {
    expect(valueFor('account_ending', facts())).toBe('4321')
    expect(valueFor('account_ending', facts({ accountEnding: '321' }))).toBeNull()
  })

  it('counts the days overdue against today', () => {
    expect(valueFor('days_overdue', facts())).toBe('5')
  })

  // 'overdue by 0 days' is worse than sending nothing, so it reads as unknown.
  it('treats nothing overdue as unknown, not as zero', () => {
    expect(valueFor('days_overdue', facts({ today: '2026-11-10' }))).toBeNull()
  })

  // A zero dividend in the first month is the truth, not a missing fact.
  it('keeps a real zero', () => {
    expect(valueFor('dividend', facts({ dividend: 0 }))).toBe('0')
  })

  it('reports a missing fact as unknown', () => {
    expect(valueFor('net_payout', facts({ netPayout: null }))).toBeNull()
    expect(valueFor('member_code', facts({ memberCode: null }))).toBeNull()
    expect(valueFor('auction_time', facts({ auctionTime: '  ' }))).toBeNull()
  })
})

describe('rendering a list of fields', () => {
  it('returns the values in order', () => {
    const r = renderFields(['member_name', 'month', 'amount_due'], facts())
    expect(r.values).toEqual(['Ravi', 'November 2026', '23,750'])
    expect(r.missing).toEqual([])
  })

  it('names what is missing rather than sending a blank', () => {
    const r = renderFields(['member_name', 'net_payout'], facts({ netPayout: null }))
    expect(r.missing).toEqual(['net_payout'])
  })

  it('says what is missing in a sentence', () => {
    expect(fieldWords([])).toBe('')
    expect(fieldWords(['bid_amount'])).toBe('bid amount')
    expect(fieldWords(['bid_amount', 'bank_name'])).toBe('bid amount and their bank')
    expect(fieldWords(['bid_amount', 'bank_name', 'net_payout']))
      .toBe('bid amount, their bank and amount payable to them')
  })
})

describe('a field used where it cannot be honest', () => {
  it('lets a winner detail through in a winner message', () => {
    expect(fieldProblem('bid_amount', 'winner')).toBeNull()
  })

  it('stops a winner detail in a message to everybody', () => {
    expect(fieldProblem('bid_amount', 'all')).toContain('only exists for the auction winner')
  })

  it('stops a day count in a message to everybody', () => {
    expect(fieldProblem('days_overdue', 'all')).toContain('still owe')
  })

  it('allows the ordinary fields anywhere', () => {
    for (const a of ['all', 'winner', 'unpaid'] as const) {
      expect(fieldProblem('member_name', a)).toBeNull()
      expect(fieldProblem('month', a)).toBeNull()
    }
  })

  it('refuses a field it has never heard of', () => {
    expect(fieldProblem('nonsense' as FieldId, 'all')).toContain('no detail called')
  })

  it('offers only the fields that suit the audience', () => {
    const all = fieldsFor('all').map(f => f.id)
    expect(all).toContain('member_name')
    expect(all).not.toContain('bid_amount')
    expect(all).not.toContain('days_overdue')
    expect(fieldsFor('winner').map(f => f.id)).toContain('net_payout')
    expect(fieldsFor('unpaid').map(f => f.id)).toContain('days_overdue')
  })
})

describe('the chit\u2019s own terms', () => {
  it('gives the length of the chit and where it is', () => {
    const f = facts()
    expect(valueFor('total_months', f)).toBe('20')
    expect(valueFor('months_left', f)).toBe('13')
    expect(valueFor('start_date', f)).toBe('5 April 2026')
    expect(valueFor('end_date', f)).toBe('5 November 2027')
    expect(valueFor('auction_day', f)).toBe('5th')
  })

  it('gives the rules of the auction', () => {
    const f = facts()
    expect(valueFor('commission_pct', f)).toBe('5')
    expect(valueFor('commission_amount', f)).toBe('25,000')
    expect(valueFor('min_bid', f)).toBe('100')
    expect(valueFor('max_discount', f)).toBe('1,50,000')
    expect(valueFor('max_discount_pct', f)).toBe('30')
  })

  // The last month is not 'minus one month left'.
  it('will not report a negative number of months left', () => {
    expect(valueFor('months_left', facts({ monthNumber: 21 }))).toBeNull()
    expect(valueFor('months_left', facts({ monthNumber: 20 }))).toBe('0')
  })

  it('reports a term that has not been set as unknown', () => {
    expect(valueFor('start_date', facts({ startDate: null }))).toBeNull()
    expect(valueFor('auction_day', facts({ auctionDay: null }))).toBeNull()
    expect(valueFor('total_months', facts({ totalMonths: null }))).toBeNull()
  })

  it('writes the day of the month as people say it', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(5)).toBe('5th')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(31)).toBe('31st')
  })

  it('writes a percentage without trailing zeros, and without a sign', () => {
    expect(trimPct(5)).toBe('5')
    expect(trimPct(2.5)).toBe('2.5')
    expect(trimPct(30.0)).toBe('30')
    expect(trimPct(Number.NaN)).toBe('0')
  })

  // These are the chit's own terms, not one member's, so every message may
  // carry them.
  it('offers every term to every audience', () => {
    for (const a of ['all', 'winner', 'unpaid'] as const) {
      const ids = fieldsFor(a).map(f => f.id)
      for (const id of ['total_months', 'start_date', 'end_date', 'auction_day',
        'commission_pct', 'commission_amount', 'min_bid', 'max_discount',
        'max_discount_pct', 'months_left'] as const) {
        expect({ audience: a, id, offered: ids.includes(id) })
          .toEqual({ audience: a, id, offered: true })
      }
    }
  })

  it('has a value for every field in the catalogue', () => {
    const f = facts()
    for (const spec of FIELDS) {
      // Only the winner-and-overdue ones are allowed to be unknown here.
      expect({ id: spec.id, known: valueFor(spec.id, f) !== null })
        .toEqual({ id: spec.id, known: true })
    }
  })
})
