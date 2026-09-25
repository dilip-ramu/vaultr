// Chit member portal — the security tests.
//
// This feature puts data on the phones of people who are NOT users of this app.
// The tests below are not about whether the pages look right; they are about the
// three things that would actually hurt if they were wrong:
//
//   1. The link identifies a member; the PIN is what proves they are them.
//   2. A session can be killed, and a member whose access is withdrawn loses it
//      on their next page load rather than whenever their session expires.
//   3. A member can never read another member's numbers, and never sees the
//      fields (Aadhaar, PAN, nominees, phone numbers) that are none of their
//      business.
//
// Everything runs against the in-memory Supabase. No network, no real keys.

import { describe, it, expect } from 'vitest'
import {
  hashToken, newToken, hashPin, verifyPin, validatePin,
  ensurePortalToken, rotatePortalToken, openWithToken, peekPortalToken,
  readSession, revokeSession, revokeAllSessions,
  setPin, checkPin, PIN_MAX_ATTEMPTS,
} from '@/lib/chit/portal-auth'
import { getMember, getGroups, getGroupDetail } from '@/lib/chit/portal-data'
import { FakeSupabase, asClient } from './helpers/fake-supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER = 'owner-1'
const ALICE = 'member-alice'
const BOB = 'member-bob'
const GROUP_A = 'group-a'
const GROUP_B = 'group-b'
const NOW = new Date('2026-08-18T06:00:00Z')
const later = (mins: number) => new Date(NOW.getTime() + mins * 60_000)

function db(): FakeSupabase {
  return new FakeSupabase({
    chit_members: [
      {
        id: ALICE, user_id: OWNER, name: 'Alice Kumar', phone: '9876543210',
        aadhaar: '1234 5678 9012', pan: 'ABCDE1234F',
        nominees: [{ name: 'Secret Nominee', phone: '9999999999' }],
        guarantors: [], reference_contacts: [], securities: [],
        address: '12 Long Road', notes: 'internal note',
        is_active: true, portal_enabled: true,
      },
      {
        id: BOB, user_id: OWNER, name: 'Bob Raj', phone: '9123456780',
        aadhaar: '9999 8888 7777', pan: 'ZZZZZ9999Z',
        nominees: [], guarantors: [], reference_contacts: [], securities: [],
        is_active: true, portal_enabled: false,
      },
    ],
    chit_groups: [
      { id: GROUP_A, user_id: OWNER, name: 'Sreenivasa 5L', chit_value: 500000, members: 20, commission_pct: 5, start_date: '2026-01-05', status: 'active' },
      { id: GROUP_B, user_id: OWNER, name: 'Private 10L', chit_value: 1000000, members: 25, commission_pct: 5, start_date: '2026-02-05', status: 'active' },
    ],
    chit_group_members: [
      { id: 'gm-1', user_id: OWNER, group_id: GROUP_A, member_id: ALICE, slot_number: 7 },
      { id: 'gm-2', user_id: OWNER, group_id: GROUP_A, member_id: BOB, slot_number: 8 },
      { id: 'gm-3', user_id: OWNER, group_id: GROUP_B, member_id: BOB, slot_number: 3 },
    ],
    chit_receivables: [
      { id: 'r-1', user_id: OWNER, group_id: GROUP_A, member_id: ALICE, month_number: 1, amount: 25000, due_date: '2026-01-14', status: 'PAID' },
      { id: 'r-2', user_id: OWNER, group_id: GROUP_A, member_id: ALICE, month_number: 2, amount: 24000, due_date: '2026-02-14', status: 'PENDING' },
      { id: 'r-3', user_id: OWNER, group_id: GROUP_A, member_id: BOB, month_number: 1, amount: 25000, due_date: '2026-01-14', status: 'OVERDUE' },
      { id: 'r-4', user_id: OWNER, group_id: GROUP_B, member_id: BOB, month_number: 1, amount: 40000, due_date: '2026-02-14', status: 'PENDING' },
    ],
    chit_collections: [
      { id: 'c-1', user_id: OWNER, group_id: GROUP_A, member_id: ALICE, month_number: 1, amount: 25000, paid_date: '2026-01-12' },
    ],
    chit_auctions: [
      { id: 'a-1', user_id: OWNER, group_id: GROUP_A, month_number: 1, auction_date: '2026-01-05', winner_member_id: BOB, bid_amount: 60000, net_payout: 415000, dividend_per_member: 2750 },
      { id: 'a-2', user_id: OWNER, group_id: GROUP_A, month_number: 2, auction_date: '2026-02-05', winner_member_id: ALICE, bid_amount: 50000, net_payout: 425000, dividend_per_member: 2250 },
    ],
    chit_portal_invites: [],
    chit_portal_sessions: [],
    chit_member_pins: [],
  })
}

// ── 1. Tokens and hashing ───────────────────────────────────────────────────

describe('nothing readable is ever stored', () => {
  it('hashes a token deterministically and irreversibly', () => {
    const t = newToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).not.toBe(t)
    expect(hashToken(t)).toHaveLength(64)      // sha-256 hex
  })

  it('mints tokens with real entropy — no two alike', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken()))
    expect(seen.size).toBe(200)
  })

  it('stores a PIN as a salted hash that still verifies', async () => {
    const stored = await hashPin('4915')
    expect(stored).not.toContain('4915')
    expect(await verifyPin('4915', stored)).toBe(true)
    expect(await verifyPin('4916', stored)).toBe(false)
  })

  it('salts, so the same PIN twice does not produce the same hash', async () => {
    expect(await hashPin('4915')).not.toBe(await hashPin('4915'))
  })

  it('refuses the PINs everyone picks', () => {
    expect(validatePin('1234').ok).toBe(false)
    expect(validatePin('0000').ok).toBe(false)
    expect(validatePin('12').ok).toBe(false)
    expect(validatePin('abcd').ok).toBe(false)
    expect(validatePin('4915').ok).toBe(true)
  })
})

// ── 2. The permanent link, and the PIN that guards it ──────────────────────

describe('one link per member, for as long as they are a member', () => {
  it('hands back the SAME link every time it is asked for', async () => {
    const d = db()
    const a = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    const b = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    // Asking again must not break the link already in somebody's WhatsApp.
    expect(a.token).toBe(b.token)
  })

  it('opens as many times as the member likes', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    for (const t of [1, 2, 3, 400]) {
      const grant = await openWithToken(token, null, {}, later(t), asClient(d)) as any
      expect(grant.memberId, `open #${t}`).toBe(ALICE)
    }
  })

  it('can be looked at without anything happening', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    const peek = await peekPortalToken(token, asClient(d)) as any
    expect(peek.ok).toBe(true)
    expect(peek.memberName).toBe('Alice Kumar')
    // A link preview must not create a session.
    expect(d.rows('chit_portal_sessions')).toHaveLength(0)
  })

  it('once a PIN exists, the link alone opens nothing', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    await setPin(OWNER, ALICE, '4915', NOW, asClient(d))

    const noPin = await openWithToken(token, null, {}, later(1), asClient(d)) as any
    expect(noPin.error).toBeDefined()
    expect(noPin.needsPin).toBe(true)

    const wrong = await openWithToken(token, '0000', {}, later(2), asClient(d)) as any
    expect(wrong.error).toBeDefined()

    const right = await openWithToken(token, '4915', {}, later(3), asClient(d)) as any
    expect(right.memberId).toBe(ALICE)
  })

  it('lets a member with no PIN in, because the next screen sets one', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    const grant = await openWithToken(token, null, {}, later(1), asClient(d)) as any
    expect(grant.memberId).toBe(ALICE)
    expect(grant.hasPin).toBe(false)
  })

  it('locks out a PIN being guessed at the door', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    await setPin(OWNER, ALICE, '4915', NOW, asClient(d))
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) {
      await openWithToken(token, '0000', {}, NOW, asClient(d))
    }
    const evenRight = await openWithToken(token, '4915', {}, NOW, asClient(d)) as any
    expect(evenRight.error).toMatch(/locked|Too many/i)
  })

  it('rotating issues a new link, kills the old one, and signs every device out', async () => {
    const d = db()
    const { token: old } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    await openWithToken(old, null, {}, later(1), asClient(d))
    expect(d.rows('chit_portal_sessions')).toHaveLength(1)

    const { token: fresh } = await rotatePortalToken(OWNER, ALICE, later(2), asClient(d)) as any
    expect(fresh).not.toBe(old)
    expect((await openWithToken(old, null, {}, later(3), asClient(d)) as any).error).toBeDefined()
    expect((await openWithToken(fresh, null, {}, later(3), asClient(d)) as any).memberId).toBe(ALICE)
    // The old sessions must die too, or a new link changes nothing.
    expect(d.rows('chit_portal_sessions').filter((r: any) => !r.revoked_at)).toHaveLength(1)
  })

  it('refuses to issue a link for a member whose portal access is off', async () => {
    const d = db()
    const r = await ensurePortalToken(OWNER, BOB, asClient(d)) as any
    expect(r.error).toMatch('switched off')
  })

  it('refuses to issue a link into another account\u2019s chit', async () => {
    const d = db()
    const r = await ensurePortalToken('someone-else', ALICE, asClient(d)) as any
    expect(r.error).toMatch('not found')
  })

  it('says nothing useful about a link that is not real', async () => {
    const d = db()
    const bogus = await peekPortalToken('completely-made-up', asClient(d)) as any
    expect(bogus.ok).toBe(false)
    expect(bogus.reason).toMatch('not valid')
  })

  it('shuts the door when access is switched off, link or no link', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    await asClient(d).from('chit_members').update({ portal_enabled: false }).eq('id', ALICE)
    expect((await openWithToken(token, null, {}, later(1), asClient(d)) as any).error).toBeDefined()
  })
})

// ── 3. Sessions can be taken away ───────────────────────────────────────────

describe('access can be withdrawn, and takes effect immediately', () => {
  async function signedIn(d: FakeSupabase) {
    const { token } = await ensurePortalToken(OWNER, ALICE, asClient(d)) as any
    return (await openWithToken(token, null, {}, later(1), asClient(d)) as any).sessionToken as string
  }

  it('a revoked session stops working', async () => {
    const d = db()
    const token = await signedIn(d)
    await revokeSession(token, later(5), asClient(d))
    expect(await readSession(token, later(6), asClient(d))).toBeNull()
  })

  it('revoking all sessions signs out every device', async () => {
    const d = db()
    const a = await signedIn(d)
    const b = await signedIn(d)
    const count = await revokeAllSessions(OWNER, ALICE, later(5), asClient(d))
    expect(count).toBe(2)
    expect(await readSession(a, later(6), asClient(d))).toBeNull()
    expect(await readSession(b, later(6), asClient(d))).toBeNull()
  })

  it('switching portal access off invalidates a live session on the next load', async () => {
    const d = db()
    const token = await signedIn(d)
    expect(await readSession(token, later(2), asClient(d))).not.toBeNull()
    d.rows('chit_members').find((m: any) => m.id === ALICE)!.portal_enabled = false
    expect(await readSession(token, later(3), asClient(d))).toBeNull()
  })

  it('deactivating the member invalidates the session too', async () => {
    const d = db()
    const token = await signedIn(d)
    d.rows('chit_members').find((m: any) => m.id === ALICE)!.is_active = false
    expect(await readSession(token, later(3), asClient(d))).toBeNull()
  })

  it('an expired session is not a session', async () => {
    const d = db()
    const token = await signedIn(d)
    const wayLater = new Date(NOW.getTime() + 200 * 86_400_000)
    expect(await readSession(token, wayLater, asClient(d))).toBeNull()
  })

  it('no cookie means no session', async () => {
    expect(await readSession(undefined, NOW, asClient(db()))).toBeNull()
    expect(await readSession('', NOW, asClient(db()))).toBeNull()
  })
})

// ── 4. PIN lockout ──────────────────────────────────────────────────────────

describe('a four-digit secret cannot simply be counted through', () => {
  it('accepts the right PIN', async () => {
    const d = db()
    await setPin(OWNER, ALICE, '4915', NOW, asClient(d))
    expect((await checkPin(ALICE, '4915', NOW, asClient(d))).ok).toBe(true)
  })

  it('locks out after repeated wrong attempts', async () => {
    const d = db()
    await setPin(OWNER, ALICE, '4915', NOW, asClient(d))
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) {
      const r = await checkPin(ALICE, '0001', NOW, asClient(d))
      expect(r.ok).toBe(false)
    }
    const final = await checkPin(ALICE, '0001', NOW, asClient(d)) as any
    expect(final.ok).toBe(false)
    expect(final.reason).toMatch('locked')
    // Even the correct PIN is refused while locked.
    expect((await checkPin(ALICE, '4915', NOW, asClient(d))).ok).toBe(false)
  })

  it('a correct PIN clears the failure count', async () => {
    const d = db()
    await setPin(OWNER, ALICE, '4915', NOW, asClient(d))
    await checkPin(ALICE, '0001', NOW, asClient(d))
    await checkPin(ALICE, '4915', NOW, asClient(d))
    expect(Number(d.rows('chit_member_pins')[0].failed_attempts)).toBe(0)
  })

  it('refuses a weak PIN at the point of setting it', async () => {
    const d = db()
    const r = await setPin(OWNER, ALICE, '1234', NOW, asClient(d)) as any
    expect(r.ok).toBe(false)
    expect(d.rows('chit_member_pins')).toHaveLength(0)
  })
})

// ── 5. What a member can actually read ──────────────────────────────────────

describe('a member sees their own account and nothing else', () => {
  it('returns their name and a MASKED phone, and no KYC fields at all', async () => {
    const m = await getMember(ALICE, asClient(db()))
    expect(m!.name).toBe('Alice Kumar')
    expect(m!.phoneMasked).toBe('••••• 3210')
    const serialised = JSON.stringify(m)
    for (const secret of ['1234 5678 9012', 'ABCDE1234F', 'Secret Nominee', '9876543210', 'internal note', '12 Long Road']) {
      expect(serialised).not.toContain(secret)
    }
  })

  it('lists only the groups the member is actually in', async () => {
    const groups = await getGroups(ALICE, asClient(db()))
    expect(groups).toHaveLength(1)
    expect(groups[0].groupId).toBe(GROUP_A)
    expect(groups[0].slotNumber).toBe(7)
  })

  it('totals only the member’s own dues, never the group’s', async () => {
    const [g] = await getGroups(ALICE, asClient(db()))
    // Alice owes 25000 + 24000 and has paid 25000. Bob's rows must not appear.
    expect(g.totalDue).toBe(49000)
    expect(g.totalPaid).toBe(25000)
    expect(g.outstanding).toBe(24000)
  })

  it('refuses a group the member is not in, without confirming it exists', async () => {
    const detail = await getGroupDetail(ALICE, GROUP_B, asClient(db()))
    expect(detail).toBeNull()
  })

  it('refuses a group id that is pure invention, identically', async () => {
    const detail = await getGroupDetail(ALICE, 'group-does-not-exist', asClient(db()))
    expect(detail).toBeNull()
  })

  it('shows the member’s own passbook rows only', async () => {
    const detail = await getGroupDetail(ALICE, GROUP_A, asClient(db()))
    expect(detail!.ledger).toHaveLength(2)
    expect(detail!.ledger.map(r => r.monthNumber)).toEqual([1, 2])
    expect(detail!.ledger[0].paidAmount).toBe(25000)
    expect(detail!.ledger[1].status).toBe('PENDING')
  })

  it('shows group auction results, because that is how the amount was worked out', async () => {
    const detail = await getGroupDetail(ALICE, GROUP_A, asClient(db()))
    expect(detail!.auctions).toHaveLength(2)
    expect(detail!.auctions[0].discount).toBe(60000)
    expect(detail!.auctions[0].dividendPerMember).toBe(2750)
  })

  it('names the winner but leaks nothing else about them', async () => {
    const detail = await getGroupDetail(ALICE, GROUP_A, asClient(db()))
    const monthOne = detail!.auctions[0]
    expect(monthOne.winnerName).toBe('Bob Raj')
    expect(monthOne.wonByYou).toBe(false)
    const serialised = JSON.stringify(detail)
    // Bob's identifiers, contact details and payment status stay out.
    for (const secret of ['9123456780', 'ZZZZZ9999Z', '9999 8888 7777', BOB]) {
      expect(serialised).not.toContain(secret)
    }
  })

  it('marks the member’s own win as theirs', async () => {
    const detail = await getGroupDetail(ALICE, GROUP_A, asClient(db()))
    const monthTwo = detail!.auctions[1]
    expect(monthTwo.wonByYou).toBe(true)
    expect(monthTwo.netPayout).toBe(425000)
  })

  it('never returns another member’s numbers even in the same group', async () => {
    const detail = await getGroupDetail(ALICE, GROUP_A, asClient(db()))
    // Bob is overdue in this group. Alice must not be able to tell.
    expect(JSON.stringify(detail)).not.toContain('OVERDUE')
  })
})
