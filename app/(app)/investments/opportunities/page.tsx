import { createClient } from '@/lib/supabase/server'
import OpportunitiesClient from '@/components/investments/OpportunitiesClient'
import type { OppRow } from '@/components/investments/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Opportunities — Vaultr' }

export default async function OpportunitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase
    .from('inv_opportunities').select('*').eq('user_id', user!.id).eq('dismissed', false)
    .order('created_at', { ascending: false }).limit(60)
  return <OpportunitiesClient opportunities={(data ?? []) as OppRow[]} />
}
