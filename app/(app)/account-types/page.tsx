import { createClient } from '@/lib/supabase/server'
import AccountTypesClient from '@/components/accounts/AccountTypesClient'

export default async function AccountTypesPage() {
  const supabase = await createClient()
  const { data: types } = await supabase
    .from('custom_account_types')
    .select('*')
    .order('created_at', { ascending: true })

  return <AccountTypesClient initialTypes={types ?? []} />
}
