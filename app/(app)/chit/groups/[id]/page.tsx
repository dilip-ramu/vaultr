import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ChitGroupDetail from '@/components/chit/ChitGroupDetail'
import type { ChitGroup, ChitGroupMember, ChitAuction, ChitCollection, ChitMember } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('chit_groups').select('name').eq('id', id).maybeSingle()
  return { title: `${(data as { name?: string } | null)?.name ?? 'Chit group'} — Vaultr` }
}

export default async function ChitGroupPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const uid = user.id

  const { data: group } = await supabase.from('chit_groups')
    .select('*').eq('id', id).eq('user_id', uid).maybeSingle()
  if (!group) notFound()

  const [
    { data: groupMembers },
    { data: allMembers },
    { data: auctions },
    { data: collections },
    { data: companyAccounts },
    { data: companies },
  ] = await Promise.all([
    supabase.from('chit_group_members').select('*, member:chit_members(*)')
      .eq('user_id', uid).eq('group_id', id).order('slot_number', { nullsFirst: false }),
    supabase.from('chit_members').select('*').eq('user_id', uid).eq('is_active', true).order('name'),
    supabase.from('chit_auctions').select('*').eq('user_id', uid).eq('group_id', id).order('month_number'),
    supabase.from('chit_collections').select('*, member:chit_members(name)').eq('user_id', uid).eq('group_id', id),
    // Accounts belonging to the group's company (or all, if no company set) — the
    // ones a collection/payout can be posted to.
    supabase.from('accounts').select('id, name, type, company_id')
      .eq('user_id', uid).eq('is_active', true),
    supabase.from('companies').select('id, name').eq('user_id', uid).order('name'),
  ])

  const accounts = ((companyAccounts ?? []) as { id: string; name: string; type: string; company_id: string | null }[])
    .filter(a => !group.company_id || a.company_id === group.company_id || a.company_id === null)

  return (
    <ChitGroupDetail
      group={group as ChitGroup}
      groupMembers={(groupMembers ?? []) as ChitGroupMember[]}
      allMembers={(allMembers ?? []) as ChitMember[]}
      auctions={(auctions ?? []) as ChitAuction[]}
      collections={(collections ?? []) as (ChitCollection & { member?: { name: string } })[]}
      accounts={accounts}
      companies={(companies ?? []) as { id: string; name: string }[]}
    />
  )
}
