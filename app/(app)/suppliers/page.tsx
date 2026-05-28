export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplierOverviewClient from '@/components/suppliers/overview/SupplierOverviewClient'

export default async function SupplierOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: invoices },
    { data: suppliers },
  ] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select('id, amount, is_paid, is_recoverable, recoverable_status, billed_to_customer, status, invoice_date, due_date, linked_customer_name, supplier_id, invoice_number')
      .eq('user_id', user.id)
      .order('invoice_date', { ascending: false }),
    supabase
      .from('suppliers')
      .select('id, name, supplier_code')
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SupplierOverviewClient
        invoices={invoices ?? []}
        suppliers={suppliers ?? []}
      />
    </div>
  )
}
