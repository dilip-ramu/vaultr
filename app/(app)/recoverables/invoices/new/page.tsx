import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateInvoiceClient, {
  type AllocationRow,
  type PendingCustomer,
} from '@/components/recoverables/invoices/CreateInvoiceClient'

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

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  const customerName = customer ? decodeURIComponent(customer) : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch pending allocation summary for the customer picker
  const { data: pendingRaw } = await supabase
    .from('recoverable_allocations')
    .select('customer_name, customer_id, recoverable_amount')
    .eq('user_id', user.id)
    .eq('status', 'pending')

  const customerMap = new Map<string, { customerId: string | null; count: number; amount: number }>()
  for (const a of pendingRaw ?? []) {
    const key   = a.customer_name as string
    const entry = customerMap.get(key) ?? { customerId: a.customer_id as string | null, count: 0, amount: 0 }
    entry.count++
    entry.amount += Number(a.recoverable_amount)
    customerMap.set(key, entry)
  }

  const pendingCustomers: PendingCustomer[] = Array.from(customerMap.entries())
    .map(([name, v]) => ({
      customerName:    name,
      customerId:      v.customerId,
      allocationCount: v.count,
      pendingAmount:   Math.round(v.amount * 100) / 100,
    }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount)

  // Companies — used for the picker. GST rates come from the chosen company
  // (defaulting to the user's default company).
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, is_default, cgst_rate, sgst_rate')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  const defaultCompany = (companies ?? []).find(c => c.is_default) ?? (companies ?? [])[0] ?? null
  const cgstRate = Number(defaultCompany?.cgst_rate ?? 9)
  const sgstRate = Number(defaultCompany?.sgst_rate ?? 9)

  // If customer specified, load their pending allocations with shipment + batch info
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
        id:           r.id,
        pieces:       r.pieces,
        base_cost:    r.base_cost,
        shipment_id:  r.shipment_id,
        batch_id:     r.batch_id,
        customer_name: r.customer_name,
        customer_id:  r.customer_id,
        awb:          r.shipment?.reference ?? '—',
        shipmentDate: r.shipment?.shipment_date ?? null,
        batchName:    r.batch?.name ?? 'Unknown Batch',
        batchDate:    r.batch?.import_date ?? null,
      }
    })
  }

  return (
    <CreateInvoiceClient
      initialCustomerName={customerName}
      pendingCustomers={pendingCustomers}
      initialAllocations={initialAllocations}
      cgstRate={cgstRate}
      sgstRate={sgstRate}
      companies={(companies ?? []).map(c => ({ id: c.id, name: c.name, is_default: c.is_default, cgst_rate: Number(c.cgst_rate), sgst_rate: Number(c.sgst_rate) }))}
    />
  )
}
