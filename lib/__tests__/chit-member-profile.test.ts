// Chit member numbers, the CSV contract, and one member's position.
//
// Three things worth pinning down:
//   1. Member numbers must be unique. Two members sharing UC00007 makes every
//      paper receipt carrying it ambiguous, and the ambiguity surfaces only
//      after money is in the wrong column.
//   2. The sample CSV and the parser must agree. If they are written twice they
//      drift, someone fills in a column the importer ignores, and the data
//      silently does not arrive.
//   3. What a member owes has to match the passbook in their hand.

import { describe, it, expect } from 'vitest'
import {
  nextMemberCode, checkMemberCode, normalizeMemberCode, codeSequence, formatMemberCode,
} from '@/lib/chit/memberCode'
import {
  sampleMemberCsv, parseMemberCsv, splitCsvLine, mapHeaders, MEMBER_COLUMNS,
} from '@/lib/chit/memberCsv'
import { summariseMember } from '@/lib/chit/memberSummary'

// ── 1. Member numbers ───────────────────────────────────────────────────────

describe('member numbers', () => {
  it('starts at UC00001', () => {
    expect(nextMemberCode([])).toBe('UC00001')
  })

  it('continues from the highest, not the count', () => {
    // Counting would re-issue a number after a member is deleted, colliding
    // with the receipt that still carries it.
    expect(nextMemberCode(['UC00001', 'UC00002', 'UC00003'])).toBe('UC00004')
    expect(nextMemberCode(['UC00001', 'UC00007'])).toBe('UC00008')
  })

  it('ignores hand-typed codes when numbering', () => {
    expect(nextMemberCode(['LEGACY-7', 'UC00002', null, ''])).toBe('UC00003')
  })

  it('pads to five digits and keeps going past them', () => {
    expect(formatMemberCode(42)).toBe('UC00042')
    expect(formatMemberCode(123456)).toBe('UC123456')
  })

  it('reads the sequence back out of a code', () => {
    expect(codeSequence('UC00042')).toBe(42)
    expect(codeSequence('uc00042')).toBe(42)
    expect(codeSequence('LEGACY-7')).toBeNull()
  })

  it('normalises so UC 42 and uc42 are the same string', () => {
    expect(normalizeMemberCode('  uc 00042 ')).toBe('UC00042')
    expect(normalizeMemberCode('')).toBeNull()
    expect(normalizeMemberCode(null)).toBeNull()
  })
})

describe('checking a typed member number', () => {
  const taken = new Map([['UC00001', 'member-a'], ['UC00002', 'member-b']])

  it('accepts a free number', () => {
    expect(checkMemberCode('UC00099', taken).ok).toBe(true)
  })

  it('refuses one that belongs to somebody else', () => {
    const r = checkMemberCode('UC00002', taken)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('UC00002')
  })

  it('lets a member keep their OWN number while editing', () => {
    expect(checkMemberCode('UC00002', taken, 'member-b').ok).toBe(true)
  })

  it('catches a clash typed in a different case', () => {
    expect(checkMemberCode('uc00001', taken).ok).toBe(false)
  })

  it('allows a blank number', () => {
    const r = checkMemberCode('', taken)
    expect(r.ok).toBe(true)
    expect(r.code).toBeNull()
  })

  it('refuses characters that would not survive a receipt', () => {
    expect(checkMemberCode('UC 1,2', taken).ok).toBe(false)
    expect(checkMemberCode('UC/2026-01', taken).ok).toBe(true)
  })
})

// ── 2. The CSV contract ─────────────────────────────────────────────────────

describe('the example CSV and the importer agree', () => {
  it('every column in the sample is one the parser reads back', () => {
    const csv = sampleMemberCsv()
    const [headerLine] = csv.split('\r\n')
    const mapped = mapHeaders(headerLine)
    // This is the test that stops the sample promising a column the importer
    // drops on the floor.
    for (const col of MEMBER_COLUMNS) {
      expect(Object.keys(mapped)).toContain(col.field)
    }
  })

  it('round-trips its own example row', () => {
    const { rows } = parseMemberCsv(sampleMemberCsv())
    expect(rows).toHaveLength(1)          // the blank row is skipped
    expect(rows[0].values.name).toBe('Suresh Balan')
    expect(rows[0].values.member_code).toBe('UC00001')
    expect(rows[0].values.bank_ifsc).toBe('HDFC0000123')
    expect(rows[0].error).toBeUndefined()
  })

  it('handles an address containing a comma', () => {
    expect(splitCsvLine('UC1,"12 Kongu Nagar, Tiruppur",9876543210'))
      .toEqual(['UC1', '12 Kongu Nagar, Tiruppur', '9876543210'])
  })

  it('handles a quoted field containing a quote', () => {
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(['a', 'say "hi"', 'b'])
  })

  it('accepts the header spellings a real spreadsheet uses', () => {
    const m = mapHeaders('S.No,Member Name,Mobile,A/C No,IFSC Code,Referred By')
    expect(m.name).toBe(1)
    expect(m.phone).toBe(2)
    expect(m.bank_account_number).toBe(3)
    expect(m.bank_ifsc).toBe(4)
    expect(m.referred_by_code).toBe(5)
  })

  it('imports what it can and reports the row it cannot', () => {
    const { rows } = parseMemberCsv('Name,Phone\nSuresh,9876543210\n,9111111111\nNarmadha,9222222222')
    expect(rows).toHaveLength(3)
    expect(rows.filter(r => !r.error)).toHaveLength(2)
    expect(rows[1].error).toBe('No name in this row')
    // One bad row must not cost the good ones.
    expect(rows[2].values.name).toBe('Narmadha')
  })

  it('ignores columns it does not know rather than refusing the file', () => {
    const { rows } = parseMemberCsv('Name,Blood Group\nSuresh,O+')
    expect(rows[0].values.name).toBe('Suresh')
    expect(rows[0].error).toBeUndefined()
  })
})

// ── 3. What a member's position adds up to ──────────────────────────────────

const GROUPS = [
  { id: 'g1', name: 'Sreenivasa 5L', chit_value: 500000, members: 20, status: 'active' },
  { id: 'g2', name: 'Kongu 2L', chit_value: 200000, members: 10, status: 'active' },
]
const ME = 'm1'
const OTHER = 'm2'
const asOf = new Date('2026-09-10T00:00:00Z')

const base = {
  memberId: ME,
  memberships: [
    { group_id: 'g1', member_id: ME, slot_number: 7 },
    { group_id: 'g2', member_id: ME, slot_number: 3 },
    { group_id: 'g1', member_id: OTHER, slot_number: 8 },
  ],
  groups: GROUPS,
  asOf,
}

describe('one member’s position across their chits', () => {
  it('counts only the chits they are in', () => {
    const s = summariseMember({ ...base, dues: [], payments: [], auctions: [] })
    expect(s.groupCount).toBe(2)
    expect(s.groups.map(g => g.groupId).sort()).toEqual(['g2', 'g1'].sort())
  })

  it('adds up what was raised, what was paid, and what is left', () => {
    const s = summariseMember({
      ...base,
      dues: [
        { group_id: 'g1', member_id: ME, month_number: 1, amount: 25000, status: 'PAID', due_date: '2026-01-14' },
        { group_id: 'g1', member_id: ME, month_number: 2, amount: 24000, status: 'PENDING', due_date: '2026-02-14' },
        // Another member's row must not leak into this member's totals.
        { group_id: 'g1', member_id: OTHER, month_number: 1, amount: 25000, status: 'PENDING', due_date: '2026-01-14' },
      ],
      payments: [{ group_id: 'g1', member_id: ME, month_number: 1, amount: 25000, paid_date: '2026-01-12' }],
      auctions: [],
    })
    expect(s.totalBilled).toBe(49000)
    expect(s.totalPaid).toBe(25000)
    expect(s.totalOwed).toBe(24000)
    expect(s.totalOverdue).toBe(1)      // month 2 is past its date and unpaid
  })

  it('shows an overpayment as advance, never as negative debt', () => {
    const s = summariseMember({
      ...base,
      dues: [{ group_id: 'g2', member_id: ME, month_number: 1, amount: 20000, status: 'PAID' }],
      payments: [{ group_id: 'g2', member_id: ME, month_number: 1, amount: 25000 }],
      auctions: [],
    })
    expect(s.totalOwed).toBe(0)
    expect(s.totalAdvance).toBe(5000)
  })

  it('does not call a paid instalment overdue just because the date passed', () => {
    const s = summariseMember({
      ...base,
      dues: [{ group_id: 'g1', member_id: ME, month_number: 1, amount: 25000, status: 'PAID', due_date: '2026-01-14' }],
      payments: [], auctions: [],
    })
    expect(s.totalOverdue).toBe(0)
  })

  it('records the prize, and whether it has actually been paid out', () => {
    const s = summariseMember({
      ...base, dues: [], payments: [],
      auctions: [
        { group_id: 'g1', month_number: 3, winner_member_id: ME, net_payout: 420000, dividend_per_member: 2500, paid_at: '2026-03-06' },
        { group_id: 'g2', month_number: 2, winner_member_id: ME, net_payout: 170000, dividend_per_member: 1500 },
      ],
    })
    expect(s.chitsWon).toBe(2)
    expect(s.totalPrize).toBe(420000)   // only the one actually paid
    expect(s.prizeDue).toBe(170000)     // won, awaiting payout
  })

  it('credits dividends for every month held, including one they won', () => {
    const s = summariseMember({
      ...base, dues: [], payments: [],
      auctions: [
        { group_id: 'g1', month_number: 1, winner_member_id: OTHER, dividend_per_member: 2750 },
        { group_id: 'g1', month_number: 2, winner_member_id: ME, dividend_per_member: 2250, net_payout: 425000 },
      ],
    })
    expect(s.totalDividends).toBe(5000)
  })

  it('ignores another member’s win entirely', () => {
    const s = summariseMember({
      ...base, dues: [], payments: [],
      auctions: [{ group_id: 'g1', month_number: 1, winner_member_id: OTHER, net_payout: 415000, dividend_per_member: 2750 }],
    })
    expect(s.chitsWon).toBe(0)
    expect(s.totalPrize).toBe(0)
    expect(s.groups.find(g => g.groupId === 'g1')!.hasWon).toBe(false)
  })

  it('gives an empty picture for a member in nothing', () => {
    const s = summariseMember({ ...base, memberships: [], dues: [], payments: [], auctions: [] })
    expect(s.groupCount).toBe(0)
    expect(s.totalOwed).toBe(0)
    expect(s.groups).toHaveLength(0)
  })
})
