import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import InvoicesPageClient from '@/components/recoverables/invoices/InvoicesPageClient'
import type { RecoverableInvoice, ImportBatch, RecoverableAllocation } from '@/lib/recoverables/types'

export const dynamic = 'force-dynamic'

async function PageContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: invoices },
    { data: batches },
    { data: allocations },
    // For each invoice → the batch its lines came from (via allocation join).
    // We fetch this in one pass and reduce to a Record<invoice_id, batch_id>
    // client-side. First-line's batch wins on the rare case an invoice spans
    // multiple batches.
    { data: invoiceLines },
    // Reimbursable customer ids so the invoice-row UI can decide whether to
    // show "Mark as paid" (non-reimbursable path) or hide it in favour of
    // the reimbursement-invoice cascade coming in Deploy 3.
    { data: linkedPayees },
  ] = await Promise.all([
    supabase
      .from('recoverable_invoices')
      .select('*')
      .eq('user_id', user.id)
      .eq('invoice_type', 'tax_invoice')
      .order('created_at', { ascending: false }),
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

  // Reduce invoiceLines to a first-batch-per-invoice map.
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

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>}>
      <PageContent />
    </Suspense>
  )
}
