import { createClient } from '@/lib/supabase/server'
import CustomersClient from '@/components/customers/CustomersClient'

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user!.id)
    .order('name')

  return <CustomersClient initialCustomers={customers ?? []} />
}
