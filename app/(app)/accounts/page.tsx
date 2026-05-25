import { createClient } from '@/lib/supabase/server'
import AccountsClient from '@/components/accounts/AccountsClient'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accounts }, { data: overrides }] = await Promise.all([
    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('builtin_account_type_overrides')
      .select('*')
      .eq('user_id', user!.id),
  ])

  return <AccountsClient initialAccounts={accounts ?? []} builtinOverrides={overrides ?? []} />
}
