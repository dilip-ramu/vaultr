export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplierInvoicesClient from '@/components/suppliers/invoices/SupplierInvoicesClient'

async function InvoicesContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [invoicesRes, suppliersRes, accountsRes, companiesRes] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select('*, supplier:suppliers(id, name, supplier_code, default_category_id)')
      .eq('user_id', user.id)
      .order('invoice_date', { ascending: false }),
    // SELECT * ON PURPOSE. This used to name its columns, including
    // `default_invoice_category` — a column added late, in migration v103. On a
    // database where that migration had not run, PostgREST rejected the WHOLE
    // query, `data` came back null, and the Add-invoice form rendered an empty
    // supplier dropdown. An empty dropdown and a failed query looked identical,
    // which is why this took a while to spot. Selecting * makes the query
    // independent of any one optional column, exactly like the directory page
    // that kept working throughout.
    supabase
      .from('suppliers')
      .select('*')
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

  // A query that FAILED must never be presented as "you have none". Log which
  // one broke, and tell the form so it can say so instead of showing an empty
  // list the user cannot act on.
  const failures: string[] = []
  for (const [name, res] of [
    ['invoices', invoicesRes], ['suppliers', suppliersRes],
    ['accounts', accountsRes], ['companies', companiesRes],
  ] as const) {
    if (res.error) {
      failures.push(name)
      console.error(`[suppliers/invoices] could not load ${name}:`, res.error.message)
    }
  }

  const invoices = invoicesRes.data
  const suppliers = suppliersRes.data
  const accounts = accountsRes.data
  const companies = companiesRes.data

  return (
    <SupplierInvoicesClient
      initialInvoices={invoices ?? []}
      suppliers={suppliers ?? []}
      accounts={accounts ?? []}
      companies={(companies ?? []) as { id: string; name: string; gstin: string | null; is_default?: boolean }[]}
      loadError={suppliersRes.error
        ? `Suppliers could not be loaded (${suppliersRes.error.message}). This is a database error, not an empty list.`
        : failures.length ? `Some data could not be loaded: ${failures.join(', ')}.` : null}
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
