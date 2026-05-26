import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RecoverablesDashboardClient from '@/components/recoverables/dashboard/RecoverablesDashboardClient'
import { aggregateSupplierBalances, calcDashboardStats } from '@/lib/recoverables/engine/balance'
import type { ImportBatch, RecoverableAllocation } from '@/lib/recoverables/types'

export default async function RecoverablesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: batches }, { data: allAllocations }] = await Promise.all([
    supabase
      .from('recoverable_import_batches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('recoverable_allocations')
      .select('*')
      .eq('user_id', user.id),
  ])

  const safeBatches     = (batches     ?? []) as ImportBatch[]
  const safeAllocations = (allAllocations ?? []) as RecoverableAllocation[]

  // Use the most common currency from batches, default to INR
  const currency = safeBatches[0]?.currency ?? 'INR'

  const pendingAllocations = safeAllocations.filter(a => a.status === 'pending')
  const balances = aggregateSupplierBalances(pendingAllocations)
  const stats    = calcDashboardStats(safeBatches, safeAllocations, currency)

  return (
    <RecoverablesDashboardClient
      stats={stats}
      batches={safeBatches}
      balances={balances}
      currency={currency}
    />
  )
}
