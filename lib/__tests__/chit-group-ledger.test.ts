// Everyone's position in one group.
//
// Four screens need this answer — the collection tab, the member page, the
// statement and the dashboard. Computing it four times is how four screens come
// to disagree about money, so it is computed once and tested here.

import { describe, it, expect } from 'vitest'
import { groupLedger, ledgerFor, type GroupLedgerInput } from '@/lib/chit/groupLedger'

const base = (over: Partial<GroupLedgerInput> = {}): GroupLedgerInput => ({
  groupId: 'g1',
  installment: 20000,
  memberIds: ['a', 'b'],
  auctions: [
    { group_id: 'g1', month_number: 1, dividend_per_member: 1400, auction_date: '2026-06-05' },
    { group_id: 'g1', month_number: 2, dividend_per_member: 1000, auction_date: '2026-07-05' },
  ],
  collections: [],
  ...over,
})

describe('what the group is owed', () => {
  it('raises a due per member per auctioned month', () => {
    const g = groupLedger(base())
    // (20000−1400) + (20000−1000) = 37600 each, two members.
    expect(g.outstanding).toBe(75200)
    expect(g.pendingCount).toBe(4)
  })

  it('counts nothing for an auction that has not been held yet', () => {
    const g = groupLedger(base({
      auctions: [{ group_id: 'g1', month_number: 1, dividend_per_member: 1400, auction_date: '2026-12-05' }],
      asOf: '2026-10-16',
    }))
    expect(g.dues).toHaveLength(0)
    expect(g.outstanding).toBe(0)
  })

  it('drops to nothing once everybody has paid', () => {
    const g = groupLedger(base({
      collections: [
        { member_id: 'a', month_number: 1, amount: 18600 }, { member_id: 'a', month_number: 2, amount: 19000 },
        { member_id: 'b', month_number: 1, amount: 18600 }, { member_id: 'b', month_number: 2, amount: 19000 },
      ],
    }))
    expect(g.outstanding).toBe(0)
    expect(g.pendingCount).toBe(0)
  })

  it('ignores rows belonging to another group', () => {
    const g = groupLedger(base({
      collections: [{ group_id: 'other', member_id: 'a', month_number: 1, amount: 18600 }],
    }))
    expect(g.outstanding).toBe(75200)
  })
})

describe('one member overpaying', () => {
  const g = groupLedger(base({
    collections: [{ member_id: 'a', month_number: 1, amount: 20000 }],
  }))

  it('reduces that member’s next month and nobody else’s', () => {
    expect(ledgerFor(g, 'a').months[1].payable).toBe(17600)
    expect(ledgerFor(g, 'b').months[1].payable).toBe(19000)
  })

  it('shows the group owed less by exactly the overpayment', () => {
    // 75200 − 20000 paid = 55200.
    expect(g.outstanding).toBe(55200)
  })
})

describe('credit moved in from the member’s other chit', () => {
  const g = groupLedger(base({
    creditMoves: [{ member_id: 'a', from_group_id: 'gOther', to_group_id: 'g1', to_month: 1, amount: 18600 }],
  }))

  it('counts as money received here', () => {
    expect(ledgerFor(g, 'a').months[0].payable).toBe(0)
    expect(ledgerFor(g, 'a').months[0].creditApplied).toBe(18600)
  })

  it('leaves the group it came out of short by that much', () => {
    const source = groupLedger(base({
      groupId: 'gOther',
      memberIds: ['a'],
      auctions: [{ group_id: 'gOther', month_number: 1, dividend_per_member: 0, auction_date: '2026-06-05' }],
      collections: [{ group_id: 'gOther', member_id: 'a', month_number: 1, amount: 38600 }],
      creditMoves: [{ member_id: 'a', from_group_id: 'gOther', to_group_id: 'g1', to_month: 1, amount: 18600 }],
    }))
    // Paid 38600 against a 20000 due, moved 18600 out: nothing left over.
    expect(source.creditHeld).toBe(0)
  })
})

describe('a member with no rows at all', () => {
  it('still gets a position rather than undefined', () => {
    const g = groupLedger(base({ memberIds: [] }))
    expect(ledgerFor(g, 'nobody').arrears).toBe(0)
    expect(ledgerFor(g, 'nobody').months).toEqual([])
  })
})
