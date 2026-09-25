// Who won, when the foreman closes bidding.
//
// Closing used to stop new bids and print the highest one, leaving the foreman
// to retype it into the auction form. Now it decides, and the decision is
// written to the books. That makes this rule the thing standing between a bid
// list and a lakh rupees, so it is tested from every angle a disagreement could
// come from: ties, a barred winner, no bids at all.
//
// The same function picks the leader shown live on a member's phone during the
// auction, so the name on screen is the name in the books.

import { describe, it, expect } from 'vitest'
import { winnerFromBids, decideClose, type BidRow } from '@/lib/chit/closeAuction'

const at = (s: string) => `2026-09-25T${s}:00.000Z`

describe('picking the winner', () => {
  it('takes the highest bid', () => {
    const bids: BidRow[] = [
      { memberId: 'a', amount: 40000, placedAt: at('10:00') },
      { memberId: 'b', amount: 62000, placedAt: at('10:05') },
      { memberId: 'c', amount: 55000, placedAt: at('10:09') },
    ]
    expect(winnerFromBids(bids)).toEqual({ memberId: 'b', amount: 62000 })
  })

  it('gives a tie to whoever bid first', () => {
    // Two members can land the same figure in the same minute. "Whoever pressed
    // first" is the only tie-break that survives being questioned afterwards.
    const bids: BidRow[] = [
      { memberId: 'late', amount: 62000, placedAt: at('10:09') },
      { memberId: 'early', amount: 62000, placedAt: at('10:02') },
    ]
    expect(winnerFromBids(bids)!.memberId).toBe('early')
  })

  it('does not depend on the order the rows came back in', () => {
    const bids: BidRow[] = [
      { memberId: 'a', amount: 1500, placedAt: at('10:00') },
      { memberId: 'b', amount: 1700, placedAt: at('10:01') },
      { memberId: 'c', amount: 1600, placedAt: at('10:02') },
    ]
    const reversed = bids.slice().reverse()
    expect(winnerFromBids(bids)).toEqual(winnerFromBids(reversed))
  })

  it('skips a member who has already taken the prize', () => {
    // Their bid can only be older than their win. Counting it would hand the
    // same person the pot twice, which is not a chit.
    const bids: BidRow[] = [
      { memberId: 'past-winner', amount: 90000, placedAt: at('10:00') },
      { memberId: 'b', amount: 62000, placedAt: at('10:05') },
    ]
    expect(winnerFromBids(bids, ['past-winner'])).toEqual({ memberId: 'b', amount: 62000 })
  })

  it('returns nobody when every bidder is barred', () => {
    const bids: BidRow[] = [{ memberId: 'x', amount: 90000, placedAt: at('10:00') }]
    expect(winnerFromBids(bids, ['x'])).toBeNull()
  })

  it('returns nobody when there were no bids', () => {
    expect(winnerFromBids([])).toBeNull()
  })

  it('ignores rubbish amounts rather than crowning them', () => {
    const bids: BidRow[] = [
      { memberId: 'junk', amount: Number.NaN, placedAt: at('10:00') },
      { memberId: 'zero', amount: 0, placedAt: at('10:01') },
      { memberId: 'real', amount: 1500, placedAt: at('10:02') },
    ]
    expect(winnerFromBids(bids)).toEqual({ memberId: 'real', amount: 1500 })
  })

  it('does not mutate the list it was given', () => {
    const bids: BidRow[] = [
      { memberId: 'a', amount: 100, placedAt: at('10:00') },
      { memberId: 'b', amount: 900, placedAt: at('10:01') },
    ]
    const before = bids.map(b => b.memberId)
    winnerFromBids(bids)
    expect(bids.map(b => b.memberId)).toEqual(before)
  })
})

describe('what closing should do', () => {
  it('records an auction when somebody bid', () => {
    const out = decideClose([{ memberId: 'a', amount: 1500, placedAt: at('10:00') }])
    expect(out).toEqual({ kind: 'recorded', winner: { memberId: 'a', amount: 1500 } })
  })

  it('says out loud that nobody bid, rather than recording nothing quietly', () => {
    // The foreman needs to be TOLD no auction exists for this month, not left
    // to notice a gap later.
    expect(decideClose([])).toEqual({ kind: 'no_bids' })
  })

  it('treats a window where the only bidder is barred as no bids', () => {
    const out = decideClose([{ memberId: 'x', amount: 5000, placedAt: at('10:00') }], ['x'])
    expect(out).toEqual({ kind: 'no_bids' })
  })
})
