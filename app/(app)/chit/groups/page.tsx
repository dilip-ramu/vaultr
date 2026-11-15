import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess } from '@/lib/chit/access'
import { redirect } from 'next/navigation'
import ChitGroupsClient from '@/components/chit/ChitGroupsClient'
import type { ChitGroup } from '@/lib/chit/types'
import { monthlyInstallment } from '@/lib/chit/auction'
import {
  groupLedger,
  type AuctionRow as AuctionLike, type CollectionRow as CollectionLike, type CreditMoveRow,
} from '@/lib/chit/groupLedger'
import { pendingFromLedger, type PendingSummary } from '@/lib/chit/pending'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit groups — Vaultr' }

export default async function ChitGroupsPage() {
  const supabase = await createClient()
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  const uid = access.ownerId

  const today = new Date().toISOString().split('T')[0]

  const [{ data: groups }, { data: companies }, { data: gm }, { data: auctions }, { data: collections }, { data: creditMoves }] =
    await Promise.all([
      supabase.from('chit_groups').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name').eq('user_id', uid).order('name'),
      supabase.from('chit_group_members').select('group_id, member_id').eq('user_id', uid),
      supabase.from('chit_auctions').select('group_id, month_number, dividend_per_member, auction_date').eq('user_id', uid),
      supabase.from('chit_collections').select('group_id, member_id, month_number, amount').eq('user_id', uid),
      supabase.from('chit_credit_moves').select('member_id, from_group_id, to_group_id, to_month, amount').eq('user_id', uid),
    ])

  const membersByGroup: Record<string, string[]> = {}
  for (const row of (gm ?? []) as { group_id: string; member_id: string }[]) {
    (membersByGroup[row.group_id] ??= []).push(row.member_id)
  }
  const memberCounts: Record<string, number> = {}
  for (const [gid, ids] of Object.entries(membersByGroup)) memberCounts[gid] = ids.length

  // What each group is still waiting to collect, worked out from the SAME
  // ledger the collection screen and the statement read. Three screens, one
  // calculation — otherwise the list says a member has paid and the group
  // page says they have not.
  const allAuctions = (auctions ?? []) as AuctionLike[]
  const allCollections = (collections ?? []) as CollectionLike[]
  const moves = (creditMoves ?? []) as CreditMoveRow[]

  const pending: Record<string, PendingSummary> = {}
  for (const g of (groups ?? []) as ChitGroup[]) {
    const memberIds = membersByGroup[g.id] ?? []
    const groupAuctions = allAuctions.filter(a => a.group_id === g.id)
    const ledger = groupLedger({
      groupId: g.id,
      installment: monthlyInstallment({ chitValue: g.chit_value, members: g.members }),
      memberIds,
      auctions: groupAuctions,
      collections: allCollections.filter(c => c.group_id === g.id),
      creditMoves: moves,
      asOf: today,
    })
    pending[g.id] = pendingFromLedger(ledger, groupAuctions, memberIds, today)
  }

  return (
    <ChitGroupsClient
      initialGroups={(groups ?? []) as ChitGroup[]}
      companies={(companies ?? []) as { id: string; name: string }[]}
      memberCounts={memberCounts}
      pending={pending}
    />
  )
}
