import { createClient } from '@/lib/supabase/server'
import UsersClient from '@/components/users/UsersClient'

export const dynamic = 'force-dynamic'

export default async function SetupUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: holders } = await supabase
    .from('account_holders')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: true })

  return <UsersClient initialHolders={holders ?? []} />
}
