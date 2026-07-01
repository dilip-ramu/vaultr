import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import UnifiedInvoicesClient from '@/components/customers/invoices/UnifiedInvoicesClient'

export const dynamic = 'force-dynamic'

/**
 * Customers → Invoices → Invoices tab.
 * Unified list of EVERY invoice — courier tax invoices AND reimbursement
 * invoices in one place. Chip picker filters by customer (all customers,
 * not just reimbursable ones). Each row shows a type badge, status, and
 * the standard set of actions.
 */
async function PageContent({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const uid = user.id

  const { customer } = await searchParams
  const showAll = !customer || customer === 'all'

  let q = supabase
    .from('recoverable_invoices')
    .select(`
      id, invoice_number, invoice_type, invoice_date, invoice_month,
      customer_id, customer_name, total, balance_due, status,
      currency, sent_at, paid_at, created_at
    `)
    .eq('user_id', uid)
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)
  if (!showAll && customer) q = q.eq('customer_id', customer)

  const { data: invoices } = await q

  // Which customers are reimbursable — used by the row to decide whether
  // "Mark paid" is the primary CTA (non-reimbursable path) or a secondary
  // one (reimbursement cascade handles it).
  const { data: linkedPayees } = await supabase
    .from('payees')
    .select('customer_id')
    .eq('user_id', uid)
    .not('customer_id', 'is', null)
  const reimbursableCustomerIds = Array.from(
    new Set(
      ((linkedPayees ?? []) as { customer_id: string | null }[])
        .map(r => r.customer_id)
        .filter((v): v is string => !!v)
    )
  )

  return (
    <UnifiedInvoicesClient
      invoices={(invoices ?? []) as never[]}
      reimbursableCustomerIds={reimbursableCustomerIds}
    />
  )
}

export default function InvoicesListPage({
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
