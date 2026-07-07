export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CustomersClient from '@/components/customers/CustomersClient'

export default async function CustomerDirectoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: customers }, { data: openInvoices }, { data: linkedPayees }] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .order('name'),
    // Only open invoices contribute to outstanding/overdue.
    // recoverable_invoices.balance_due is already (total - paid_amount).
    supabase
      .from('recoverable_invoices')
      .select('customer_id, balance_due, due_date, status')
      .eq('user_id', user.id)
      .eq('invoice_type', 'tax_invoice')  // Batch E: skip reimbursements
      .not('status', 'in', '(paid,cancelled,draft)'),
    // A customer is "reimbursable" iff at least one payee row links to them.
    // We hand the ids down so the form's toggle can show the correct default
    // and toggling it doesn't need a client-side read.
    supabase
      .from('payees')
      .select('customer_id')
      .eq('user_id', user.id)
      .not('customer_id', 'is', null),
  ])
  const reimbursableCustomerIds = new Set(
    (linkedPayees ?? [])
      .map(r => (r as { customer_id: string | null }).customer_id)
      .filter((v): v is string => !!v)
  )

  // Aggregate outstanding (balance_due) and overdue per customer_id.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const totals: Record<string, { outstanding: number; overdue: number }> = {}
  for (const inv of openInvoices ?? []) {
    if (!inv.customer_id) continue
    const bal = Math.max(0, Number(inv.balance_due ?? 0))
    if (bal === 0) continue
    const t = (totals[inv.customer_id] ??= { outstanding: 0, overdue: 0 })
    t.outstanding += bal
    if (inv.due_date && new Date(inv.due_date) < today) t.overdue += bal
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <CustomersClient
        initialCustomers={customers ?? []}
        outstandingByCustomer={totals}
        reimbursableCustomerIds={Array.from(reimbursableCustomerIds)}
      />
    </div>
  )
}
