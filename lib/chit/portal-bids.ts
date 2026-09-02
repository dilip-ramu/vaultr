// Chit member portal — THE ONLY PLACE A MEMBER CAN WRITE ANYTHING. SERVER ONLY.
//
// Phase 1 gave members nothing to write. This is the single exception, and it is
// deliberately narrow.
//
// WHAT A BID IS NOT
//
// A bid is a REQUEST. It writes one row to chit_bids and nothing else. It does
// not create an auction, does not name a winner, does not move cash, and cannot
// reach chit_auctions, chit_collections, transactions or accounts. When bidding
// closes the foreman still records the auction by hand; the bid log is what he
// reads before doing it. So the worst a compromised member session can do is put
// a number in a list that a person then looks at.
//
// WHAT IT TAKES TO PLACE ONE
//
//   • a live portal session (the cookie, not anything from the request body)
//   • the correct 4-digit PIN, checked every time, with lockout
//   • every rule in lib/chit/bidding.ts
//
// The PIN is why phase 1 collected one. Reading a passbook needs only the phone;
// committing to money needs something the phone alone does not supply.

import { createAdminClient } from '@/lib/supabase/admin'
import { checkBid, minimumAcceptableBid, type BidRejection } from './bidding'
import { checkPin } from './portal-auth'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Db = ReturnType<typeof createAdminClient>
const admin = (db?: Db): Db => db ?? createAdminClient()
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

export interface PlaceBidParams {
  memberId: string
  sessionId: string
  groupId: string
  amount: unknown
  pin: string
  ip?: string | null
  now?: Date
}

export type PlaceBidResult =
  | { ok: true; amount: number; youAreLeading: boolean; bidId: string }
  | { ok: false; reason: BidRejection | 'BAD_PIN' | 'NO_WINDOW' | 'WRITE_FAILED'; message: string }

/**
 * Place one bid. Every failure returns a message written for the member — the
 * person reading it is standing in an auction on a phone, not reading a log.
 */
export async function placeBid(p: PlaceBidParams, client?: Db): Promise<PlaceBidResult> {
  const db = admin(client)
  const now = p.now ?? new Date()

  // ── Is this member in this group, and have they already had their turn? ──
  const [{ data: membership }, { data: windows }, { data: won }] = await Promise.all([
    db.from('chit_group_members').select('group_id')
      .eq('member_id', p.memberId).eq('group_id', p.groupId).limit(1),
    db.from('chit_bid_windows')
      .select('id, user_id, group_id, month_number, status, ceiling_amount, min_increment')
      .eq('group_id', p.groupId).eq('status', 'open').limit(1),
    db.from('chit_auctions').select('winner_member_id').eq('group_id', p.groupId),
  ])

  const isMember = Boolean(membership?.length)
  const w = (windows ?? [])[0] as any
  // A member who is not in the group learns nothing about whether an auction is
  // even running. Same answer either way.
  if (!isMember || !w) {
    return { ok: false, reason: 'NO_WINDOW', message: 'Bidding is not open for this group right now.' }
  }

  const { data: bids } = await db.from('chit_bids')
    .select('member_id, amount, placed_at').eq('window_id', w.id)
  const all = ((bids ?? []) as any[]).map(b => ({
    memberId: b.member_id, amount: num(b.amount), placedAt: String(b.placed_at ?? ''),
  }))
  const highest = all.length ? Math.max(...all.map(b => b.amount)) : null

  const ctx = {
    window: {
      status: w.status as 'open' | 'closed' | 'cancelled',
      ceilingAmount: num(w.ceiling_amount),
      minIncrement: num(w.min_increment),
    },
    highestAmount: highest,
    isMember,
    alreadyWon: ((won ?? []) as any[]).some(a => a.winner_member_id === p.memberId),
  }

  // ── The rules, before the PIN ────────────────────────────────────────────
  // Checked in this order on purpose: a member who cannot bid at all should be
  // told so without being asked to prove who they are first, and a wrong bid
  // amount should not burn one of their five PIN attempts.
  const verdict = checkBid(p.amount, ctx)
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason!, message: verdict.message! }
  }

  // ── Then the PIN ─────────────────────────────────────────────────────────
  const pin = await checkPin(p.memberId, p.pin, now, db)
  if (!pin.ok) return { ok: false, reason: 'BAD_PIN', message: pin.reason }

  const amount = Math.round(Number(p.amount) * 100) / 100

  const { data: inserted, error } = await db.from('chit_bids').insert({
    user_id: w.user_id, group_id: p.groupId, window_id: w.id,
    member_id: p.memberId, month_number: w.month_number,
    amount, placed_at: now.toISOString(),
    session_id: p.sessionId, ip: p.ip ?? null, source: 'portal',
  }).select('id')

  if (error || !inserted?.length) {
    return { ok: false, reason: 'WRITE_FAILED', message: 'Your bid could not be recorded. Please try again.' }
  }

  // Two members can land bids in the same instant. Neither is lost — both rows
  // exist — but only one of them is leading, and we tell the truth about which.
  const { data: after } = await db.from('chit_bids')
    .select('member_id, amount, placed_at').eq('window_id', w.id)
  const sorted = ((after ?? []) as any[])
    .map(b => ({ memberId: b.member_id, amount: num(b.amount), placedAt: String(b.placed_at ?? '') }))
    .sort((a, b) => b.amount - a.amount || a.placedAt.localeCompare(b.placedAt))

  return {
    ok: true,
    amount,
    youAreLeading: sorted[0]?.memberId === p.memberId,
    bidId: inserted[0].id,
  }
}

/** Re-exported so the phone and the server quote the same floor. */
export { minimumAcceptableBid }
