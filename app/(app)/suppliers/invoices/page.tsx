export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplierInvoicesClient from '@/components/suppliers/invoices/SupplierInvoicesClient'

async function InvoicesContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: invoices }, { data: suppliers }, { data: accounts }, { data: companies }] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select('*, supplier:suppliers(id, name, supplier_code, default_category_id)')
      .eq('user_id', user.id)
      .order('invoice_date', { ascending: false }),
    supabase
      .from('suppliers')
      .select('id, name, supplier_code, payment_terms, custom_terms_days, currency, default_invoice_category')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('account_balances')
      .select('id, name, type, color, avatar_url, custom_type_id, custom_type_name, custom_type_color, custom_type_icon')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    // For the GST block on a bill: input tax credit belongs to one of my GSTINs.
    supabase
      .from('companies')
      .select('id, name, gstin, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('name'),
  ])

  return (
    <SupplierInvoicesClient
      initialInvoices={invoices ?? []}
      suppliers={suppliers ?? []}
      accounts={accounts ?? []}
      companies={(companies ?? []) as { id: string; name: string; gstin: string | null; is_default?: boolean }[]}
      hideHeader
    />
  )
}

export default function SupplierInvoicesPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-muted)' }} className="py-12 text-center text-sm">Loading…</div>}>
      <InvoicesContent />
    </Suspense>
  )
}
