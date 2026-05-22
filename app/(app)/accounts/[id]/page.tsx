import { createClient } from '@/lib/supabase/server'
import BillsClient from '@/components/bills/BillsClient'

export default async function BillsPage() {
  const supabase = await createClient()

  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .order('due_date', { ascending: true })

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id,name,color,type')

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .order('name')

  return (
    <BillsClient
      initialBills={bills ?? []}
      accounts={(accounts as any) ?? []}
      categories={categories ?? []}
      customers={customers ?? []}
    />
  )
}