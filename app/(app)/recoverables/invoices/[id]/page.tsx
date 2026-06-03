import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import InvoiceDetailClient from '@/components/recoverables/invoices/InvoiceDetailClient'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import type { Customer } from '@/lib/types'
import type { SupplierLink } from '@/components/recoverables/invoices/InvoiceDetailClient'

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: invoice }, { data: lines }, { data: settings }, { data: supplierLinks }] = await Promise.all([
    supabase
      .from('recoverable_invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('recoverable_invoice_lines')
      .select('*')
      .eq('invoice_id', id)
      .order('line_number', { ascending: true }),
    supabase
      .from('recoverable_invoice_settings')
      .select('company_name, company_address, company_gstin, company_phone, company_email')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('invoice_supplier_links')
      .select(`
        id, allocated_amount, notes, created_at,
        supplier_invoice:supplier_invoices(
          id, invoice_number, invoice_date, amount, currency,
          is_paid, status, recoverable_status, category,
          supplier:suppliers(id, name, supplier_code)
        )
      `)
      .eq('recoverable_invoice_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ])

  if (!invoice) notFound()

  let customer: Customer | null = null
  if ((invoice as RecoverableInvoice).customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('*')
      .eq('id', (invoice as RecoverableInvoice).customer_id as string)
      .eq('user_id', user.id)
      .single()
    customer = c as Customer | null
  }

  return (
    <InvoiceDetailClient
      invoice={invoice as RecoverableInvoice}
      lines={(lines ?? []) as RecoverableInvoiceLine[]}
      customer={customer}
      sellerInfo={settings ?? null}
      initialSupplierLinks={(supplierLinks ?? []) as unknown as SupplierLink[]}
    />
  )
}
