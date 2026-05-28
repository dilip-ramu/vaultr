export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PaymentTrackingClient from '@/components/suppliers/payments/PaymentTrackingClient'

export default async function PaymentTrackingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: invoices }, { data: batches }, { data: suppliers }] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select('*, supplier:suppliers(id, name, supplier_code)')
      .eq('user_id', user.id)
      .order('invoice_date', { ascending: false }),
    supabase
      .from('bulk_payment_batches')
      .select('*')
      .eq('user_id', user.id)
      .order('payment_date', { ascending: false }),
    supabase
      .from('suppliers')
      .select('id, name, supplier_code')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PaymentTrackingClient
        initialInvoices={invoices ?? []}
        initialBatches={batches ?? []}
        suppliers={suppliers ?? []}
      />
    </div>
  )
}
