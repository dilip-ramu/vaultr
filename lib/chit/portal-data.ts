// Chit member portal — THE ONLY DOOR TO THE DATA. SERVER ONLY.
//
// READ THIS BEFORE CHANGING ANYTHING IN HERE.
//
// The portal serves people who are not users of this app. Everything they can
// see passes through this file, and nowhere else: no portal page, layout or API
// route may import a Supabase client of its own. That rule is the security
// design. It means the question "can a member see something they shouldn't?"
// has ONE place to look, not twenty.
//
// Three rules, and they are not negotiable:
//
//   1. EVERY exported function takes `memberId` as its FIRST argument and
//      filters on it. There is no function here that can return data for a
//      member the caller did not name.
//
//   2. `memberId` comes from the session cookie (lib/chit/portal-auth.ts) and
//      NEVER from a URL, a query string, a form field or a header. A group id
//      from the URL is fine — it is checked against the member's own
//      memberships before a single figure is read.
//
//   3. Fields are listed EXPLICITLY. No `select('*')`. chit_members holds
//      Aadhaar, PAN, nominees and guarantors; a wildcard here would put them on
//      a member's phone, and would do it silently the day someone adds a
//      column.
//
// Everything here is READ ONLY. Phase 1 gives members nothing to write. When
// bidding arrives it writes to its own table and still cannot touch
// chit_auctions, chit_collections or transactions.

import { createAdminClient } from '@/lib/supabase/admin'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Injectable so the scoping rules below can be TESTED. They are the security
 *  boundary of this feature; untested is not an option. */
export type Db = ReturnType<typeof createAdminClient>
const admin = (db?: Db): Db => db ?? createAdminClient()

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

// ── Shapes the portal is allowed to see ─────────────────────────────────────

export interface PortalMember {
  id: string
  name: string
  /** Masked. The member knows their own number; showing it in full only creates
   *  something worth stealing if a phone is left unlocked. */
  phoneMasked: string | null
}

export interface PortalGroupSummary {
  groupId: string
  name: string
  chitValue: number
  members: number
  tenureMonths: number
  monthlyInstallment: number
  startDate: string | null
  status: string
  slotNumber: number | null
  /** Their own position, not the group's. */
  totalDue: number
  totalPaid: number
  outstanding: number
  overdueCount: number
  nextDueDate: string | null
}

export interface PortalLedgerRow {
  monthNumber: number
  dueAmount: number
  dueDate: string | null
  status: 'PENDING' | 'OVERDUE' | 'PAID'
  paidAmount: number | null
  paidDate: string | null
}

export interface PortalAuctionRow {
  monthNumber: number
  auctionDate: string | null
  /** Name only. Never a phone number, never an id the member could use. */
  winnerName: string | null
  /** True when the member reading this is the winner. */
  wonByYou: boolean
  discount: number
  netPayout: number
  dividendPerMember: number
}

export interface PortalGroupDetail {
  group: PortalGroupSummary
  ledger: PortalLedgerRow[]
  auctions: PortalAuctionRow[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const d = String(phone).replace(/\D/g, '')
  if (d.length < 4) return null
  return `••••• ${d.slice(-4)}`
}

/**
 * The gate. Returns the member's group ids and slot numbers. Every function
 * that takes a groupId runs this first — a member asking for a group they are
 * not in gets nothing, not an error that confirms the group exists.
 */
async function membershipsOf(memberId: string, client?: Db): Promise<Map<string, number | null>> {
  const db = admin(client)
  const { data } = await db.from('chit_group_members')
    .select('group_id, slot_number')
    .eq('member_id', memberId)
  const out = new Map<string, number | null>()
  for (const r of (data ?? []) as any[]) out.set(r.group_id, r.slot_number ?? null)
  return out
}

// ── Public API ──────────────────────────────────────────────────────────────

/** The member's own name and masked phone. Nothing else from chit_members. */
export async function getMember(memberId: string, client?: Db): Promise<PortalMember | null> {
  const db = admin(client)
  const { data } = await db.from('chit_members')
    .select('id, name, phone')          // NOT *: aadhaar, pan, nominees stay out
    .eq('id', memberId).limit(1)
  const m = (data ?? [])[0] as any
  if (!m) return null
  return { id: m.id, name: m.name, phoneMasked: maskPhone(m.phone) }
}

/** Every group this member is in, with THEIR position in each. */
export async function getGroups(memberId: string, client?: Db): Promise<PortalGroupSummary[]> {
  const db = admin(client)
  const memberships = await membershipsOf(memberId, db)
  if (memberships.size === 0) return []
  const groupIds = [...memberships.keys()]

  const [{ data: groups }, { data: dues }, { data: paid }] = await Promise.all([
    db.from('chit_groups')
      .select('id, name, chit_value, members, commission_pct, start_date, status')
      .in('id', groupIds),
    db.from('chit_receivables')
      .select('group_id, month_number, amount, due_date, status')
      .eq('member_id', memberId).in('group_id', groupIds),
    db.from('chit_collections')
      .select('group_id, month_number, amount, paid_date')
      .eq('member_id', memberId).in('group_id', groupIds),
  ])

  const today = new Date(); today.setHours(0, 0, 0, 0)

  return ((groups ?? []) as any[]).map(g => {
    const myDues = ((dues ?? []) as any[]).filter(d => d.group_id === g.id)
    const myPaid = ((paid ?? []) as any[]).filter(p => p.group_id === g.id)
    const totalDue = myDues.reduce((s, d) => s + num(d.amount), 0)
    const totalPaid = myPaid.reduce((s, p) => s + num(p.amount), 0)
    const unpaid = myDues.filter(d => d.status !== 'PAID')
    const nextDue = unpaid
      .map(d => d.due_date).filter(Boolean).sort()[0] ?? null
    return {
      groupId: g.id,
      name: g.name,
      chitValue: num(g.chit_value),
      members: num(g.members),
      // In a chit the tenure is the member count, one auction a month.
      tenureMonths: num(g.members),
      monthlyInstallment: num(g.members) > 0 ? num(g.chit_value) / num(g.members) : 0,
      startDate: g.start_date ?? null,
      status: g.status,
      slotNumber: memberships.get(g.id) ?? null,
      totalDue, totalPaid,
      outstanding: Math.max(0, totalDue - totalPaid),
      overdueCount: unpaid.filter(d => d.due_date && new Date(d.due_date) < today).length,
      nextDueDate: nextDue,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * One group's passbook: the member's own month-by-month dues and receipts, plus
 * the auction result for each month.
 *
 * The auction rows are GROUP-level facts and they are shown deliberately: they
 * are how the monthly figure was arrived at, and a member who cannot check the
 * arithmetic has to take the foreman's word for it. What is NOT shown is any
 * other member's payment status, contact details or identifiers — only the
 * winner's NAME, which is announced to the whole group anyway.
 */
export async function getGroupDetail(
  memberId: string, groupId: string, client?: Db,
): Promise<PortalGroupDetail | null> {
  const db = admin(client)
  const memberships = await membershipsOf(memberId, db)
  if (!memberships.has(groupId)) return null      // not your group: nothing, no hint

  const groups = await getGroups(memberId, db)
  const group = groups.find(g => g.groupId === groupId)
  if (!group) return null
  const [{ data: dues }, { data: paid }, { data: auctions }] = await Promise.all([
    db.from('chit_receivables')
      .select('month_number, amount, due_date, status')
      .eq('member_id', memberId).eq('group_id', groupId)
      .order('month_number'),
    db.from('chit_collections')
      .select('month_number, amount, paid_date')
      .eq('member_id', memberId).eq('group_id', groupId)
      .order('month_number'),
    db.from('chit_auctions')
      .select('month_number, auction_date, winner_member_id, bid_amount, net_payout, dividend_per_member')
      .eq('group_id', groupId)
      .order('month_number'),
  ])

  const paidBy = new Map<number, any>()
  for (const p of (paid ?? []) as any[]) paidBy.set(num(p.month_number), p)

  const ledger: PortalLedgerRow[] = ((dues ?? []) as any[]).map(d => {
    const hit = paidBy.get(num(d.month_number))
    return {
      monthNumber: num(d.month_number),
      dueAmount: num(d.amount),
      dueDate: d.due_date ?? null,
      status: (d.status ?? 'PENDING') as PortalLedgerRow['status'],
      paidAmount: hit ? num(hit.amount) : null,
      paidDate: hit?.paid_date ?? null,
    }
  })

  // Resolve winner NAMES only, and only for winners of this group's auctions.
  const winnerIds = [...new Set(((auctions ?? []) as any[])
    .map(a => a.winner_member_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (winnerIds.length) {
    const { data: who } = await db.from('chit_members')
      .select('id, name').in('id', winnerIds)
    for (const w of (who ?? []) as any[]) names.set(w.id, w.name)
  }

  const auctionRows: PortalAuctionRow[] = ((auctions ?? []) as any[]).map(a => ({
    monthNumber: num(a.month_number),
    auctionDate: a.auction_date ?? null,
    winnerName: a.winner_member_id ? (names.get(a.winner_member_id) ?? null) : null,
    wonByYou: a.winner_member_id === memberId,
    discount: num(a.bid_amount),
    netPayout: num(a.net_payout),
    dividendPerMember: num(a.dividend_per_member),
  }))

  return { group, ledger, auctions: auctionRows }
}
