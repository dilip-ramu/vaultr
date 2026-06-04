import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { CommissionOrder, CommissionStyle } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CommissionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  try {
    const [ordersResult, stylesResult] = await Promise.all([
      supabase
        .from('commission_orders')
        .select('*, customer:customers(*), account:accounts(id,name)')
        .eq('user_id', user.id)
        .order('order_date', { ascending: false }),
      supabase
        .from('commission_styles')
        .select('*')
        .eq('user_id', user.id),
    ])

    if (ordersResult.error) throw new Error('orders: ' + ordersResult.error.message)
    if (stylesResult.error)  throw new Error('styles: '  + stylesResult.error.message)

    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <p className="font-semibold">Data fetch OK</p>
        <p className="text-sm text-gray-500 mt-1">{ordersResult.data.length} orders · {stylesResult.data.length} styles</p>
      </div>
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <p className="text-red-500 font-semibold">Error</p>
        <p className="text-sm font-mono bg-red-50 text-red-700 rounded-xl px-4 py-3 mt-2 break-all">{msg}</p>
      </div>
    )
  }
}
