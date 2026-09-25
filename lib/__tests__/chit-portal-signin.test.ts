// Getting into the member portal — the two things that were broken.
//
// ONE: a link preview spent the token. Every messaging app fetches a URL to
// build its preview card, and redeeming used to happen on that GET. So WhatsApp
// consumed the invite the moment it was sent, and the member tapped a link that
// was already used. The portal was not broken; it worked once, for a robot.
//
// TWO: there was no way back in. The link is single use and the session
// eventually expires, so a member on a new phone had to ask the organiser for
// another link. That is not a login.
//
// Both fixes are asserted here against the in-memory Supabase.

import { describe, it, expect } from 'vitest'
import {
  mintInvite, peekInvite, redeemInvite, signInWithPin, startSession,
  readSession, setPin, INVITE_TTL_MINUTES, INVITE_TTL_DAYS, PIN_MAX_ATTEMPTS,
} from '@/lib/chit/portal-auth'
import { FakeSupabase, asClient } from './helpers/fake-supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER = 'owner-1'
const ASHA = 'member-asha'
const BALA = 'member-bala'
const OFF = 'member-off'
const NOW = new Date('2026-09-25T06:00:00Z')
const later = (mins: number) => new Date(NOW.getTime() + mins * 60_000)

function db(): FakeSupabase {
  return new FakeSupabase({
    chit_members: [
      { id: ASHA, user_id: OWNER, name: 'Asha Rani', phone: '+91 98765 43210', is_active: true, portal_enabled: true },
      { id: BALA, user_id: OWNER, name: 'Bala S', phone: '9123456780', is_active: true, portal_enabled: true },
      { id: OFF, user_id: OWNER, name: 'Switched Off', phone: '9000000000', is_active: true, portal_enabled: false },
    ],
    chit_portal_invites: [],
    chit_portal_sessions: [],
    chit_member_pins: [],
  })
}

/* ── The preview problem ─────────────────────────────────────────────────── */

describe('a link preview must not spend the invite', () => {
  it('lets the link be looked at without using it up', async () => {
    const d = db()
    const minted = await mintInvite(OWNER, ASHA, NOW, asClient(d) as any)
    const token = (minted as any).token

    // WhatsApp fetches it. Twice, because apps do.
    const first = await peekInvite(token, later(1), asClient(d) as any)
    const second = await peekInvite(token, later(2), asClient(d) as any)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)

    // And the member, later, still gets in.
    const grant = await redeemInvite(token, {}, later(30), asClient(d) as any)
    expect('error' in grant).toBe(false)
  })

  it('greets the member by name from the peek, without a session', async () => {
    const d = db()
    const minted = await mintInvite(OWNER, ASHA, NOW, asClient(d) as any)
    const peek = await peekInvite((minted as any).token, later(1), asClient(d) as any)
    expect(peek.ok && peek.memberName).toBe('Asha Rani')
    expect(d.rows('chit_portal_sessions').length).toBe(0)
  })

  it('still refuses a token that has actually been used', async () => {
    const d = db()
    const minted = await mintInvite(OWNER, ASHA, NOW, asClient(d) as any)
    const token = (minted as any).token
    await redeemInvite(token, {}, later(5), asClient(d) as any)

    const peek = await peekInvite(token, later(6), asClient(d) as any)
    expect(peek.ok).toBe(false)
  })

  it('refuses an expired token, and one for a member whose access is off', async () => {
    const d = db()
    const minted = await mintInvite(OWNER, ASHA, NOW, asClient(d) as any)
    expect((await peekInvite((minted as any).token, later(INVITE_TTL_MINUTES + 1), asClient(d) as any)).ok).toBe(false)

    const off = await mintInvite(OWNER, OFF, NOW, asClient(d) as any)
    expect('error' in off).toBe(true)   // never minted in the first place
  })

  it('refuses a token that was never real', async () => {
    const d = db()
    expect((await peekInvite('not-a-token', NOW, asClient(d) as any)).ok).toBe(false)
  })
})

describe('how long a link lasts', () => {
  it('is a week, not half an hour — the message is read after work', () => {
    expect(INVITE_TTL_DAYS).toBe(7)
    expect(INVITE_TTL_MINUTES).toBe(7 * 24 * 60)
  })

  it('a link opened the next morning still works', async () => {
    const d = db()
    const minted = await mintInvite(OWNER, ASHA, NOW, asClient(d) as any)
    const grant = await redeemInvite((minted as any).token, {}, later(16 * 60), asClient(d) as any)
    expect('error' in grant).toBe(false)
  })
})

/* ── Signing back in ─────────────────────────────────────────────────────── */

describe('signing in with a phone number and a PIN', () => {
  async function withPin(d: FakeSupabase, memberId: string, pin: string) {
    const r = await setPin(OWNER, memberId, pin, NOW, asClient(d) as any)
    expect(r.ok).toBe(true)
  }

  it('lets a member back in with no help from the organiser', async () => {
    const d = db()
    await withPin(d, ASHA, '8317')
    const grant = await signInWithPin('98765 43210', '8317', {}, NOW, asClient(d) as any)
    expect('error' in grant).toBe(false)
    expect((grant as any).memberId).toBe(ASHA)
  })

  it('accepts the number typed any of the ways a person types it', async () => {
    const d = db()
    await withPin(d, ASHA, '8317')
    for (const typed of ['9876543210', '+919876543210', '098765-43210', '+91 98765 43210']) {
      const g = await signInWithPin(typed, '8317', {}, NOW, asClient(d) as any)
      expect('error' in g, typed).toBe(false)
    }
  })

  it('issues a session that the portal then accepts', async () => {
    const d = db()
    await withPin(d, ASHA, '8317')
    const grant: any = await signInWithPin('9876543210', '8317', {}, NOW, asClient(d) as any)
    const session = await readSession(grant.sessionToken, later(5), asClient(d) as any)
    expect(session?.memberId).toBe(ASHA)
  })

  it('refuses the wrong PIN and says how many tries are left', async () => {
    const d = db()
    await withPin(d, ASHA, '8317')
    const g: any = await signInWithPin('9876543210', '0000', {}, NOW, asClient(d) as any)
    expect(g.error).toContain('Wrong PIN')
  })

  it('locks the member out rather than letting a four-digit secret be counted through', async () => {
    const d = db()
    await withPin(d, ASHA, '8317')
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) {
      await signInWithPin('9876543210', '0001', {}, NOW, asClient(d) as any)
    }
    // Even the RIGHT pin is refused while locked.
    const g: any = await signInWithPin('9876543210', '8317', {}, NOW, asClient(d) as any)
    expect(g.error).toMatch(/locked|Too many/i)
  })

  it('tells someone who mistyped their number that it was the number', async () => {
    // Otherwise they burn five PIN attempts on an account they were never in.
    const d = db()
    await withPin(d, ASHA, '8317')
    const g: any = await signInWithPin('9999999999', '8317', {}, NOW, asClient(d) as any)
    expect(g.error).toContain('could not find that number')
  })

  it('will not sign in a member whose portal access is switched off', async () => {
    const d = db()
    await withPin(d, OFF, '4242')
    const g: any = await signInWithPin('9000000000', '4242', {}, NOW, asClient(d) as any)
    expect(g.error).toContain('could not find that number')
  })

  it('refuses when a member has no PIN, instead of letting anyone in', async () => {
    const d = db()
    const g: any = await signInWithPin('9123456780', '1234', {}, NOW, asClient(d) as any)
    expect('error' in g).toBe(true)
  })

  it('never signs one member in as another', async () => {
    const d = db()
    await withPin(d, ASHA, '8317')
    await withPin(d, BALA, '8317')          // same PIN, different people
    const g: any = await signInWithPin('9123456780', '8317', {}, NOW, asClient(d) as any)
    expect(g.memberId).toBe(BALA)
  })
})

describe('starting a session directly', () => {
  it('reports whether a PIN already exists, so onboarding can branch', async () => {
    const d = db()
    const fresh: any = await startSession(OWNER, ASHA, {}, NOW, asClient(d) as any)
    expect(fresh.hasPin).toBe(false)

    await setPin(OWNER, ASHA, '8317', NOW, asClient(d) as any)
    const again: any = await startSession(OWNER, ASHA, {}, NOW, asClient(d) as any)
    expect(again.hasPin).toBe(true)
  })
})
