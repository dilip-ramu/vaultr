import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ChitMemberDetail from '@/components/chit/ChitMemberDetail'
import { summariseMember } from '@/lib/chit/memberSummary'
import type { ChitMember } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('chit_members').select('name').eq('id', id).maybeSingle()
  return { title: `${(data as { name?: string } | null)?.name ?? 'Member'} — Chit` }
}

export default async function ChitMemberPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const uid = user.id

  const { data: member } = await supabase.from('chit_members')
    .select('*').eq('id', id).eq('user_id', uid).maybeSingle()
  if (!member) notFound()

  // Everything the member's position is computed from. Fetched in one round so
  // the page cannot show a half-updated picture.
  const [
    { data: memberships }, { data: groups }, { data: dues },
    { data: payments }, { data: auctions }, { data: referrer }, { data: referred },
  ] = await Promise.all([
    supabase.from('chit_group_members').select('group_id, member_id, slot_number')
      .eq('user_id', uid).eq('member_id', id),
    supabase.from('chit_groups').select('id, name, chit_value, members, status, start_date')
      .eq('user_id', uid),
    supabase.from('chit_receivables').select('group_id, member_id, month_number, amount, due_date, status')
      .eq('user_id', uid).eq('member_id', id),
    supabase.from('chit_collections').select('group_id, member_id, month_number, amount, paid_date')
      .eq('user_id', uid).eq('member_id', id),
    supabase.from('chit_auctions')
      .select('group_id, month_number, winner_member_id, bid_amount, net_payout, dividend_per_member, paid_at')
      .eq('user_id', uid),
    (member as ChitMember).referred_by_member_id
      ? supabase.from('chit_members').select('id, name, member_code')
          .eq('id', (member as ChitMember).referred_by_member_id as string).eq('user_id', uid).maybeSingle()
      : Promise.resolve({ data: null }),
    // Who this member introduced. The reverse of the link, which is the
    // direction people actually ask about.
    supabase.from('chit_members').select('id, name, member_code')
      .eq('user_id', uid).eq('referred_by_member_id', id).order('name'),
  ])

  // Auctions are fetched for every group, then narrowed to this member's, so a
  // member in three chits does not trigger three round trips.
  const myGroupIds = new Set((memberships ?? []).map((m: { group_id: string }) => m.group_id))
  const summary = summariseMember({
    memberId: id,
    memberships: (memberships ?? []) as never,
    groups: (groups ?? []).filter((g: { id: string }) => myGroupIds.has(g.id)) as never,
    dues: (dues ?? []) as never,
    payments: (payments ?? []) as never,
    auctions: (auctions ?? []).filter((a: { group_id: string }) => myGroupIds.has(a.group_id)) as never,
  })

  return (
    <ChitMemberDetail
      member={member as ChitMember}
      summary={summary}
      referrer={(referrer as { id: string; name: string; member_code: string | null } | null) ?? null}
      referred={(referred ?? []) as { id: string; name: string; member_code: string | null }[]}
    />
  )
}
