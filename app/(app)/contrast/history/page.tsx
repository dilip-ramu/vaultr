import { createClient } from '@/lib/supabase/server'
import ContrastHistoryClient from '@/components/contrast/ContrastHistoryClient'
import { getReimbursableCustomers, resolveActiveCustomer } from '@/lib/reimbursables/customers'

export const dynamic = 'force-dynamic'

export default async function ContrastHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const { customer: customerParam } = await searchParams
  const reimbursables = await getReimbursableCustomers(supabase, uid)
  const active = resolveActiveCustomer(reimbursables, customerParam ?? null)

  // Filter invoices by the active customer when one is selected. Legacy rows
  // (created before migration v47) have customer_id NULL; backfill linked them
  // to the Contrast customer, so picking Contrast still returns those.
  let query = supabase
    .from('contrast_invoices')
    .select('*, items:contrast_invoice_items(*)')
    .eq('user_id', uid)
    .order('invoice_month', { ascending: false })
  if (active) query = query.eq('customer_id', active.id)

  const { data: invoices } = await query
  return <ContrastHistoryClient invoices={(invoices ?? []) as never[]} />
}
