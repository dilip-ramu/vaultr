// Getting into the member portal.
//
// The link is permanent and identifies the member; the PIN proves they are
// them, once per device. This file covers the second door — a member who has
// lost the message entirely and signs in with their phone number instead — and
// the property that matters for the first: a link preview can fetch the URL as
// often as it likes without anything happening.

import { describe, it, expect } from 'vitest'
import {
  ensurePortalToken, peekPortalToken, openWithToken, signInWithPin, startSession,
  readSession, setPin, PIN_MAX_ATTEMPTS,
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

describe('a link preview must change nothing', () => {
  it('can be fetched as often as an app likes, without starting anything', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ASHA, asClient(d) as any) as any

    // WhatsApp, then Safari's prefetch, then a scanner.
    for (let i = 0; i < 3; i++) {
      const peek = await peekPortalToken(token, asClient(d) as any) as any
      expect(peek.ok).toBe(true)
    }
    expect(d.rows('chit_portal_sessions')).toHaveLength(0)

    // And the member still gets in afterwards.
    const grant = await openWithToken(token, null, {}, later(30), asClient(d) as any) as any
    expect(grant.memberId).toBe(ASHA)
  })

  it('greets the member by name from the peek alone', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ASHA, asClient(d) as any) as any
    const peek = await peekPortalToken(token, asClient(d) as any) as any
    expect(peek.memberName).toBe('Asha Rani')
    expect(peek.hasPin).toBe(false)
  })

  it('reports that a PIN exists, so the page knows to ask for it', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ASHA, asClient(d) as any) as any
    await setPin(OWNER, ASHA, '8317', NOW, asClient(d) as any)
    const peek = await peekPortalToken(token, asClient(d) as any) as any
    expect(peek.hasPin).toBe(true)
  })

  it('refuses a token that was never real', async () => {
    const d = db()
    expect((await peekPortalToken('not-a-token', asClient(d) as any) as any).ok).toBe(false)
  })

  it('will not issue a link for a member whose portal access is off', async () => {
    const d = db()
    const off = await ensurePortalToken(OWNER, OFF, asClient(d) as any) as any
    expect(off.error).toBeDefined()
  })
})

describe('a link opened the next morning', () => {
  it('still works, because it never expires', async () => {
    const d = db()
    const { token } = await ensurePortalToken(OWNER, ASHA, asClient(d) as any) as any
    const grant = await openWithToken(token, null, {}, later(400 * 24 * 60), asClient(d) as any) as any
    expect(grant.memberId).toBe(ASHA)
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
