import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommissionClient from '@/components/commission/CommissionClient'

export const dynamic = 'force-dynamic'

export default async function CommissionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  try {
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
      throw new Error(ordersResult.error.message)
    }

    return (
      <CommissionClient
        initialOrders={ordersResult.data ?? []}
        customers={customersResult.data ?? []}
        accounts={accountsResult.data ?? []}
      />
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 font-semibold text-base mb-3">Commission page error</p>
        <p className="text-sm font-mono bg-red-50 text-red-700 rounded-xl px-4 py-3 text-left break-all mb-6">{msg}</p>
        <p className="text-sm text-gray-500 mb-2">If this is a permission or missing-table error, run in Supabase SQL editor:</p>
        <pre className="text-xs bg-gray-100 rounded-xl px-4 py-3 text-left text-gray-700 whitespace-pre-wrap">
{`GRANT ALL ON commission_orders TO authenticated;
GRANT ALL ON commission_styles TO authenticated;`}
        </pre>
      </div>
    )
  }
}
