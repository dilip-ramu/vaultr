export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BilledRecoverablesClient from '@/components/suppliers/recoverables/BilledRecoverablesClient'

export default async function BilledRecoverablesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoices } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(id, name, supplier_code)')
    .eq('user_id', user.id)
    .eq('is_recoverable', true)
    .in('recoverable_status', ['billed', 'recovered', 'partial_recovery', 'written_off'])
    .order('invoice_date', { ascending: false })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BilledRecoverablesClient initialInvoices={invoices ?? []} />
    </div>
  )
}
