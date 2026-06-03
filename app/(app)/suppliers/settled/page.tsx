export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettledInvoicesClient from '@/components/suppliers/settled/SettledInvoicesClient'

async function SettledContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fully settled = paid to supplier AND either non-recoverable OR recovered from customer
  const { data: invoices } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(id, name, supplier_code)')
    .eq('user_id', user.id)
    .eq('is_paid', true)
    .or('is_recoverable.eq.false,recoverable_status.eq.recovered')
    .order('payment_date', { ascending: false })

  return <SettledInvoicesClient initialInvoices={invoices ?? []} />
}

export default function SettledInvoicesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Suspense fallback={<div style={{ color: 'var(--text-muted)' }} className="py-12 text-center text-sm">Loading…</div>}>
        <SettledContent />
      </Suspense>
    </div>
  )
}
