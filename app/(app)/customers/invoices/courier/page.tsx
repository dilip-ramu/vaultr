// Courier invoice, start to finish.
//
// Import the sheet, then bill it. These were two unconnected screens: the
// import ended on a card offering "View Batch" and "Back to Dashboard" and no
// way at all to reach an invoice, so the job stopped halfway and you had to
// know where to go next.
//
// The import step is skippable on purpose. One CSV is usually billed to
// several customers, so the second invoice off a batch must not ask for the
// file again.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateInvoiceClient, {
  type AllocationRow, type PendingCustomer,
} from '@/components/recoverables/invoices/CreateInvoiceClient'
import FlowShell from '@/components/customers/invoices/FlowShell'
import CourierImportStep from '@/components/customers/invoices/CourierImportStep'
import { resolveStep } from '@/lib/customers/invoiceFlows'

export const dynamic = 'force-dynamic'

interface RawAlloc {
  id: string
  pieces: number
  base_cost: number
  shipment_id: string
  batch_id: string
  customer_name: string
  customer_id: string | null
  shipment: { id: string; reference: string; shipment_date: string | null } | null
  batch: { id: string; name: string; import_date: string | null } | null
}

export default async function CourierFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; customer?: string }>
}) {
  const { step: rawStep, customer } = await searchParams
  const step = resolveStep('courier', rawStep)
  const customerName = customer ? decodeURIComponent(customer) : null
  const query: Record<string, string> = customer ? { customer } : {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // How much is already waiting to be billed. The import step shows this so
  // somebody who does not need to import can see there is nothing to do here
  // and step straight over it.
  const { data: pendingRaw } = await supabase
    .from('recoverable_allocations')
    .select('customer_name, customer_id, recoverable_amount')
    .eq('user_id', user.id)
    .eq('status', 'pending')

  const customerMap = new Map<string, { customerId: string | null; count: number; amount: number }>()
  for (const a of pendingRaw ?? []) {
    const key = a.customer_name as string
    const entry = customerMap.get(key) ?? { customerId: a.customer_id as string | null, count: 0, amount: 0 }
    entry.count++
    entry.amount += Number(a.recoverable_amount)
    customerMap.set(key, entry)
  }
  const pendingCustomers: PendingCustomer[] = Array.from(customerMap.entries())
    .map(([name, v]) => ({
      customerName: name,
      customerId: v.customerId,
      allocationCount: v.count,
      pendingAmount: Math.round(v.amount * 100) / 100,
    }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount)

  if (step === 'import') {
    return (
      <FlowShell flow="courier" step="import" query={query}>
        <CourierImportStep
          pendingCount={pendingCustomers.reduce((t, c) => t + c.allocationCount, 0)}
          pendingCustomers={pendingCustomers.length}
        />
      </FlowShell>
    )
  }

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, is_default, cgst_rate, sgst_rate, hsn_sac')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  const defaultCompany = (companies ?? []).find(c => c.is_default) ?? (companies ?? [])[0] ?? null

  let initialAllocations: AllocationRow[] = []
  if (customerName) {
    const { data: rawAllocs } = await supabase
      .from('recoverable_allocations')
      .select(`
        id, pieces, base_cost, shipment_id, batch_id, customer_name, customer_id,
        shipment:recoverable_shipments(id, reference, shipment_date),
        batch:recoverable_import_batches(id, name, import_date)
      `)
      .eq('user_id', user.id)
      .eq('customer_name', customerName)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    initialAllocations = (rawAllocs ?? []).map((a: unknown) => {
      const r = a as RawAlloc
      return {
        id: r.id, pieces: r.pieces, base_cost: r.base_cost,
        shipment_id: r.shipment_id, batch_id: r.batch_id,
        customer_name: r.customer_name, customer_id: r.customer_id,
        awb: r.shipment?.reference ?? '—',
        shipmentDate: r.shipment?.shipment_date ?? null,
        batchName: r.batch?.name ?? 'Unknown Batch',
        batchDate: r.batch?.import_date ?? null,
      }
    })
  }

  return (
    <FlowShell flow="courier" step="build" query={query}>
      <CreateInvoiceClient
        initialCustomerName={customerName}
        pendingCustomers={pendingCustomers}
        initialAllocations={initialAllocations}
        cgstRate={Number(defaultCompany?.cgst_rate ?? 9)}
        sgstRate={Number(defaultCompany?.sgst_rate ?? 9)}
        hsnSac={(defaultCompany?.hsn_sac as string | null) ?? '996812'}
        companies={(companies ?? []).map(c => ({
          id: c.id, name: c.name, is_default: c.is_default,
          cgst_rate: Number(c.cgst_rate), sgst_rate: Number(c.sgst_rate),
          hsn_sac: (c.hsn_sac as string | null) ?? '996812',
        }))}
      />
    </FlowShell>
  )
}
