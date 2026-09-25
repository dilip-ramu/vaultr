import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess } from '@/lib/chit/access'
import { redirect } from 'next/navigation'
import ChitGroupsClient from '@/components/chit/ChitGroupsClient'
import type { ChitGroup } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit groups — Vaultr' }

export default async function ChitGroupsPage() {
  const supabase = await createClient()
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  const uid = access.ownerId

  const [{ data: groups }, { data: companies }, { data: counts }] = await Promise.all([
    supabase.from('chit_groups').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').eq('user_id', uid).order('name'),
    supabase.from('chit_group_members').select('group_id').eq('user_id', uid),
  ])

  // How many members are in each group, for the list.
  const memberCounts: Record<string, number> = {}
  for (const row of (counts ?? []) as { group_id: string }[]) {
    memberCounts[row.group_id] = (memberCounts[row.group_id] ?? 0) + 1
  }

  return (
    <ChitGroupsClient
      initialGroups={(groups ?? []) as ChitGroup[]}
      companies={(companies ?? []) as { id: string; name: string }[]}
      memberCounts={memberCounts}
    />
  )
}
