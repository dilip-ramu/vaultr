// Invoices: the question, not a tab bar.
//
// What stood here was the Couriers batch screen — so clicking "Invoices" in
// the nav showed you something that was not a list of invoices, and the list
// was two tabs away with a queue of expenses in between. Three different jobs
// behind one word.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvoiceChooser, { type RecentInvoice } from '@/components/customers/invoices/InvoiceChooser'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invoices — Inex' }

export default async function InvoicesChooserPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('recoverable_invoices')
    .select('id, invoice_number, customer_name, invoice_date, total, status, invoice_type')
    .eq('user_id', user.id)
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(6)

  return <InvoiceChooser recent={(data ?? []) as RecentInvoice[]} />
}
