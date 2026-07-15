import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChitMembersClient from '@/components/chit/ChitMembersClient'
import type { ChitMember } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit members — Vaultr' }

export default async function ChitMembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.from('chit_members')
    .select('*').eq('user_id', user.id).order('name')

  return <ChitMembersClient initialMembers={(data ?? []) as ChitMember[]} />
}
