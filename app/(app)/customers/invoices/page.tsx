import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import InvoicesPageClient from '@/components/recoverables/invoices/InvoicesPageClient'
import type { RecoverableInvoice, ImportBatch, RecoverableAllocation } from '@/lib/recoverables/types'

export const dynamic = 'force-dynamic'

/**
 * Customers → Invoices → Couriers tab.
 * Reuses the batch-first client I built in Deploy 2. Content unchanged;
 * only the URL moved (was /recoverables/invoices).
 */
async function PageContent({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { customer } = await searchParams
  const showAll = !customer || customer === 'all'

  let invoiceQ = supabase
    .from('recoverable_invoices')
    .select('*')
    .eq('user_id', user.id)
    .eq('invoice_type', 'tax_invoice')
    .order('created_at', { ascending: false })
  if (!showAll && customer) invoiceQ = invoiceQ.eq('customer_id', customer)

  const [
    { data: invoices },
    { data: batches },
    { data: allocations },
    { data: invoiceLines },
    { data: linkedPayees },
  ] = await Promise.all([
    invoiceQ,
    supabase
      .from('recoverable_import_batches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('recoverable_allocations')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending'),
    supabase
      .from('recoverable_invoice_lines')
      .select('invoice_id, allocation:recoverable_allocations(batch_id)')
      .eq('user_id', user.id)
      .not('allocation_id', 'is', null),
    supabase
      .from('payees')
      .select('customer_id')
      .eq('user_id', user.id)
      .not('customer_id', 'is', null),
  ])

  const invoiceBatchMap: Record<string, string> = {}
  type LineRow = {
    invoice_id: string
    allocation: { batch_id: string } | { batch_id: string }[] | null
  }
  for (const row of ((invoiceLines ?? []) as LineRow[])) {
    if (invoiceBatchMap[row.invoice_id]) continue
    const alloc = Array.isArray(row.allocation) ? row.allocation[0] : row.allocation
    if (alloc?.batch_id) invoiceBatchMap[row.invoice_id] = alloc.batch_id
  }
  const reimbursableCustomerIds = Array.from(
    new Set(
      ((linkedPayees ?? []) as { customer_id: string | null }[])
        .map(r => r.customer_id)
        .filter((v): v is string => !!v)
    )
  )

  return (
    <InvoicesPageClient
      invoices={(invoices ?? []) as RecoverableInvoice[]}
      batches={(batches ?? []) as ImportBatch[]}
      pendingAllocations={(allocations ?? []) as RecoverableAllocation[]}
      invoiceBatchMap={invoiceBatchMap}
      reimbursableCustomerIds={reimbursableCustomerIds}
    />
  )
}

export default function CouriersTabPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>}>
      <PageContent searchParams={searchParams} />
    </Suspense>
  )
}
