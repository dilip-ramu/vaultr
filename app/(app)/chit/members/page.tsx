import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess } from '@/lib/chit/access'
import { redirect } from 'next/navigation'
import ChitMembersClient from '@/components/chit/ChitMembersClient'
import type { ChitMember } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit members — Vaultr' }

export default async function ChitMembersPage() {
  const supabase = await createClient()
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  const uid = access.ownerId

  const { data } = await supabase.from('chit_members')
    .select('*').eq('user_id', uid).order('name')

  return <ChitMembersClient initialMembers={(data ?? []) as ChitMember[]} />
}
