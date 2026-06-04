import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommissionWrapper from '@/components/commission/CommissionWrapper'
import type { CommissionOrder, CommissionStyle } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CommissionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  try {
    const [ordersResult, stylesResult, customersResult, accountsResult] = await Promise.all([
      supabase
        .from('commission_orders')
        .select('*, customer:customers(*), account:accounts(id,name)')
        .eq('user_id', user.id)
        .order('order_date', { ascending: false }),
      supabase
        .from('commission_styles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
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

    if (ordersResult.error) throw new Error(ordersResult.error.message)
    if (stylesResult.error)  throw new Error(stylesResult.error.message)

    // Merge styles into parent orders
    const stylesByOrder = new Map<string, CommissionStyle[]>()
    for (const style of (stylesResult.data ?? []) as CommissionStyle[]) {
      const list = stylesByOrder.get(style.order_id) ?? []
      list.push(style)
      stylesByOrder.set(style.order_id, list)
    }

    const orders: CommissionOrder[] = (ordersResult.data ?? []).map((o: CommissionOrder) => ({
      ...o,
      styles: stylesByOrder.get(o.id) ?? [],
    }))

    return (
      <CommissionWrapper
        initialOrders={orders}
        customers={(customersResult.data ?? []) as any}
        accounts={(accountsResult.data ?? []) as any}
      />
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 font-semibold mb-3">Commission page error</p>
        <p className="text-sm font-mono bg-red-50 text-red-700 rounded-xl px-4 py-3 break-all">{msg}</p>
      </div>
    )
  }
}
