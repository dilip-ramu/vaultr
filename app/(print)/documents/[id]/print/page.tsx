import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import DocumentPrintView from '@/components/documents/DocumentPrintView'
import { presetSchema, type DocType, type DocumentSchema } from '@/lib/templates/schema'
import { normalizeAccent } from '@/lib/companies/templates'
import { resolveSignatureUrl } from '@/lib/companies/resolveSignature'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('documents').select('number').eq('id', id).maybeSingle()
  return { title: (data as { number: string } | null)?.number ?? 'Document' }
}

export default async function DocumentPrintPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: doc }, { data: lines }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('document_lines').select('*').eq('document_id', id).order('line_number', { ascending: true }),
  ])
  if (!doc) notFound()
  const d = doc as Record<string, unknown>
  const docType = d.doc_type as DocType
  const companyId = d.company_id as string | null

  // Issuing company branding + assigned template
  let company: Record<string, unknown> | null = null
  if (companyId) {
    const { data } = await supabase.from('companies')
      .select('name, address, gstin, phone, email, bank_account_name, bank_account_number, bank_ifsc, bank_name, swift_code, terms_conditions, hsn_sac, logo_path, invoice_accent')
      .eq('id', companyId).eq('user_id', user.id).maybeSingle()
    company = (data as Record<string, unknown> | null) ?? null
  }
  const accent = normalizeAccent(company?.invoice_accent)

  // Resolve the assigned template for this doc type + company; else default preset.
  let schema: DocumentSchema | null = null
  {
    let aq = supabase.from('document_template_assignments').select('template_id').eq('user_id', user.id).eq('doc_type', docType)
    aq = companyId ? aq.eq('company_id', companyId) : aq.is('company_id', null)
    const { data: assignment } = await aq.maybeSingle()
    if (assignment?.template_id) {
      const { data: tpl } = await supabase.from('document_templates').select('schema').eq('id', assignment.template_id).eq('user_id', user.id).maybeSingle()
      schema = (tpl?.schema as DocumentSchema | undefined) ?? null
    }
  }
  if (!schema) schema = presetSchema(docType, 'classic', accent)
  if (!schema) notFound()

  // ── Adapt the document to the invoice shape the renderer expects ──
  const dl = (lines ?? []) as Record<string, unknown>[]
  const adaptedLines = dl.map((l, i) => {
    const gst = Number(l.gst_rate) || 0
    return {
      id: String(l.id), user_id: user.id, invoice_id: id, allocation_id: null,
      line_number: Number(l.line_number) || i + 1, awb: '', description: String(l.item ?? ''),
      item_type: 'tax_invoice_line', client_name: null, shipment_date: null,
      hsn_sac: (l.hsn_sac as string | null) ?? null,
      qty: Number(l.qty) || 0, base_rate: Number(l.rate) || 0, rate: Number(l.rate) || 0, amount: Number(l.amount) || 0,
      cgst_rate: gst / 2, cgst_amount: Number(l.cgst_amount) || 0, sgst_rate: gst / 2, sgst_amount: Number(l.sgst_amount) || 0,
    } as unknown as RecoverableInvoiceLine
  })
  const firstGst = Number(dl[0]?.gst_rate) || 0
  const total = Number(d.total) || 0
  const invoice = {
    id, user_id: user.id, invoice_number: String(d.number ?? ''),
    customer_name: String(d.party_name ?? ''), customer_id: (d.party_id as string | null) ?? null,
    customer_address: (d.party_address as string | null) ?? null, customer_gstin: (d.party_gstin as string | null) ?? null,
    customer_state: (d.party_state as string | null) ?? null,
    invoice_date: String(d.date ?? ''), due_date: null, payment_terms: (d.reference as string | null) ?? null,
    markup_type: 'none', markup_value: 0,
    subtotal: Number(d.subtotal) || 0, cgst_rate: firstGst / 2, sgst_rate: firstGst / 2,
    cgst_amount: Number(d.cgst_amount) || 0, sgst_amount: Number(d.sgst_amount) || 0,
    total, paid_amount: 0, balance_due: total, status: 'draft', notes: (d.notes as string | null) ?? null,
    currency: String(d.currency ?? 'INR'), sent_at: null, paid_at: null, created_at: String(d.created_at ?? ''), updated_at: String(d.created_at ?? ''),
  } as unknown as RecoverableInvoice

  const settings = {
    company_name: (company?.name as string | null) ?? null,
    company_address: (company?.address as string | null) ?? null,
    company_gstin: (company?.gstin as string | null) ?? null,
    company_phone: (company?.phone as string | null) ?? null,
    company_email: (company?.email as string | null) ?? null,
    bank_account_name: (company?.bank_account_name as string | null) ?? null,
    bank_account_number: (company?.bank_account_number as string | null) ?? null,
    bank_ifsc: (company?.bank_ifsc as string | null) ?? null,
    bank_name: (company?.bank_name as string | null) ?? null,
    swift_code: (company?.swift_code as string | null) ?? null,
    terms_conditions: (d.notes as string | null) || (company?.terms_conditions as string | null) || null,
    hsn_sac: (company?.hsn_sac as string | null) ?? null,
  }

  let logoUrl: string | null = null
  if (company?.logo_path) {
    const { data } = supabase.storage.from('vaultr-avatars').getPublicUrl(company.logo_path as string)
    logoUrl = data?.publicUrl ?? null
  }

  // v89 — authorised signatory signature (chosen → company default).
  const signatureUrl = await resolveSignatureUrl(supabase, user.id, {
    signatoryId: (d.signatory_id as string | null) ?? null,
    companyId,
  })

  return (
    <DocumentPrintView
      schema={schema}
      invoice={invoice}
      lines={adaptedLines}
      settings={settings as unknown as import('@/components/recoverables/invoices/InvoiceDocument').InvoiceDocSettings}
      logoUrl={logoUrl}
      signatureUrl={signatureUrl}
    />
  )
}
