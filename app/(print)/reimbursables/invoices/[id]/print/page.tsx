import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReimbursablePrintView from '@/components/reimbursables/ReimbursablePrintView'
import type { ReimbursableInvoiceData } from '@/components/reimbursables/ReimbursableInvoicePDF'
import { reimbursablePreset, type DocumentSchema } from '@/lib/templates/schema'
import { normalizeAccent } from '@/lib/companies/templates'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('recoverable_invoices').select('invoice_number').eq('id', id).maybeSingle()
  return { title: (data as { invoice_number?: string } | null)?.invoice_number ?? 'Invoice' }
}

interface LineRow { item_type: string | null; description: string | null; amount: number | null; line_number: number | null }

export default async function ReimbursablePrintPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoice } = await supabase
    .from('recoverable_invoices')
    .select(`id, invoice_number, invoice_month, invoice_date, subtotal, cgst_amount, sgst_amount, total, currency, company_id, customer_id,
      items:recoverable_invoice_lines(item_type, description, amount, line_number)`)
    .eq('id', id).eq('user_id', user.id).eq('invoice_type', 'reimbursement').maybeSingle()
  if (!invoice) notFound()

  const companyId = invoice.company_id as string | null
  const [{ data: company }, { data: customer }] = await Promise.all([
    companyId
      ? supabase.from('companies').select('*').eq('id', companyId).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    invoice.customer_id
      ? supabase.from('customers').select('*').eq('id', invoice.customer_id as string).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let logoUrl: string | null = null
  const logoPath = (company as { logo_path?: string | null } | null)?.logo_path
  if (logoPath) {
    const { data } = supabase.storage.from('vaultr-avatars').getPublicUrl(logoPath)
    logoUrl = data?.publicUrl ?? null
  }

  const c = company as Record<string, unknown> | null
  const cust = customer as Record<string, unknown> | null
  const lines = ((invoice.items ?? []) as LineRow[]).slice().sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))

  const rdata: ReimbursableInvoiceData = {
    invoice_number: invoice.invoice_number as string,
    invoice_month: (invoice.invoice_month as string | null) ?? '',
    invoice_date: invoice.invoice_date as string,
    currency: (invoice.currency as string | null) ?? 'EUR',
    items: lines.map(l => ({
      item_type: (l.item_type ?? 'expense') as ReimbursableInvoiceData['items'][number]['item_type'],
      description: l.description ?? '',
      amount_inr: Number(l.amount ?? 0),
      inr_source: null,
      sort_order: l.line_number ?? 0,
    })),
    subtotal: Number(invoice.subtotal ?? 0),
    gst_amount: Number(invoice.cgst_amount ?? 0) + Number(invoice.sgst_amount ?? 0),
    total: Number(invoice.total ?? 0),
    bill_from: c ? {
      name: (c.name as string) ?? 'Your Company',
      logo_url: logoUrl,
      email: (c.email as string | null) ?? undefined,
      phone: (c.phone as string | null) ?? undefined,
      address: (c.address as string | null) ?? undefined,
      bank_account_name: (c.bank_account_name as string | null) ?? undefined,
      bank_account_number: (c.bank_account_number as string | null) ?? undefined,
      bank_ifsc: (c.bank_ifsc as string | null) ?? undefined,
      bank_name: (c.bank_name as string | null) ?? undefined,
      swift_code: (c.swift_code as string | null) ?? undefined,
    } : undefined,
    bill_to: cust ? {
      name: (cust.name as string) ?? '—',
      address: (cust.address as string | null) ?? undefined,
      country: (cust.country as string | null) ?? undefined,
      email: (cust.email as string | null) ?? undefined,
    } : undefined,
  }

  // Resolve the assigned custom template; fall back to the classic preset so
  // the HTML print view always renders.
  let schema: DocumentSchema | null = null
  {
    let aq = supabase.from('document_template_assignments').select('template_id')
      .eq('user_id', user.id).eq('doc_type', 'reimbursable_invoice')
    aq = companyId ? aq.eq('company_id', companyId) : aq.is('company_id', null)
    const { data: assignment } = await aq.maybeSingle()
    if (assignment?.template_id) {
      const { data: tpl } = await supabase.from('document_templates').select('schema')
        .eq('id', assignment.template_id).eq('user_id', user.id).maybeSingle()
      schema = (tpl?.schema as DocumentSchema | null) ?? null
    }
  }
  if (!schema) {
    const accent = normalizeAccent((c?.invoice_accent as string | null) ?? undefined)
    schema = reimbursablePreset('classic', accent)
  }

  return <ReimbursablePrintView schema={schema} data={rdata} />
}
