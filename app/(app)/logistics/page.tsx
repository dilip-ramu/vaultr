import { createClient } from '@/lib/supabase/server'
import LogisticsOverviewClient from '@/components/logistics/LogisticsOverviewClient'
import type { CourierInvoice } from '@/lib/logistics/types'

export const dynamic = 'force-dynamic'

export default async function LogisticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: invoices },
    { data: monthlyInvoices },
  ] = await Promise.all([
    supabase
      .from('courier_invoices')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('courier_invoices')
      .select('total_amount, status')
      .eq('user_id', user!.id)
      .gte('invoice_date', startOfMonth),
  ])

  const all = invoices ?? []
  const pendingCount = all.filter(i => i.status === 'pending' || i.status === 'partial').length
  const thisMonthSpend = (monthlyInvoices ?? []).reduce((s, i) => s + (i.total_amount ?? 0), 0)

  return (
    <LogisticsOverviewClient
      invoices={all as CourierInvoice[]}
      pendingCount={pendingCount}
      thisMonthSpend={thisMonthSpend}
      totalCount={all.length}
    />
  )
}
