import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CustomersPageClient from '@/components/recoverables/invoices/CustomersPageClient'
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
  ] = await Promise.all([
    supabase
      .from('recoverable_invoices')
      .select('*')
      .eq('user_id', user.id)
      // Batch E: filter out reimbursement rows — they live in the same
      // table now but are their own domain (see /customers/reimbursables).
      .eq('invoice_type', 'tax_invoice')
      .order('created_at', { ascending: false }),
    supabase
      .from('recoverable_import_batches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('recoverable_allocations')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending'),
  ])

  return (
    <CustomersPageClient
      invoices={(invoices ?? []) as RecoverableInvoice[]}
      batches={(batches ?? []) as ImportBatch[]}
      pendingAllocations={(allocations ?? []) as RecoverableAllocation[]}
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
