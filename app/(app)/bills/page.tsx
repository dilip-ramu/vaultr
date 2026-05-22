import { createClient } from '@/lib/supabase/server'
import BillsClient from '@/components/bills/BillsClient'

export default async function BillsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: bills }, { data: accounts }, { data: categories }, { data: customers }] = await Promise.all([
    supabase
      .from('bills')
      .select(`*, account:accounts(id,name,color,type), category:categories(id,name,icon,color), customer:customers(id,name,email,phone)`)
      .eq('user_id', user!.id)
      .order('due_date', { ascending: true }),
    supabase.from('account_balances').select('id,name,color,type').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('categories').select('id,name,icon,color,type').eq('user_id', user!.id).order('name'),
    supabase.from('customers').select('*').eq('user_id', user!.id).order('name'),
  ])

  return (
    <BillsClient
      initialBills={bills ?? []}
      accounts={accounts ?? []}
      categories={categories ?? []}
      customers={customers ?? []}
    />
  )
}
