import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import InvoiceDetailClient from '@/components/recoverables/invoices/InvoiceDetailClient'
import DocChainFlow from '@/components/documents/DocChainFlow'
import { resolveSellChain } from '@/lib/documents/chain'
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
      .eq('invoice_type', 'tax_invoice')  // Batch E: this page is for tax invoices only
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

  // FROM (seller) must reflect the company that actually issued this invoice
  // (invoice.company_id), not the legacy single-row settings. Fall back to the
  // legacy settings only when the invoice has no company.
  let sellerInfo = settings ?? null
  const issuingCompanyId = (invoice as RecoverableInvoice & { company_id?: string | null }).company_id
  if (issuingCompanyId) {
    const { data: co } = await supabase
      .from('companies')
      .select('name, address, gstin, phone, email')
      .eq('id', issuingCompanyId).eq('user_id', user.id).maybeSingle()
    if (co) {
      sellerInfo = {
        company_name: co.name ?? null,
        company_address: co.address ?? null,
        company_gstin: co.gstin ?? null,
        company_phone: co.phone ?? null,
        company_email: co.email ?? null,
      }
    }
  }

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

  // Chain ribbon — only render if this invoice belongs to a document chain.
  const chain = await resolveSellChain(supabase, user.id, { kind: 'recoverable_invoice', id })
  const inChain = chain.some(n => n.status !== 'pending' && n.key !== 'tax_invoice')

  return (
    <div>
      {inChain && (
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          <DocChainFlow nodes={chain} />
        </div>
      )}
      <InvoiceDetailClient
        invoice={invoice as RecoverableInvoice}
        lines={(lines ?? []) as RecoverableInvoiceLine[]}
        customer={customer}
        sellerInfo={sellerInfo}
        initialSupplierLinks={(supplierLinks ?? []) as unknown as SupplierLink[]}
      />
    </div>
  )
}
