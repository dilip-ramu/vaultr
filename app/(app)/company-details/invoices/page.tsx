import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvoiceListClient from '@/components/recoverables/invoices/InvoiceListClient'

export const dynamic = 'force-dynamic'

export default async function CompanyDetailsInvoicesTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoices } = await supabase
    .from('recoverable_invoices')
    .select('*')
    .eq('user_id', user.id)
    .eq('invoice_type', 'tax_invoice')  // Batch E: skip reimbursements
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })

  return <InvoiceListClient invoices={invoices ?? []} hideHeader />
}
