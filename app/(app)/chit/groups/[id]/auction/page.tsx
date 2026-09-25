// The auction room.
//
// A chit auction is called out loud in a room, fast, with people shouting
// numbers. The old flow — pick a member from a dropdown, type a figure, press
// a button, repeat — was built for somebody sitting calmly at a desk. Nobody
// running an auction is sitting calmly at a desk.
//
// So: everyone eligible on screen at once, a box beside each name, type and
// press Enter. The people who cannot bid are shown too, greyed out with the
// month they won, because "why is Ramesh not on the list" is a question worth
// answering before it is asked.

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import { monthlyInstallment, numberOfMonths } from '@/lib/chit/auction'
import AuctionRoom from '@/components/chit/AuctionRoom'
import type { ChitGroup } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Auction room — Inex' }

export default async function AuctionRoomPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  if (!CAN.runAuction(access.role)) redirect(`/chit/groups/${id}`)

  const supabase = await createClient()
  const uid = access.ownerId

  const { data: groupRow } = await supabase.from('chit_groups')
    .select('*').eq('id', id).eq('user_id', uid).maybeSingle()
  if (!groupRow) notFound()
  const group = groupRow as ChitGroup

  const [{ data: roster }, { data: auctions }] = await Promise.all([
    supabase.from('chit_group_members')
      .select('member_id, slot_number, member:chit_members(id, name, member_code)')
      .eq('user_id', uid).eq('group_id', id),
    supabase.from('chit_auctions')
      .select('month_number, winner_member_id')
      .eq('user_id', uid).eq('group_id', id),
  ])

  // Who has already taken the pot, and in which month — so the screen can say
  // why somebody is not biddable rather than just leaving them out.
  const wonMonth: Record<string, number> = {}
  for (const a of (auctions ?? []) as { month_number: number; winner_member_id: string | null }[]) {
    if (a.winner_member_id) wonMonth[a.winner_member_id] = a.month_number
  }

  const members = ((roster ?? []) as {
    member_id: string; slot_number: number | null
    member: { id: string; name: string; member_code: string | null } | { id: string; name: string; member_code: string | null }[] | null
  }[]).map(r => {
    const m = Array.isArray(r.member) ? r.member[0] : r.member
    return {
      id: r.member_id,
      name: m?.name ?? 'Member',
      code: m?.member_code ?? null,
      slot: r.slot_number,
      wonMonth: wonMonth[r.member_id] ?? null,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  // The first month with no auction recorded. Same rule as the group page.
  const months = numberOfMonths({ members: group.members, model: group.commission_model })
  const done = new Set((auctions ?? []).map((a: { month_number: number }) => a.month_number))
  let nextMonth: number | null = null
  for (let m = 1; m <= months; m++) if (!done.has(m)) { nextMonth = m; break }

  return (
    <AuctionRoom
      groupId={group.id}
      groupName={group.name}
      chitValue={Number(group.chit_value)}
      installment={monthlyInstallment({ chitValue: group.chit_value, members: group.members })}
      members={members}
      nextMonth={nextMonth}
    />
  )
}
