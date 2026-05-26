import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BatchDetailClient from '@/components/recoverables/batch/BatchDetailClient'
import type { ImportBatch, RecoverableShipment, RecoverableAllocation } from '@/lib/recoverables/types'

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const [{ data: batch }, { data: shipments }, { data: allocations }] = await Promise.all([
    supabase
      .from('recoverable_import_batches')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('recoverable_shipments')
      .select('*')
      .eq('batch_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('recoverable_allocations')
      .select('*')
      .eq('batch_id', id)
      .order('supplier_name', { ascending: true }),
  ])

  if (!batch) notFound()

  return (
    <BatchDetailClient
      batch={batch as ImportBatch}
      shipments={(shipments ?? []) as RecoverableShipment[]}
      allocations={(allocations ?? []) as RecoverableAllocation[]}
    />
  )
}
