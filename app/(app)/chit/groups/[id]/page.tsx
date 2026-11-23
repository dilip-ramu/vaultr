import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, ledgerClient } from '@/lib/chit/access'
import { redirect, notFound } from 'next/navigation'
import ChitGroupDetail from '@/components/chit/ChitGroupDetail'
import type { ChitGroup, ChitGroupMember, ChitAuction, ChitCollection, ChitMember } from '@/lib/chit/types'
import { isChitAccount } from '@/lib/chit/account'
import type { CreditMoveRow } from '@/lib/chit/groupLedger'

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
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  // Whose books: the owner, or the owner who granted this staff member access.
  const uid = access.ownerId
  const ledger = await ledgerClient(access)

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
    { data: creditMoves },
    { data: messageLog },
  ] = await Promise.all([
    supabase.from('chit_group_members').select('*, member:chit_members(*)')
      .eq('user_id', uid).eq('group_id', id).order('slot_number', { nullsFirst: false }),
    supabase.from('chit_members').select('*').eq('user_id', uid).eq('is_active', true).order('name'),
    supabase.from('chit_auctions').select('*').eq('user_id', uid).eq('group_id', id).order('month_number'),
    supabase.from('chit_collections').select('*, member:chit_members(name)').eq('user_id', uid).eq('group_id', id),
    // Accounts belonging to the group's company (or all, if no company set) — the
    // ones a collection/payout can be posted to.
    // accounts and companies stay OWNER-ONLY under RLS — the general ledger is
    // not part of the chit grant. A staff member still needs to see which
    // account a collection lands in, so these two reads are made on the owner's
    // behalf with an elevated client, scoped to their id and nothing else.
    ledger.from('accounts').select('id, name, type, company_id')
      .eq('user_id', uid).eq('is_active', true),
    ledger.from('companies').select('id, name').eq('user_id', uid).order('name'),
    // Credit these members carry in from, or have sent to, their other chits.
    supabase.from('chit_credit_moves')
      .select('member_id, from_group_id, to_group_id, to_month, amount')
      .eq('user_id', uid),
    // What the daily reminder run has tried for this group. Failures and
    // pending rows included: a log of successes only cannot answer 'nobody
    // told me'.
    supabase.from('chit_message_log')
      .select('id, member_id, step_key, kind, channel, status, error, sent_at, member:chit_members(name)')
      .eq('user_id', uid).eq('group_id', id)
      .order('sent_at', { ascending: false }).limit(100),
  ])

  const accounts = ((companyAccounts ?? []) as { id: string; name: string; type: string; company_id: string | null }[])
    // The chit account is always offered, whichever company it is filed under.
    // Filtering it out by company is how collections ended up posted somewhere
    // the statement does not read.
    .filter(a => isChitAccount(a.name)
      || !group.company_id || a.company_id === group.company_id || a.company_id === null)

  return (
    <ChitGroupDetail
      group={group as ChitGroup}
      groupMembers={(groupMembers ?? []) as ChitGroupMember[]}
      allMembers={(allMembers ?? []) as ChitMember[]}
      auctions={(auctions ?? []) as ChitAuction[]}
      collections={(collections ?? []) as (ChitCollection & { member?: { name: string } })[]}
      messageLog={((messageLog ?? []) as Record<string, unknown>[]).map(r => ({
        id: String(r.id),
        member_id: String(r.member_id),
        member_name: ((r.member as { name?: string } | null)?.name) ?? null,
        step_key: String(r.step_key),
        kind: String(r.kind) as 'notice' | 'dues' | 'winner' | 'reminder',
        channel: String(r.channel ?? 'link'),
        status: String(r.status ?? 'sent'),
        error: (r.error as string | null) ?? null,
        sent_at: String(r.sent_at ?? ''),
      }))}
      whatsappLive={Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN)}
      accounts={accounts}
      companies={(companies ?? []) as { id: string; name: string }[]}
      creditMoves={(creditMoves ?? []) as CreditMoveRow[]}
    />
  )
}
