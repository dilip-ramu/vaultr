export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplierInvoicesClient from '@/components/suppliers/invoices/SupplierInvoicesClient'

export default async function SupplierInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: invoices }, { data: suppliers }] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select('*, supplier:suppliers(id, name, supplier_code)')
      .eq('user_id', user.id)
      .order('invoice_date', { ascending: false }),
    supabase
      .from('suppliers')
      .select('id, name, supplier_code, payment_terms, custom_terms_days, currency')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SupplierInvoicesClient
        initialInvoices={invoices ?? []}
        suppliers={suppliers ?? []}
      />
    </div>
  )
}
