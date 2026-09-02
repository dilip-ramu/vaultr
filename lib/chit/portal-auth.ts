// Chit member portal — authentication. SERVER ONLY.
//
// WHY THIS FILE IS SHAPED THIS WAY
//
// Members log in by opening a link the foreman sends them on WhatsApp. A link
// is a weak credential: WhatsApp messages get forwarded, and a forwarded login
// is indistinguishable from the real member. Three rules make that acceptable:
//
//   1. SINGLE USE. Opening the link exchanges it for a session and marks the
//      invite spent. Forwarding it afterwards achieves nothing.
//   2. SHORT LIFE. An unopened invite dies in 30 minutes, so a message sitting
//      in someone's chat history is not a standing key to the account.
//   3. NOTHING READABLE IS STORED. The database holds SHA-256 of the token and
//      a salted scrypt hash of the PIN. A database leak yields no logins.
//
// The session cookie is httpOnly and Secure, so page scripts cannot read it.
//
// The PIN is not required to READ the passbook — that would be friction for no
// gain, since the session already proves possession of the phone the link was
// sent to. It exists to gate WRITES (phase 2, bidding), where the stakes are a
// real payout rather than a page view.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createAdminClient } from '@/lib/supabase/admin'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The database handle. Defaulted rather than imported at the call site so the
 * whole login lifecycle can be exercised against an in-memory Supabase in tests
 * — the alternative is shipping auth code that has never been run.
 */
export type Db = ReturnType<typeof createAdminClient>
const admin = (db?: Db): Db => db ?? createAdminClient()

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, k: number) => Promise<Buffer>

/** How long an unopened WhatsApp link stays valid. */
export const INVITE_TTL_MINUTES = 30
/** How long a phone stays signed in before it needs a fresh link. */
export const SESSION_TTL_DAYS = 90
/** Wrong PINs before the member is locked out. */
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCK_MINUTES = 15

export const SESSION_COOKIE = 'chit_portal_session'

/** Tokens are compared by hash, never by value. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A URL-safe token with 256 bits of entropy. Long enough that guessing is not
 *  a threat model worth discussing. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

// ── PIN hashing ─────────────────────────────────────────────────────────────
//
// scrypt from Node's own crypto, so there is no new dependency to audit. Stored
// as "scrypt$<salt hex>$<hash hex>" — the format carries its own algorithm, so
// a future change can re-hash on next login instead of locking everyone out.

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(pin, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(pin, Buffer.from(saltHex, 'hex'), expected.length)
  // Constant time, so a wrong PIN cannot be narrowed down by timing.
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** A PIN must be four digits and not one of the handful everybody picks. */
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1212', '2580', '0123',
])
export function validatePin(pin: string): { ok: true } | { ok: false; reason: string } {
  if (!/^\d{4}$/.test(pin)) return { ok: false, reason: 'The PIN must be exactly 4 digits.' }
  if (WEAK_PINS.has(pin)) return { ok: false, reason: 'That PIN is too easy to guess. Please choose another.' }
  return { ok: true }
}

// ── Invites ─────────────────────────────────────────────────────────────────

export interface MintedInvite {
  /** The only place the raw token ever exists. Send it, do not store it. */
  token: string
  expiresAt: string
}

/**
 * Create a one-time login link for a member. Owner-authenticated callers only —
 * `userId` is the FOREMAN, and it is checked against the member row so one
 * account cannot mint a link into another account's chit.
 */
export async function mintInvite(
  userId: string, memberId: string, now: Date = new Date(), client?: Db,
): Promise<MintedInvite | { error: string }> {
  const db = admin(client)

  const { data: member } = await db.from('chit_members')
    .select('id, user_id, portal_enabled')
    .eq('id', memberId).eq('user_id', userId).limit(1)
  const row = member?.[0]
  if (!row) return { error: 'Member not found.' }
  if (!row.portal_enabled) return { error: 'Portal access is switched off for this member. Turn it on first.' }

  const token = newToken()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MINUTES * 60_000).toISOString()

  // Any earlier unused invite is spent now. Only the newest link ever works, so
  // re-sending cannot leave two valid keys in circulation.
  await db.from('chit_portal_invites')
    .update({ used_at: now.toISOString() })
    .eq('member_id', memberId).is('used_at', null)

  const { error } = await db.from('chit_portal_invites').insert({
    user_id: userId, member_id: memberId,
    token_hash: hashToken(token), expires_at: expiresAt,
  })
  if (error) return { error: error.message }

  return { token, expiresAt }
}

export interface SessionGrant {
  sessionToken: string
  memberId: string
  expiresAt: string
  hasPin: boolean
}

/**
 * Exchange a link token for a session. This is the ONLY way a session is ever
 * created. It refuses an invite that is expired, already used, or belongs to a
 * member whose access has since been switched off.
 */
export async function redeemInvite(
  token: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  now: Date = new Date(),
  client?: Db,
): Promise<SessionGrant | { error: string }> {
  const db = admin(client)
  const nowIso = now.toISOString()

  const { data } = await db.from('chit_portal_invites')
    .select('id, user_id, member_id, expires_at, used_at')
    .eq('token_hash', hashToken(token)).limit(1)
  const invite = data?.[0]

  // One message for every failure mode on purpose: telling a stranger WHICH
  // part was wrong helps them and helps nobody else.
  const dead = { error: 'This link is no longer valid. Ask for a new one.' }
  if (!invite) return dead
  if (invite.used_at) return dead
  if (new Date(invite.expires_at) <= now) return dead

  const { data: member } = await db.from('chit_members')
    .select('id, portal_enabled, is_active')
    .eq('id', invite.member_id).limit(1)
  const m = member?.[0]
  if (!m || !m.portal_enabled || !m.is_active) return dead

  // Spend the invite FIRST. If anything below fails the link is still burnt,
  // which is the safe direction to fail in.
  const { data: spent } = await db.from('chit_portal_invites')
    .update({ used_at: nowIso })
    .eq('id', invite.id).is('used_at', null)
    .select('id')
  // Empty means someone else redeemed it in the moment between our read and our
  // write. The unique index is doing its job; treat it as already used.
  if (!spent?.length) return dead

  const sessionToken = newToken()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000).toISOString()
  const { error } = await db.from('chit_portal_sessions').insert({
    user_id: invite.user_id, member_id: invite.member_id, invite_id: invite.id,
    session_hash: hashToken(sessionToken), expires_at: expiresAt,
    last_seen_at: nowIso,
    user_agent: (meta.userAgent ?? '').slice(0, 400) || null,
    ip: meta.ip ?? null,
  })
  if (error) return { error: 'Could not start a session. Please try the link again.' }

  const { data: pin } = await db.from('chit_member_pins')
    .select('member_id').eq('member_id', invite.member_id).limit(1)

  return {
    sessionToken, memberId: invite.member_id, expiresAt,
    hasPin: Boolean(pin?.length),
  }
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface PortalSession {
  memberId: string
  userId: string
  sessionId: string
}

/**
 * Who is this request? Returns null for anything that is not a live session.
 * Every portal page and route calls this first and gets `memberId` from it —
 * a member id is NEVER read from a URL, a form field or a header.
 */
export async function readSession(
  sessionToken: string | undefined | null, now: Date = new Date(), client?: Db,
): Promise<PortalSession | null> {
  if (!sessionToken) return null
  const db = admin(client)

  const { data } = await db.from('chit_portal_sessions')
    .select('id, user_id, member_id, expires_at, revoked_at')
    .eq('session_hash', hashToken(sessionToken)).limit(1)
  const s = data?.[0]
  if (!s) return null
  if (s.revoked_at) return null
  if (new Date(s.expires_at) <= now) return null

  // Confirm access is still on. A revoked member must lose the portal on their
  // next page load, not whenever their session happens to expire.
  const { data: member } = await db.from('chit_members')
    .select('id, portal_enabled, is_active').eq('id', s.member_id).limit(1)
  const m = member?.[0]
  if (!m || !m.portal_enabled || !m.is_active) return null

  await db.from('chit_portal_sessions')
    .update({ last_seen_at: now.toISOString() }).eq('id', s.id)

  return { memberId: s.member_id, userId: s.user_id, sessionId: s.id }
}

/** Sign out one phone. */
export async function revokeSession(sessionToken: string, now: Date = new Date(), client?: Db): Promise<void> {
  const db = admin(client)
  await db.from('chit_portal_sessions')
    .update({ revoked_at: now.toISOString() })
    .eq('session_hash', hashToken(sessionToken)).is('revoked_at', null)
}

/** Sign out every phone for a member. The foreman's kill switch. */
export async function revokeAllSessions(
  userId: string, memberId: string, now: Date = new Date(), client?: Db,
): Promise<number> {
  const db = admin(client)
  const { data } = await db.from('chit_portal_sessions')
    .update({ revoked_at: now.toISOString() })
    .eq('user_id', userId).eq('member_id', memberId).is('revoked_at', null)
    .select('id')
  return data?.length ?? 0
}

// ── PIN lifecycle ───────────────────────────────────────────────────────────

export async function setPin(
  userId: string, memberId: string, pin: string, now: Date = new Date(), client?: Db,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const check = validatePin(pin)
  if (!check.ok) return { ok: false, reason: check.reason }

  const db = admin(client)
  const { error } = await db.from('chit_member_pins').upsert({
    member_id: memberId, user_id: userId,
    pin_hash: await hashPin(pin),
    failed_attempts: 0, locked_until: null,
    updated_at: now.toISOString(),
  }, { onConflict: 'member_id' })
  if (error) return { ok: false, reason: 'Could not save the PIN. Please try again.' }
  return { ok: true }
}

/**
 * Check a PIN, with a lockout so a four-digit secret cannot simply be counted
 * through. Phase 2 calls this before accepting a bid.
 */
export async function checkPin(
  memberId: string, pin: string, now: Date = new Date(), client?: Db,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = admin(client)
  const { data } = await db.from('chit_member_pins')
    .select('*').eq('member_id', memberId).limit(1)
  const row = data?.[0]
  if (!row) return { ok: false, reason: 'No PIN has been set yet.' }

  if (row.locked_until && new Date(row.locked_until) > now) {
    return { ok: false, reason: `Too many wrong attempts. Try again after ${new Date(row.locked_until).toLocaleTimeString('en-IN')}.` }
  }

  if (await verifyPin(pin, row.pin_hash)) {
    if (row.failed_attempts !== 0 || row.locked_until) {
      await db.from('chit_member_pins')
        .update({ failed_attempts: 0, locked_until: null }).eq('member_id', memberId)
    }
    return { ok: true }
  }

  const attempts = Number(row.failed_attempts ?? 0) + 1
  const locked = attempts >= PIN_MAX_ATTEMPTS
  await db.from('chit_member_pins').update({
    failed_attempts: locked ? 0 : attempts,
    locked_until: locked ? new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000).toISOString() : null,
  }).eq('member_id', memberId)

  return {
    ok: false,
    reason: locked
      ? `Too many wrong attempts. The PIN is locked for ${PIN_LOCK_MINUTES} minutes.`
      : `Wrong PIN. ${PIN_MAX_ATTEMPTS - attempts} ${PIN_MAX_ATTEMPTS - attempts === 1 ? 'try' : 'tries'} left.`,
  }
}
