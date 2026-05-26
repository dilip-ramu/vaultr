import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CustomerLedgerClient from '@/components/recoverables/customer/CustomerLedgerClient'
import type { RecoverableAllocation, ImportBatch, RecoverableInvoice } from '@/lib/recoverables/types'
import type { Customer } from '@/lib/types'

interface ShipmentRef { id: string; reference: string; shipment_date: string | null }

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  const customerName = decodeURIComponent(name)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const [{ data: allocations }, { data: customers }] = await Promise.all([
    supabase
      .from('recoverable_allocations')
      .select('*')
      .eq('user_id', user.id)
      .eq('customer_name', customerName)
      .order('created_at', { ascending: false }),
    supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', customerName),
  ])

  if (!allocations || allocations.length === 0) notFound()

  const batchIds    = [...new Set((allocations as RecoverableAllocation[]).map(a => a.batch_id))]
  const shipmentIds = [...new Set((allocations as RecoverableAllocation[]).map(a => a.shipment_id))]

  const [{ data: batches }, { data: shipments }, { data: invoices }] = await Promise.all([
    supabase
      .from('recoverable_import_batches')
      .select('*')
      .in('id', batchIds),
    supabase
      .from('recoverable_shipments')
      .select('id, reference, shipment_date')
      .in('id', shipmentIds),
    supabase
      .from('recoverable_invoices')
      .select('*')
      .eq('user_id', user.id)
      .eq('customer_name', customerName)
      .order('invoice_date', { ascending: false }),
  ])

  const customer = ((customers ?? []) as Customer[])[0] ?? null

  return (
    <CustomerLedgerClient
      customerName={customerName}
      allocations={(allocations ?? []) as RecoverableAllocation[]}
      invoices={(invoices ?? []) as RecoverableInvoice[]}
      customer={customer}
      batches={(batches ?? []) as ImportBatch[]}
      shipments={(shipments ?? []) as ShipmentRef[]}
    />
  )
}
