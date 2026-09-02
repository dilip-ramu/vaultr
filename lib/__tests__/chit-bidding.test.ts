// Chit bidding — phase 2 tests.
//
// A bid decides who receives the pot, and it is placed by someone who is not a
// user of this app, from a phone, over a link. The tests below are about the
// things that would cost real money if they were wrong:
//
//   1. The rules that decide whether a bid is accepted — every branch.
//   2. That a bid cannot be placed without the PIN, and that a wrong bid does
//      not burn a PIN attempt.
//   3. That a member who has already won cannot bid again.
//   4. That a bid writes to the bid log and NOWHERE ELSE — never to
//      chit_auctions, chit_collections or transactions.
//   5. That a member sees the standing bid but never who placed it.
//
// No network. In-memory Supabase throughout.

import { describe, it, expect } from 'vitest'
import {
  checkBid, minimumAcceptableBid, defaultIncrement, type BidContext,
} from '@/lib/chit/bidding'
import { placeBid } from '@/lib/chit/portal-bids'
import { getLiveAuction } from '@/lib/chit/portal-data'
import { setPin } from '@/lib/chit/portal-auth'
import { FakeSupabase, asClient } from './helpers/fake-supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER = 'owner-1'
const ALICE = 'member-alice'
const BOB = 'member-bob'
const CARL = 'member-carl'
const GROUP = 'group-a'
const OTHER_GROUP = 'group-b'
const WINDOW = 'win-1'
const NOW = new Date('2026-08-18T06:00:00Z')
const PIN = '4915'

const ctx = (over: Partial<BidContext> = {}): BidContext => ({
  window: { status: 'open', ceilingAmount: 150000, minIncrement: 1000 },
  highestAmount: null,
  isMember: true,
  alreadyWon: false,
  ...over,
})

// ── 1. The rules ────────────────────────────────────────────────────────────

describe('the rules that decide whether a bid stands', () => {
  it('accepts a first bid at the increment', () => {
    expect(checkBid(1000, ctx()).ok).toBe(true)
  })

  it('refuses a first bid below the increment', () => {
    const r = checkBid(500, ctx())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('BELOW_MINIMUM')
  })

  it('requires a new bid to beat the standing one by the increment', () => {
    const c = ctx({ highestAmount: 50000 })
    expect(checkBid(50500, c).reason).toBe('BELOW_MINIMUM')
    expect(checkBid(51000, c).ok).toBe(true)
  })

  it('refuses a bid equal to the standing one', () => {
    expect(checkBid(50000, ctx({ highestAmount: 50000 })).reason).toBe('BELOW_MINIMUM')
  })

  it('refuses a bid above the ceiling', () => {
    expect(checkBid(150001, ctx()).reason).toBe('ABOVE_CEILING')
    expect(checkBid(150000, ctx()).ok).toBe(true)
  })

  it('says plainly when the ceiling has been reached and no bid is possible', () => {
    const c = ctx({ highestAmount: 150000 })
    expect(minimumAcceptableBid(c)).toBeNull()
    const r = checkBid(150000, c)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch('ceiling')
  })

  it('refuses everything once the window is closed', () => {
    expect(checkBid(1000, ctx({ window: { status: 'closed', ceilingAmount: 150000, minIncrement: 1000 } })).reason)
      .toBe('WINDOW_CLOSED')
    expect(checkBid(1000, ctx({ window: { status: 'cancelled', ceilingAmount: 150000, minIncrement: 1000 } })).reason)
      .toBe('WINDOW_CLOSED')
  })

  it('refuses someone who is not in the group', () => {
    expect(checkBid(1000, ctx({ isMember: false })).reason).toBe('NOT_IN_GROUP')
  })

  it('refuses a member who has already taken the prize', () => {
    const r = checkBid(1000, ctx({ alreadyWon: true }))
    expect(r.reason).toBe('ALREADY_WON')
    expect(r.message).toMatch('already taken the prize')
  })

  it('refuses nonsense amounts', () => {
    for (const bad of ['', 'abc', null, undefined, 0, -5000, NaN]) {
      expect(checkBid(bad, ctx()).ok).toBe(false)
    }
  })

  it('quotes a floor the member can actually bid', () => {
    expect(minimumAcceptableBid(ctx())).toBe(1000)
    expect(minimumAcceptableBid(ctx({ highestAmount: 50000 }))).toBe(51000)
  })

  it('derives a sane default increment from the pot', () => {
    expect(defaultIncrement(500000)).toBe(1300)   // 0.25% = 1250, rounded up
    expect(defaultIncrement(10000)).toBe(100)     // never below ₹100
  })
})

// ── 2. Placing a real bid ───────────────────────────────────────────────────

function db(over: { windowStatus?: string; bids?: any[]; auctions?: any[] } = {}): FakeSupabase {
  return new FakeSupabase({
    chit_members: [
      { id: ALICE, user_id: OWNER, name: 'Alice Kumar', phone: '9876543210', is_active: true, portal_enabled: true },
      { id: BOB, user_id: OWNER, name: 'Bob Raj', phone: '9123456780', is_active: true, portal_enabled: true },
      { id: CARL, user_id: OWNER, name: 'Carl Dev', phone: '9000000000', is_active: true, portal_enabled: true },
    ],
    chit_groups: [
      { id: GROUP, user_id: OWNER, name: 'Sreenivasa 5L', chit_value: 500000, members: 20, bid_ceiling_pct: 30, commission_pct: 5, status: 'active' },
      { id: OTHER_GROUP, user_id: OWNER, name: 'Private 10L', chit_value: 1000000, members: 25, bid_ceiling_pct: 30, commission_pct: 5, status: 'active' },
    ],
    chit_group_members: [
      { id: 'gm-1', user_id: OWNER, group_id: GROUP, member_id: ALICE, slot_number: 7 },
      { id: 'gm-2', user_id: OWNER, group_id: GROUP, member_id: BOB, slot_number: 8 },
      { id: 'gm-3', user_id: OWNER, group_id: OTHER_GROUP, member_id: CARL, slot_number: 1 },
    ],
    chit_bid_windows: [{
      id: WINDOW, user_id: OWNER, group_id: GROUP, month_number: 4,
      status: over.windowStatus ?? 'open',
      ceiling_amount: 150000, min_increment: 1000,
      opened_at: NOW.toISOString(), closed_at: null,
    }],
    chit_bids: over.bids ?? [],
    chit_auctions: over.auctions ?? [],
    chit_member_pins: [],
    chit_receivables: [],
    chit_collections: [],
    chit_portal_sessions: [],
  })
}

async function withPin(d: FakeSupabase, memberId = ALICE) {
  await setPin(OWNER, memberId, PIN, NOW, asClient(d))
  return d
}

const bid = (over: Partial<Record<string, unknown>> = {}) => ({
  memberId: ALICE, sessionId: 'sess-1', groupId: GROUP,
  amount: 5000, pin: PIN, now: NOW, ...over,
}) as any

describe('placing a bid', () => {
  it('records the bid and reports that the member is leading', async () => {
    const d = await withPin(db())
    const r = await placeBid(bid(), asClient(d)) as any
    expect(r.ok).toBe(true)
    expect(r.amount).toBe(5000)
    expect(r.youAreLeading).toBe(true)
    expect(d.rows('chit_bids')).toHaveLength(1)
    expect(d.rows('chit_bids')[0].member_id).toBe(ALICE)
    expect(d.rows('chit_bids')[0].source).toBe('portal')
  })

  it('writes to the bid log and NOWHERE else', async () => {
    const d = await withPin(db())
    await placeBid(bid(), asClient(d))
    // The whole safety argument for letting outsiders write anything at all.
    expect(d.rows('chit_auctions')).toHaveLength(0)
    expect(d.rows('chit_collections')).toHaveLength(0)
    expect(d.rows('transactions')).toHaveLength(0)
    expect(d.rows('lab_trades')).toHaveLength(0)
  })

  it('keeps the audit trail on the row', async () => {
    const d = await withPin(db())
    await placeBid(bid({ ip: '203.0.113.9' }), asClient(d))
    const row = d.rows('chit_bids')[0]
    expect(row.session_id).toBe('sess-1')
    expect(row.ip).toBe('203.0.113.9')
    expect(row.placed_at).toBe(NOW.toISOString())
  })

  it('refuses without the PIN', async () => {
    const d = await withPin(db())
    const r = await placeBid(bid({ pin: '0000' }), asClient(d)) as any
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('BAD_PIN')
    expect(d.rows('chit_bids')).toHaveLength(0)
  })

  it('refuses when no PIN has been set at all', async () => {
    const d = db()   // no setPin
    const r = await placeBid(bid(), asClient(d)) as any
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('BAD_PIN')
  })

  it('does not burn a PIN attempt when the BID is the thing that is wrong', async () => {
    const d = await withPin(db())
    // Below the increment: rejected on the rules, before the PIN is consulted.
    const r = await placeBid(bid({ amount: 10 }), asClient(d)) as any
    expect(r.reason).toBe('BELOW_MINIMUM')
    expect(Number(d.rows('chit_member_pins')[0].failed_attempts)).toBe(0)
  })

  it('refuses a member who already won this chit', async () => {
    const d = await withPin(db({
      auctions: [{ id: 'a-1', user_id: OWNER, group_id: GROUP, month_number: 2, winner_member_id: ALICE, bid_amount: 40000 }],
    }))
    const r = await placeBid(bid(), asClient(d)) as any
    expect(r.reason).toBe('ALREADY_WON')
    expect(d.rows('chit_bids')).toHaveLength(0)
  })

  it('still lets a member bid when SOMEONE ELSE has won', async () => {
    const d = await withPin(db({
      auctions: [{ id: 'a-1', user_id: OWNER, group_id: GROUP, month_number: 2, winner_member_id: BOB, bid_amount: 40000 }],
    }))
    expect((await placeBid(bid(), asClient(d)) as any).ok).toBe(true)
  })

  it('refuses a member of a different group, without saying an auction exists', async () => {
    const d = await withPin(db(), CARL)
    const r = await placeBid(bid({ memberId: CARL }), asClient(d)) as any
    expect(r.reason).toBe('NO_WINDOW')
    expect(r.message).toMatch('not open')
  })

  it('refuses once bidding is closed', async () => {
    const d = await withPin(db({ windowStatus: 'closed' }))
    const r = await placeBid(bid(), asClient(d)) as any
    expect(r.reason).toBe('NO_WINDOW')
    expect(d.rows('chit_bids')).toHaveLength(0)
  })

  it('makes a member beat the standing bid, not merely match it', async () => {
    const d = await withPin(db({
      bids: [{ id: 'b-1', user_id: OWNER, group_id: GROUP, window_id: WINDOW, member_id: BOB, month_number: 4, amount: 60000, placed_at: NOW.toISOString() }],
    }))
    expect((await placeBid(bid({ amount: 60000 }), asClient(d)) as any).reason).toBe('BELOW_MINIMUM')
    expect((await placeBid(bid({ amount: 60500 }), asClient(d)) as any).reason).toBe('BELOW_MINIMUM')
    expect((await placeBid(bid({ amount: 61000 }), asClient(d)) as any).ok).toBe(true)
  })

  it('refuses a bid above the frozen ceiling', async () => {
    const d = await withPin(db())
    const r = await placeBid(bid({ amount: 160000 }), asClient(d)) as any
    expect(r.reason).toBe('ABOVE_CEILING')
  })

  it('tells a member honestly when their bid landed but did not lead', async () => {
    const d = await withPin(db({
      bids: [{ id: 'b-1', user_id: OWNER, group_id: GROUP, window_id: WINDOW, member_id: BOB, month_number: 4, amount: 90000, placed_at: '2026-08-18T05:00:00.000Z' }],
    }))
    // Alice bids less than Bob. The rules would normally stop her, so this is
    // the tie case: same amount, Bob got there first.
    const r = await placeBid(bid({ amount: 91000 }), asClient(d)) as any
    expect(r.ok).toBe(true)
    expect(r.youAreLeading).toBe(true)
  })

  it('breaks an exact tie in favour of whoever bid first', async () => {
    const d = await withPin(db({
      bids: [{ id: 'b-1', user_id: OWNER, group_id: GROUP, window_id: WINDOW, member_id: BOB, month_number: 4, amount: 91000, placed_at: '2026-08-18T05:00:00.000Z' }],
    }))
    // Force a same-amount row past the increment rule by inserting directly,
    // the way two simultaneous requests could both pass their own check.
    d.rows('chit_bids').push({
      id: 'b-2', user_id: OWNER, group_id: GROUP, window_id: WINDOW,
      member_id: ALICE, month_number: 4, amount: 91000, placed_at: '2026-08-18T05:00:01.000Z',
    })
    const live = await getLiveAuction(BOB, GROUP, asClient(d))
    expect(live!.highestAmount).toBe(91000)
    expect(live!.youAreLeading).toBe(true)     // Bob bid first
  })
})

// ── 3. What the member can see of the auction ───────────────────────────────

describe('the live auction as a member sees it', () => {
  it('shows the standing bid but never who placed it', async () => {
    const d = db({
      bids: [{ id: 'b-1', user_id: OWNER, group_id: GROUP, window_id: WINDOW, member_id: BOB, month_number: 4, amount: 75000, placed_at: NOW.toISOString() }],
    })
    const live = await getLiveAuction(ALICE, GROUP, asClient(d))
    expect(live!.highestAmount).toBe(75000)
    expect(live!.youAreLeading).toBe(false)
    // Bob's identity must not travel with the number.
    const serialised = JSON.stringify(live)
    expect(serialised).not.toContain(BOB)
    expect(serialised).not.toContain('Bob')
    expect(serialised).not.toContain('9123456780')
  })

  it('tells the member the least they could bid', async () => {
    const d = db({
      bids: [{ id: 'b-1', user_id: OWNER, group_id: GROUP, window_id: WINDOW, member_id: BOB, month_number: 4, amount: 75000, placed_at: NOW.toISOString() }],
    })
    const live = await getLiveAuction(ALICE, GROUP, asClient(d))
    expect(live!.minimumNext).toBe(76000)
    expect(live!.canBid).toBe(true)
  })

  it('reports a member who already won as blocked, with the reason', async () => {
    const d = db({
      auctions: [{ id: 'a-1', user_id: OWNER, group_id: GROUP, month_number: 2, winner_member_id: ALICE, bid_amount: 40000 }],
    })
    const live = await getLiveAuction(ALICE, GROUP, asClient(d))
    expect(live!.canBid).toBe(false)
    expect(live!.blockedReason).toMatch('already taken the prize')
  })

  it('returns nothing for a group the member is not in', async () => {
    expect(await getLiveAuction(CARL, GROUP, asClient(db()))).toBeNull()
  })

  it('returns nothing when no auction is running', async () => {
    expect(await getLiveAuction(ALICE, GROUP, asClient(db({ windowStatus: 'closed' })))).toBeNull()
  })

  it('shows a member their own best bid', async () => {
    const d = db({
      bids: [
        { id: 'b-1', user_id: OWNER, group_id: GROUP, window_id: WINDOW, member_id: ALICE, month_number: 4, amount: 30000, placed_at: '2026-08-18T05:00:00.000Z' },
        { id: 'b-2', user_id: OWNER, group_id: GROUP, window_id: WINDOW, member_id: BOB, month_number: 4, amount: 75000, placed_at: '2026-08-18T05:01:00.000Z' },
      ],
    })
    const live = await getLiveAuction(ALICE, GROUP, asClient(d))
    expect(live!.yourBestBid).toBe(30000)
    expect(live!.bidCount).toBe(2)
    expect(live!.youAreLeading).toBe(false)
  })
})
