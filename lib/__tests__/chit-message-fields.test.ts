import { describe, it, expect } from 'vitest'
import {
  FIELDS, field, money, dateWords, safeVar, daysOverdue, valueFor,
  renderFields, fieldWords, fieldProblem, fieldsFor, ordinal, trimPct, labelToField,
  type Facts, type FieldId,
} from '@/lib/chit/messageFields'

const facts = (o: Partial<Facts> = {}): Facts => ({
  memberName: 'Ravi', groupName: 'Uma 5 Lakh A', month: 'November 2026',
  chitValue: 500000, installment: 25000, membersCount: 20, monthNumber: 7,
  auctionDate: '2026-11-05', auctionTime: '6:30 PM', nextAuctionDate: '2026-12-05',
  amountDue: 23750, dividend: 1250, dueDate: '2026-11-15',
  bidAmount: 60000, discountShared: 35000, netPayout: 440000,
  pendingDues: 47500, payoutAfterDues: 392500,
  bankName: 'HDFC Bank', accountNumber: '50100123454321',
  bankAccountName: 'R Ravi', bankBranch: 'Tiruppur Main', bankIfsc: 'HDFC0001234',
  winnerName: 'Ravi', winnerCode: 'M-014',
  memberCode: 'M-014', slotNumber: 7, memberPhone: '98765 43210',
  memberAddress: '12 Kumaran Road, Tiruppur',
  aadhaar: '1234 5678 4321', pan: 'ABCDE1234K',
  nomineeName: 'Lakshmi', guarantorName: 'Murugan',
  today: '2026-11-20',
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

  it('gives the whole account number, for them to check their passbook', () => {
    expect(valueFor('account_number', facts())).toBe('50100123454321')
    expect(valueFor('account_number', facts({ accountNumber: null }))).toBeNull()
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
    expect(fieldWords(['bid_amount'])).toBe('winning bid')
    expect(fieldWords(['bid_amount', 'bank_name'])).toBe('winning bid and their bank')
    expect(fieldWords(['bid_amount', 'bank_name', 'net_payout']))
      .toBe('winning bid, their bank and winning amount')
  })
})

describe('a field used where it cannot be honest', () => {
  it('lets a winner detail through in a winner message', () => {
    expect(fieldProblem('payout_after_dues', 'winner')).toBeNull()
  })

  it('stops a winner detail in a message to everybody', () => {
    expect(fieldProblem('payout_after_dues', 'all')).toContain('only exists for the auction winner')
  })

  // The result of the auction is announced to the whole group, so these are
  // not the winner's private business.
  it('allows the winning bid and who won in any message', () => {
    for (const a of ['all', 'winner', 'unpaid'] as const) {
      expect(fieldProblem('bid_amount', a)).toBeNull()
      expect(fieldProblem('winner_name', a)).toBeNull()
    }
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
    expect(all).toContain('bid_amount')
    expect(all).toContain('winner_name')
    // The app's own broadcast announces the winning amount to the group.
    expect(all).toContain('net_payout')
    expect(all).not.toContain('payout_after_dues')
    expect(all).not.toContain('days_overdue')
    expect(fieldsFor('winner').map(f => f.id)).toContain('net_payout')
    expect(fieldsFor('unpaid').map(f => f.id)).toContain('days_overdue')
  })
})

describe('everything on the member page', () => {
  it('gives the plain details', () => {
    const f = facts()
    expect(valueFor('member_code', f)).toBe('M-014')
    expect(valueFor('slot_number', f)).toBe('7')
    expect(valueFor('member_phone', f)).toBe('98765 43210')
    expect(valueFor('member_address', f)).toBe('12 Kumaran Road, Tiruppur')
    expect(valueFor('nominee_name', f)).toBe('Lakshmi')
    expect(valueFor('guarantor_name', f)).toBe('Murugan')
  })

  it('gives the papers as entered', () => {
    expect(valueFor('aadhaar', facts())).toBe('1234 5678 4321')
    expect(valueFor('pan', facts())).toBe('ABCDE1234K')
    expect(valueFor('pan', facts({ pan: ' abcde1234k ' }))).toBe('ABCDE1234K')
    expect(valueFor('aadhaar', facts({ aadhaar: null }))).toBeNull()
    expect(valueFor('pan', facts({ pan: null }))).toBeNull()
  })

  // Notes are what you wrote about a member, not what you would say to them.
  it('does not offer your private notes about them', () => {
    expect(FIELDS.some(x => /note/.test(x.id))).toBe(false)
  })

  it('reports a detail you never filled in as unknown', () => {
    expect(valueFor('slot_number', facts({ slotNumber: null }))).toBeNull()
    expect(valueFor('nominee_name', facts({ nomineeName: null }))).toBeNull()
    expect(valueFor('member_address', facts({ memberAddress: '' }))).toBeNull()
  })
})

describe('the result of the auction', () => {
  it('gives the winning bid and the part shared with members', () => {
    expect(valueFor('bid_amount', facts())).toBe('60,000')
    expect(valueFor('discount_shared', facts())).toBe('35,000')
    expect(valueFor('winner_name', facts())).toBe('Ravi')
  })

  // The app's own screens call the winning bid the winning discount, so both
  // ways of writing it find the same figure.
  it('knows the other words for the winning bid', () => {
    for (const word of ['discount', 'discount amount', 'winning discount', 'bid amount']) {
      expect(labelToField(word)?.id).toBe('bid_amount')
    }
  })

  it('names the winner and their number in the register', () => {
    expect(valueFor('winner_code', facts())).toBe('M-014')
  })

  it('has nothing to say in a month nobody won', () => {
    expect(valueFor('winner_name', facts({ winnerName: null }))).toBeNull()
    expect(valueFor('bid_amount', facts({ bidAmount: null }))).toBeNull()
  })
})

describe('the bank, for a member to confirm', () => {
  it('gives the whole account, so it can be checked against a passbook', () => {
    const f = facts()
    expect(valueFor('bank_name', f)).toBe('HDFC Bank')
    expect(valueFor('bank_account_name', f)).toBe('R Ravi')
    expect(valueFor('bank_branch', f)).toBe('Tiruppur Main')
    expect(valueFor('bank_ifsc', f)).toBe('HDFC0001234')
    expect(valueFor('account_number', f)).toBe('50100123454321')
  })

  // It is their own account, going to their own number. There is nothing to
  // protect it from, and a message asking everybody to confirm their account
  // before the dividend goes out is a reasonable thing to send.
  it('allows the bank in any message, since it is the reader\u2019s own', () => {
    for (const id of ['bank_name', 'bank_account_name', 'bank_branch', 'bank_ifsc', 'account_number'] as const) {
      for (const a of ['all', 'winner', 'unpaid'] as const) {
        expect({ id, a, ok: fieldProblem(id, a) === null }).toEqual({ id, a, ok: true })
      }
    }
  })

  it('knows the other words for them', () => {
    expect(labelToField('ifsc')?.id).toBe('bank_ifsc')
    expect(labelToField('account holder name')?.id).toBe('bank_account_name')
    expect(labelToField('branch')?.id).toBe('bank_branch')
  })
})

describe('the winning amount, and what reaches the winner', () => {
  it('gives the figures the group screen gives', () => {
    const f = facts()
    expect(valueFor('net_payout', f)).toBe('4,40,000')
    expect(valueFor('pending_dues', f)).toBe('47,500')
    expect(valueFor('payout_after_dues', f)).toBe('3,92,500')
  })

  // The app's own winner message prints all three, so the words it uses find
  // the same figures here.
  it('knows the words the app already uses for them', () => {
    expect(labelToField('winning amount')?.id).toBe('net_payout')
    expect(labelToField('pending amount')?.id).toBe('pending_dues')
    expect(labelToField('after deduction')?.id).toBe('payout_after_dues')
  })

  it('reports them as unknown before the auction is recorded', () => {
    expect(valueFor('net_payout', facts({ netPayout: null }))).toBeNull()
    expect(valueFor('payout_after_dues', facts({ payoutAfterDues: null }))).toBeNull()
  })

  it('keeps the winner\u2019s netting to the winner', () => {
    expect(fieldProblem('payout_after_dues', 'except_winner')).toContain('only exists for the auction winner')
    expect(fieldProblem('payout_after_dues', 'winner')).toBeNull()
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
