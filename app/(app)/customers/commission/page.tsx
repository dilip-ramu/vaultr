import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommissionClient from '@/components/commission/CommissionClient'
import type { Account } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CommissionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: orders },
    { data: customers },
    { data: accounts },
  ] = await Promise.all([
    supabase
      .from('commission_orders')
      .select('*, customer:customers(*), account:accounts(id,name)')
      .eq('user_id', user.id)
      .order('order_date', { ascending: false }),
    supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .eq('pays_commission', true)
      .order('name'),
    supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <CommissionClient
      initialOrders={orders ?? []}
      customers={customers ?? []}
      accounts={accounts ?? []}
    />
  )
}
