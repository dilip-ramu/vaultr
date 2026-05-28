import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TDSClient from '@/components/recoverables/tds/TDSClient'

export const dynamic = 'force-dynamic'

export default async function TDSPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: entries } = await supabase
    .from('recoverable_tds_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('payment_date', { ascending: false })

  return <TDSClient entries={entries ?? []} />
}
