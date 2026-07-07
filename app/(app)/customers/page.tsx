export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CustomerOverviewClient from '@/components/customers/CustomerOverviewClient'

export default async function CustomerOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: orders },
    { data: styles },
    { data: customers },
    { data: receivables },
  ] = await Promise.all([
    supabase
      .from('commission_orders')
      .select('id, customer_id, order_number, currency, order_date')
      .eq('user_id', user.id),
    supabase
      .from('commission_styles')
      .select('id, order_id, style_ref, commission_inr, order_status, received_date, expected_payment_date')
      .eq('user_id', user.id),
    supabase
      .from('customers')
      .select('id, name, pays_commission')
      .eq('user_id', user.id)
      .order('name'),
    supabase
      .from('recoverable_invoices')
      .select('balance_due, customer_id, customer_name')
      .eq('user_id', user.id)
      .eq('invoice_type', 'tax_invoice')  // Batch E: skip reimbursements
      .in('status', ['sent', 'overdue'])
      .gt('balance_due', 0),
  ])

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <CustomerOverviewClient
        orders={orders ?? []}
        styles={styles ?? []}
        customers={customers ?? []}
        receivables={receivables ?? []}
      />
    </div>
  )
}
