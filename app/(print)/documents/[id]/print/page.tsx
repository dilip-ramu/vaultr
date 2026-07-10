import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import DocPrintView from '@/components/documents/DocPrintView'
import { normalizeAccent } from '@/lib/companies/templates'
import { resolveSignatureUrl } from '@/lib/companies/resolveSignature'
import { issuedDocToModel, type InvoiceSettings } from '@/lib/documents/adapters'
import { docConfigFor, type DocSide } from '@/lib/documents/config'
import type { BandTone } from '@/lib/documents/model'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('documents').select('number').eq('id', id).maybeSingle()
  return { title: (data as { number: string } | null)?.number ?? 'Document' }
}

// Per-doc-type header meta + status band (auto per document type).
const DOC_META: Record<string, { title: string; statusLabel: string; statusTone: BandTone; subNote?: string; noteFallback?: string }> = {
  quotation:        { title: 'Quotation',        statusLabel: 'QUOTE',    statusTone: 'grey',   subNote: 'Quotation · not a tax invoice', noteFallback: 'This quotation is valid for 15 days unless otherwise stated. Prices exclude taxes as applicable at time of supply.' },
  proforma_gst:     { title: 'Proforma Invoice', statusLabel: 'PROFORMA', statusTone: 'grey',   subNote: 'Not a tax invoice · quotation only', noteFallback: 'This proforma is for quotation purposes and does not constitute a demand for payment.' },
  sales_order:      { title: 'Sales Order',      statusLabel: 'ORDER',    statusTone: 'blue' },
  credit_note:      { title: 'Credit Note',      statusLabel: 'ISSUED',   statusTone: 'green' },
  debit_note:       { title: 'Debit Note',       statusLabel: 'ISSUED',   statusTone: 'blue' },
  purchase_order:   { title: 'Purchase Order',   statusLabel: 'ORDERED',  statusTone: 'violet', noteFallback: 'Please confirm acceptance. Invoice must quote this PO number.' },
  delivery_challan: { title: 'Delivery Challan', statusLabel: 'DISPATCHED', statusTone: 'blue', subNote: 'Under Rule 55', noteFallback: 'Not a tax invoice. Value stated for transport & e-way bill purposes.' },
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
  const docType = String(d.doc_type)
  const companyId = (d.company_id as string | null) ?? null
  const cfg = docConfigFor(docType, (d.party_kind as DocSide) ?? 'customer')
  const meta = DOC_META[docType] ?? { title: cfg?.label ?? 'Document', statusLabel: 'ISSUED', statusTone: 'grey' as BandTone }

  let company: Record<string, unknown> | null = null
  if (companyId) {
    const { data } = await supabase.from('companies')
      .select('name, address, gstin, phone, email, bank_account_name, bank_account_number, bank_ifsc, bank_name, swift_code, terms_conditions, invoice_accent, logo_path, document_logo_path')
      .eq('id', companyId).eq('user_id', user.id).maybeSingle()
    company = (data as Record<string, unknown> | null) ?? null
  }
  const accent = normalizeAccent(company?.invoice_accent)

  const settings: InvoiceSettings = {
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
    terms_conditions: (company?.terms_conditions as string | null) ?? null,
  }

  let logoUrl: string | null = null
  const docLogoPath = (company?.document_logo_path as string | null) ?? (company?.logo_path as string | null)
  if (docLogoPath) logoUrl = supabase.storage.from('vaultr-avatars').getPublicUrl(docLogoPath).data?.publicUrl ?? null
  const signatureUrl = await resolveSignatureUrl(supabase, user.id, { signatoryId: (d.signatory_id as string | null) ?? null, companyId })

  const model = issuedDocToModel(
    d as unknown as Parameters<typeof issuedDocToModel>[0],
    (lines ?? []) as unknown as Parameters<typeof issuedDocToModel>[1],
    settings,
    {
      title: meta.title,
      partyLabel: cfg?.partyLabel ?? 'Party',
      tax: cfg?.tax ?? true,
      referenceLabel: cfg?.referenceLabel,
      statusLabel: meta.statusLabel,
      statusTone: meta.statusTone as 'grey' | 'blue' | 'violet' | 'amber' | 'green',
      subNote: meta.subNote,
      noteFallback: meta.noteFallback,
    },
    { logoUrl, signatureUrl, accent },
  )
  return <DocPrintView model={model} filename={`${String(d.number ?? 'Document')}.pdf`} />
}
