import { createClient } from '@/lib/supabase/server'
import AccountTypesClient from '@/components/accounts/AccountTypesClient'

export const dynamic = 'force-dynamic'

export default async function AccountTypesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: types }, { data: overrides }] = await Promise.all([
    supabase
      .from('custom_account_types')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('builtin_account_type_overrides')
      .select('*')
      .eq('user_id', user!.id),
  ])

  return <AccountTypesClient initialTypes={types ?? []} initialOverrides={overrides ?? []} />
}
