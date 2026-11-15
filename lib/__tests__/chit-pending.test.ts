// "1 out of 20 pending" in red, "15 out of 20 pending" in yellow.
// Arrears pile up, so the counting rule is the whole point of this file.

import { describe, it, expect } from 'vitest'
import {
  summarisePending, pendingFromLedger, pendingDetail,
  DEFAULT_OVERDUE_DAYS, NO_PENDING,
} from '@/lib/chit/pending'

const TODAY = '2026-11-15'
const members = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`)

/** Months 1..n, auctioned monthly, the last one `lastDaysAgo` days back. */
function auctions(n: number, lastDaysAgo: number) {
  const map = new Map<number, string>()
  for (let m = n; m >= 1; m--) {
    const days = lastDaysAgo + (n - m) * 30
    const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86400000)
    map.set(m, d.toISOString().slice(0, 10))
  }
  return map
}

describe('counting what is pending', () => {
  it('counts every unpaid month, not every member', () => {
    // One member, four months behind, is four collections you have not made.
    const p = summarisePending({
      memberIds: members(20),
      unpaidMonths: new Map([['m1', [1, 2, 3, 4]]]),
      auctionDates: auctions(4, 5),
      asOf: TODAY,
    })
    expect(p.pending).toBe(4)
    expect(p.membersBehind).toBe(1)
    expect(p.total).toBe(20)
  })

  it('reads as the example: 15 of 20 have not paid this month', () => {
    const unpaid = new Map(members(15).map(id => [id, [1]]))
    const p = summarisePending({
      memberIds: members(20), unpaidMonths: unpaid,
      auctionDates: auctions(1, 5), asOf: TODAY,
    })
    expect(p.pending).toBe(15)
    expect(p.recent).toBe(15)
    expect(p.overdue).toBe(0)
  })

  it('says nothing is pending when everybody has paid', () => {
    const p = summarisePending({
      memberIds: members(20), unpaidMonths: new Map(),
      auctionDates: auctions(3, 5), asOf: TODAY,
    })
    expect(p).toMatchObject({ pending: 0, overdue: 0, recent: 0, membersBehind: 0, oldestDays: null })
  })

  it('handles a group with nobody in it', () => {
    expect(summarisePending({ memberIds: [], unpaidMonths: new Map(), auctionDates: new Map(), asOf: TODAY }))
      .toMatchObject({ total: 0, pending: 0 })
  })
})

describe('which colour each month gets', () => {
  it('colours each month by its OWN age, not by the member', () => {
    // June, July and August are overdue; this month is merely due. The
    // defaulter shows as three red and one yellow, not four of either.
    const p = summarisePending({
      memberIds: members(20),
      unpaidMonths: new Map([['m1', [1, 2, 3, 4]]]),
      auctionDates: auctions(4, 5),   // month 4 is 5 days old, 3 is 35, 2 is 65, 1 is 95
      asOf: TODAY,
    })
    expect(p.overdue).toBe(3)
    expect(p.recent).toBe(1)
  })

  it('puts the cut-off at 30 days, counting the 30th as still recent', () => {
    const at30 = new Map([[1, '2026-10-16']])   // exactly 30 days before TODAY
    const at31 = new Map([[1, '2026-10-15']])   // 31
    const base = { memberIds: ['m1'], unpaidMonths: new Map([['m1', [1]]]), asOf: TODAY }
    expect(summarisePending({ ...base, auctionDates: at30 }).overdue).toBe(0)
    expect(summarisePending({ ...base, auctionDates: at31 }).overdue).toBe(1)
    expect(DEFAULT_OVERDUE_DAYS).toBe(30)
  })

  it('can be given a different cut-off', () => {
    const p = summarisePending({
      memberIds: ['m1'], unpaidMonths: new Map([['m1', [1]]]),
      auctionDates: auctions(1, 45), asOf: TODAY, overdueAfterDays: 60,
    })
    expect(p.overdue).toBe(0)
  })

  it('treats a month with no auction date as recent, not overdue', () => {
    // A missing date is not evidence of lateness.
    const p = summarisePending({
      memberIds: ['m1'], unpaidMonths: new Map([['m1', [1]]]),
      auctionDates: new Map([[1, null]]), asOf: TODAY,
    })
    expect(p.overdue).toBe(0)
    expect(p.recent).toBe(1)
    expect(p.oldestDays).toBe(null)
  })

  it('ignores a date it cannot read rather than counting it as ancient', () => {
    const p = summarisePending({
      memberIds: ['m1'], unpaidMonths: new Map([['m1', [1]]]),
      auctionDates: new Map([[1, 'not a date']]), asOf: TODAY,
    })
    expect(p.overdue).toBe(0)
  })
})

describe('how bad it is', () => {
  it('reports the oldest unpaid month in the whole group', () => {
    const p = summarisePending({
      memberIds: members(3),
      unpaidMonths: new Map([['m1', [4]], ['m2', [1, 2, 3, 4]]]),
      auctionDates: auctions(4, 5),
      asOf: TODAY,
    })
    expect(p.oldestDays).toBe(95)
    expect(p.worstMonthsBehind).toBe(4)
    expect(p.membersBehind).toBe(2)
    expect(p.pending).toBe(5)
  })

  it('lets the count pass the member count when arrears run deep', () => {
    // Twenty members, two months behind each. 40 out of 20 is the truth.
    const unpaid = new Map(members(20).map(id => [id, [1, 2]]))
    const p = summarisePending({
      memberIds: members(20), unpaidMonths: unpaid,
      auctionDates: auctions(2, 5), asOf: TODAY,
    })
    expect(p.pending).toBe(40)
    expect(p.total).toBe(20)
  })
})

describe('the line under the badges', () => {
  it('says nothing when there is nothing pending', () => {
    expect(pendingDetail(NO_PENDING)).toBe(null)
  })

  it('stays quiet when everyone is just one month behind', () => {
    const p = summarisePending({
      memberIds: members(20),
      unpaidMonths: new Map(members(15).map(id => [id, [1]])),
      auctionDates: auctions(1, 5), asOf: TODAY,
    })
    expect(pendingDetail(p)).toBe(null)
  })

  it('counts the members who are LATE, not everyone who owes something', () => {
    // Fourteen have simply not paid this month; one is four months behind.
    // "15 members behind" would be true and useless.
    const unpaid = new Map<string, number[]>([['m1', [1, 2, 3, 4]]])
    for (let i = 2; i <= 15; i++) unpaid.set(`m${i}`, [4])
    const p = summarisePending({
      memberIds: members(20), unpaidMonths: unpaid,
      auctionDates: auctions(4, 5), asOf: TODAY,
    })
    expect(p).toMatchObject({ overdue: 3, recent: 15, membersBehind: 15, membersOverdue: 1 })
    expect(pendingDetail(p)).toContain('1 member more than 30 days behind')
  })

  it('explains itself when one member is several months behind', () => {
    const p = summarisePending({
      memberIds: members(20),
      unpaidMonths: new Map([['m1', [1, 2, 3, 4]]]),
      auctionDates: auctions(4, 5), asOf: TODAY,
    })
    expect(pendingDetail(p)).toBe('1 member more than 30 days behind · worst is 4 months · oldest 95 days')
  })
})

describe('reading it off the ledger the rest of the chit uses', () => {
  const ledger = {
    byMember: new Map([
      ['m1', { months: [{ month: 1, outstanding: 0 }, { month: 2, outstanding: 1800 }] }],
      ['m2', { months: [{ month: 1, outstanding: 0 }, { month: 2, outstanding: 0 }] }],
    ]),
  }
  const rows = [
    { month_number: 1, auction_date: '2026-08-10' },
    { month_number: 2, auction_date: '2026-11-10' },
  ]

  it('counts only the months actually short', () => {
    const p = pendingFromLedger(ledger, rows, ['m1', 'm2'], TODAY)
    expect(p).toMatchObject({ total: 2, pending: 1, recent: 1, overdue: 0, membersBehind: 1 })
  })

  it('copes with a member who has no ledger entry at all', () => {
    const p = pendingFromLedger(ledger, rows, ['m1', 'm2', 'm3'], TODAY)
    expect(p.total).toBe(3)
    expect(p.pending).toBe(1)
  })

  it('reads a month number that arrived as a string', () => {
    const p = pendingFromLedger(ledger, [{ month_number: '2', auction_date: '2026-01-01' }], ['m1'], TODAY)
    expect(p.overdue).toBe(1)
  })
})
