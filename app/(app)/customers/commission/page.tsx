import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommissionClient from '@/components/commission/CommissionClient'

export const dynamic = 'force-dynamic'

export default async function CommissionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [ordersResult, customersResult, accountsResult] = await Promise.all([
    supabase
      .from('commission_orders')
      .select('*, customer:customers(*), account:accounts(id,name), styles:commission_styles(*)')
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

  if (ordersResult.error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-red-500 font-semibold mb-2">Database error</p>
        <p className="text-sm text-gray-500 font-mono">{ordersResult.error.message}</p>
        <p className="text-xs text-gray-400 mt-4">
          Run this in your Supabase SQL editor:<br />
          <code className="bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
            GRANT ALL ON commission_orders TO authenticated;<br />
            GRANT ALL ON commission_styles TO authenticated;
          </code>
        </p>
      </div>
    )
  }

  return (
    <CommissionClient
      initialOrders={ordersResult.data ?? []}
      customers={customersResult.data ?? []}
      accounts={accountsResult.data ?? []}
    />
  )
}
