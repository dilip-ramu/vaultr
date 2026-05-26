import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SupplierLedgerClient from '@/components/recoverables/supplier/SupplierLedgerClient'
import type { RecoverableAllocation, ImportBatch } from '@/lib/recoverables/types'
import type { Customer } from '@/lib/types'

export default async function SupplierLedgerPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  const supplierName = decodeURIComponent(name)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const [{ data: allocations }, { data: customers }] = await Promise.all([
    supabase
      .from('recoverable_allocations')
      .select('*')
      .eq('user_id', user.id)
      .eq('supplier_name', supplierName)
      .order('created_at', { ascending: false }),
    supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', supplierName),
  ])

  if (!allocations || allocations.length === 0) notFound()

  // Fetch the batches referenced by these allocations
  const batchIds = [...new Set((allocations ?? []).map((a: RecoverableAllocation) => a.batch_id))]
  const { data: batches } = await supabase
    .from('recoverable_import_batches')
    .select('*')
    .in('id', batchIds)

  const customer = (customers ?? [])[0] as Customer | undefined

  return (
    <SupplierLedgerClient
      supplierName={supplierName}
      allocations={(allocations ?? []) as RecoverableAllocation[]}
      customer={customer ?? null}
      batches={(batches ?? []) as ImportBatch[]}
    />
  )
}
