// A member's credit, and moving it between their chits.
//
// Credit is never stored. It is the difference between what a member has paid
// and what has fallen due, worked out from the collection rows themselves — a
// stored balance is a number that can drift from the payments it came from, and
// when it does nobody can tell which one is lying.
//
// What IS stored is a MOVE: this much of this member's credit, out of that
// chit, into this one, against that month. One row, so it cannot be spent
// twice, and the owner chooses the source rather than the app silently taking
// from whichever chit happens to be first.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, CAN, forbidden } from '@/lib/chit/access'
import { monthlyInstallment, monthlyDue } from '@/lib/chit/auction'
import { memberLedger, creditPool, checkCreditMove, type GroupPosition } from '@/lib/chit/memberLedger'
import type { ChitGroup } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Every group this member is in, and where they stand in each.
 *
 * Computed, not read. The same arithmetic the collection screens use, so the
 * figure offered here and the figure charged there cannot disagree.
 */
async function positionsFor(
  supabase: any, owner: string, memberId: string,
): Promise<{ positions: GroupPosition[]; byGroup: Map<string, ReturnType<typeof memberLedger>> }> {
  const [{ data: memberships }, { data: groups }, { data: auctions }, { data: collections }, { data: moves }] =
    await Promise.all([
      supabase.from('chit_group_members').select('group_id').eq('user_id', owner).eq('member_id', memberId),
      supabase.from('chit_groups').select('*').eq('user_id', owner),
      supabase.from('chit_auctions').select('group_id, month_number, auction_date, dividend_per_member').eq('user_id', owner),
      supabase.from('chit_collections').select('group_id, month_number, amount').eq('user_id', owner).eq('member_id', memberId),
      supabase.from('chit_credit_moves').select('from_group_id, to_group_id, to_month, amount').eq('user_id', owner).eq('member_id', memberId),
    ])

  const groupById = new Map<string, ChitGroup>(((groups ?? []) as ChitGroup[]).map(g => [g.id, g]))
  const mine = ((memberships ?? []) as { group_id: string }[]).map(m => m.group_id)

  const positions: GroupPosition[] = []
  const byGroup = new Map<string, ReturnType<typeof memberLedger>>()

  for (const gid of mine) {
    const g = groupById.get(gid)
    if (!g) continue
    const installment = monthlyInstallment({ chitValue: g.chit_value, members: g.members })

    const dues = ((auctions ?? []) as any[])
      .filter(a => a.group_id === gid)
      .map(a => ({ month: Number(a.month_number), due: monthlyDue(installment, Number(a.dividend_per_member) || 0) }))

    const payments = ((collections ?? []) as any[])
      .filter(c => c.group_id === gid)
      .map(c => ({ month: Number(c.month_number), amount: Number(c.amount) }))

    const creditIn = ((moves ?? []) as any[])
      .filter(m => m.to_group_id === gid)
      .map(m => ({ month: Number(m.to_month), amount: Number(m.amount) }))

    const creditOut = ((moves ?? []) as any[])
      .filter(m => m.from_group_id === gid)
      .reduce((t, m) => t + Number(m.amount), 0)

    const ledger = memberLedger(dues, payments, { creditIn, creditOut })
    byGroup.set(gid, ledger)
    positions.push({ groupId: gid, groupName: g.name, balance: ledger.balance })
  }

  return { positions, byGroup }
}

/** GET ?memberId= — what this member is holding, and where. */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const memberId = req.nextUrl.searchParams.get('memberId') ?? ''
  if (!memberId) return NextResponse.json({ error: 'memberId is required' }, { status: 400 })

  const { positions, byGroup } = await positionsFor(supabase, access.ownerId, memberId)
  return NextResponse.json({
    pool: creditPool(positions),
    positions,
    groups: positions.map(p => ({
      ...p,
      months: byGroup.get(p.groupId)?.months ?? [],
    })),
  })
}

/** POST { memberId, fromGroupId, toGroupId, toMonth, amount, note } */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.recordCollection(access.role)) {
    return NextResponse.json({ error: forbidden('move a member’s credit', access.role) }, { status: 403 })
  }
  const owner = access.ownerId

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const memberId = String(body.memberId ?? '')
  const fromGroupId = String(body.fromGroupId ?? '')
  const toGroupId = String(body.toGroupId ?? '')
  const toMonth = Number(body.toMonth)
  const amount = Math.round(Number(body.amount) * 100) / 100
  if (!memberId || !fromGroupId || !toGroupId || !Number.isInteger(toMonth) || toMonth < 1) {
    return NextResponse.json({ error: 'memberId, fromGroupId, toGroupId and toMonth are required' }, { status: 400 })
  }

  // Checked against what the member actually has RIGHT NOW, not against what
  // the screen was showing when it was opened. Two tabs, or two people, must
  // not be able to spend the same credit twice.
  const { positions } = await positionsFor(supabase, owner, memberId)
  const verdict = checkCreditMove(creditPool(positions), fromGroupId, toGroupId, amount)
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 })

  const { data, error } = await supabase.from('chit_credit_moves').insert({
    user_id: owner, member_id: memberId,
    from_group_id: fromGroupId, to_group_id: toGroupId, to_month: toMonth,
    amount, note: (body.note as string)?.trim() || null,
    recorded_by_user_id: access.actorId,
    recorded_by_name: access.actorName,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, move: data })
}

/** DELETE ?id= — undo a move. The amount cannot be edited, only withdrawn. */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.recordCollection(access.role)) {
    return NextResponse.json({ error: forbidden('undo a credit move', access.role) }, { status: 403 })
  }
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabase.from('chit_credit_moves')
    .delete().eq('id', id).eq('user_id', access.ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
