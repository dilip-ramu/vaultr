import { createClient } from '@/lib/supabase/server'
import JournalClient from '@/components/investments/JournalClient'
import type { RecRow } from '@/components/investments/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Journal — Vaultr' }

export default async function JournalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase
    .from('inv_recommendations').select('*').eq('user_id', user!.id)
    .order('created_at', { ascending: false }).limit(300)
  return <JournalClient recs={(data ?? []) as RecRow[]} />
}
