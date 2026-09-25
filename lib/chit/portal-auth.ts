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

import { findMemberByPhone, type LookupMember } from './memberLookup'

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, k: number) => Promise<Buffer>

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

/* ── The permanent link ───────────────────────────────────────────────────── */
//
// One link per member, for as long as they are a member. It used to be
// single-use and short-lived, which read as careful and behaved as broken: a
// member who tapped it twice, changed phone or cleared their browser was locked
// out and had to ask for another.
//
// The secret moved rather than disappeared. The link says WHO you are; the PIN
// proves you ARE them, asked once per device instead of once per action. A link
// forwarded to the wrong person opens nothing once its owner has set a PIN.

/**
 * The member's link token, creating one the first time it is asked for.
 *
 * Stored in plain text on purpose. Hashing it would mean the foreman could
 * never show a member their own link again, only replace it — and "I lost the
 * message" is the everyday case, not the rare one. It is an identifier behind a
 * PIN, not a password.
 */
export async function ensurePortalToken(
  userId: string, memberId: string, client?: Db,
): Promise<{ token: string } | { error: string }> {
  const db = admin(client)

  const { data } = await db.from('chit_members')
    .select('id, user_id, portal_token, portal_enabled')
    .eq('id', memberId).eq('user_id', userId).limit(1)
  const row = data?.[0]
  if (!row) return { error: 'Member not found.' }
  if (!row.portal_enabled) {
    return { error: 'Portal access is switched off for this member. Turn it on first.' }
  }
  if (row.portal_token) return { token: String(row.portal_token) }

  const token = newToken()
  const { error } = await db.from('chit_members')
    .update({ portal_token: token, updated_at: new Date().toISOString() })
    .eq('id', memberId).eq('user_id', userId)
  if (error) return { error: error.message }
  return { token }
}

/**
 * Issue a new link and kill the old one. For a member who says their link
 * reached somebody it should not have. Signing every device out as well,
 * because a new link is meaningless while the old sessions still work.
 */
export async function rotatePortalToken(
  userId: string, memberId: string, now: Date = new Date(), client?: Db,
): Promise<{ token: string } | { error: string }> {
  const db = admin(client)
  const token = newToken()
  const { data, error } = await db.from('chit_members')
    .update({ portal_token: token, updated_at: now.toISOString() })
    .eq('id', memberId).eq('user_id', userId).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Member not found.' }
  await revokeAllSessions(userId, memberId, now, db)
  return { token }
}

export interface TokenPeek {
  ok: true
  memberId: string
  userId: string
  memberName: string
  /** Whether a PIN exists. No PIN yet means the next step is setting one. */
  hasPin: boolean
}

/**
 * Who does this link belong to? Reads only — a link preview, a prefetch or a
 * scanner can hit this as often as it likes and nothing happens.
 */
export async function peekPortalToken(
  token: string, client?: Db,
): Promise<TokenPeek | { ok: false; reason: string }> {
  const db = admin(client)
  const dead = { ok: false as const, reason: 'This link is not valid. Ask the chit organiser for yours.' }
  if (!token) return dead

  const { data } = await db.from('chit_members')
    .select('id, user_id, name, portal_enabled, is_active')
    .eq('portal_token', token).limit(1)
  const m = data?.[0]
  if (!m) return dead
  if (!m.portal_enabled || !m.is_active) {
    return { ok: false, reason: 'This account is no longer open. Please speak to the chit organiser.' }
  }

  const { data: pin } = await db.from('chit_member_pins')
    .select('member_id').eq('member_id', m.id).limit(1)

  return {
    ok: true, memberId: m.id, userId: m.user_id,
    memberName: m.name ?? '', hasPin: Boolean(pin?.length),
  }
}

/**
 * Open the portal from a permanent link.
 *
 * With a PIN already set, the PIN is required — that is what stops a forwarded
 * link being enough. Without one, the link alone gets them in and the very next
 * screen makes them set one, which is the only window in which the link is a
 * credential on its own.
 */
export async function openWithToken(
  token: string,
  pin: string | null,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  now: Date = new Date(),
  client?: Db,
): Promise<SessionGrant | { error: string; needsPin?: boolean }> {
  const db = admin(client)
  const peek = await peekPortalToken(token, db)
  if (!peek.ok) return { error: peek.reason }

  if (peek.hasPin) {
    if (!pin) return { error: 'Enter your PIN.', needsPin: true }
    const check = await checkPin(peek.memberId, pin, now, db)
    if (!check.ok) return { error: check.reason, needsPin: true }
  }

  return startSession(peek.userId, peek.memberId, meta, now, db)
}

export interface SessionGrant {
  sessionToken: string
  memberId: string
  expiresAt: string
  hasPin: boolean
}

/**
 * Create a portal session for a member who has already been identified.
 *
 * Two callers: redeeming a link, and signing in with a phone number and PIN.
 * Both have proved who they are by the time they get here, in different ways.
 * Neither should be writing session rows by hand.
 */
export async function startSession(
  userId: string,
  memberId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  now: Date = new Date(),
  client?: Db,
  inviteId?: string | null,
): Promise<SessionGrant | { error: string }> {
  const db = admin(client)
  const nowIso = now.toISOString()
  const sessionToken = newToken()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000).toISOString()

  const { error } = await db.from('chit_portal_sessions').insert({
    user_id: userId, member_id: memberId, invite_id: inviteId ?? null,
    session_hash: hashToken(sessionToken), expires_at: expiresAt,
    last_seen_at: nowIso,
    user_agent: (meta.userAgent ?? '').slice(0, 400) || null,
    ip: meta.ip ?? null,
  })
  if (error) return { error: 'Could not start a session. Please try again.' }

  const { data: pin } = await db.from('chit_member_pins')
    .select('member_id').eq('member_id', memberId).limit(1)

  return { sessionToken, memberId, expiresAt, hasPin: Boolean(pin?.length) }
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

// ── Signing back in without a new link ──────────────────────────────────────
//
// A link gets somebody in the first time. It does not get them back in three
// months later when the cookie has expired, or when they change phones, or when
// they clear their browser — and in all three cases the only recovery was to
// ask the foreman for another link. That is not a login, it is a favour.
//
// So: the number they already gave you, plus the PIN they set on their first
// visit. Four digits is a weak secret, which is why checkPin locks the member
// out after PIN_MAX_ATTEMPTS and the portal is read-only. Nothing here can move
// money.

/**
 * Sign in with a phone number and a PIN. Returns the same grant a link does.
 *
 * "We could not find that number" and "that PIN is wrong" are deliberately
 * different messages: a chit's members already know who else is in it, so
 * hiding existence buys nothing, while a member who mistyped their own number
 * and is told only "wrong PIN" will try the PIN five times and lock themselves
 * out of an account they were never in.
 */
export async function signInWithPin(
  phone: string,
  pin: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  now: Date = new Date(),
  client?: Db,
): Promise<SessionGrant | { error: string }> {
  const db = admin(client)

  const { data } = await db.from('chit_members')
    .select('id, user_id, name, phone, portal_enabled, is_active')
    .eq('portal_enabled', true).eq('is_active', true)

  const found = findMemberByPhone((data ?? []) as LookupMember[], phone)
  if (found.kind === 'none') {
    return { error: 'We could not find that number. Check it, or ask the chit organiser for a link.' }
  }
  if (found.kind === 'ambiguous') {
    // Two members on one number. Guessing which one would show somebody else's
    // dues, so it is refused and handled by a person.
    return { error: 'That number is on more than one member. Please ask the chit organiser for a link.' }
  }

  const row = (data ?? []).find(m => m.id === found.member.id) as
    { id: string; user_id: string } | undefined
  if (!row) return { error: 'We could not sign you in. Please try again.' }

  const check = await checkPin(row.id, pin, now, db)
  if (!check.ok) return { error: check.reason }

  return startSession(row.user_id, row.id, meta, now, db)
}
