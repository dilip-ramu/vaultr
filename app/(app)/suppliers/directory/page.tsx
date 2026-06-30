export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplierDirectoryClient from '@/components/suppliers/directory/SupplierDirectoryClient'

export default async function SupplierDirectoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: suppliers }, { data: openInvoices }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', user.id)
      .order('name'),
    // Only open invoices contribute to outstanding/overdue.
    supabase
      .from('supplier_invoices')
      .select('supplier_id, amount, paid_amount, due_date, is_paid, status')
      .eq('user_id', user.id)
      .eq('is_paid', false)
      .neq('status', 'cancelled'),
  ])

  // Aggregate outstanding (amount - paid_amount) and overdue per supplier_id.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const totals: Record<string, { outstanding: number; overdue: number }> = {}
  for (const inv of openInvoices ?? []) {
    if (!inv.supplier_id) continue
    const bal = Math.max(0, Number(inv.amount) - Number(inv.paid_amount ?? 0))
    const t = (totals[inv.supplier_id] ??= { outstanding: 0, overdue: 0 })
    t.outstanding += bal
    if (inv.due_date && new Date(inv.due_date) < today) t.overdue += bal
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SupplierDirectoryClient
        initialSuppliers={suppliers ?? []}
        outstandingBySupplier={totals}
      />
    </div>
  )
}
