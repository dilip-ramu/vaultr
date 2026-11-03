// Assembling one issued document into a DocModel.
//
// Lifted out of the print page so the supplier pack can build the very same
// purchase order. Two copies of this would drift, and the day they drifted
// the supplier would be sent a PO that did not match the one on screen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTerms } from './terms'
import { normalizeAccent } from '@/lib/companies/templates'
import { resolveSignature } from '@/lib/companies/resolveSignature'
import { issuedDocToModel, type InvoiceSettings } from './adapters'
import { resolveDocumentBank } from '@/lib/companies/bankAccounts'
import { docConfigFor, type DocSide } from './config'
import type { BandTone, DocModel } from './model'

/** Per-doc-type header meta + status band. */
export const DOC_META: Record<string, { title: string; statusLabel: string; statusTone: BandTone; subNote?: string; noteFallback?: string }> = {
  quotation:        { title: 'Quotation',        statusLabel: 'QUOTE',    statusTone: 'grey',   subNote: 'Quotation · not a tax invoice', noteFallback: 'This quotation is valid for 15 days unless otherwise stated. Prices exclude taxes as applicable at time of supply.' },
  proforma_gst:     { title: 'Proforma Invoice', statusLabel: 'PROFORMA', statusTone: 'grey',   subNote: 'Not a tax invoice · quotation only', noteFallback: 'This proforma is for quotation purposes and does not constitute a demand for payment.' },
  sales_order:      { title: 'Sales Order',      statusLabel: 'ORDER',    statusTone: 'blue' },
  credit_note:      { title: 'Credit Note',      statusLabel: 'ISSUED',   statusTone: 'green' },
  debit_note:       { title: 'Debit Note',       statusLabel: 'ISSUED',   statusTone: 'blue' },
  purchase_order:   { title: 'Purchase Order',   statusLabel: 'ORDERED',  statusTone: 'violet', noteFallback: 'Please confirm acceptance. Invoice must quote this PO number.' },
  delivery_challan: { title: 'Delivery Challan', statusLabel: 'DISPATCHED', statusTone: 'blue', subNote: 'Under Rule 55', noteFallback: 'Not a tax invoice. Value stated for transport & e-way bill purposes.' },
}

export interface BuiltDocument {
  model: DocModel
  number: string
  docType: string
  companyId: string | null
}

export async function buildDocumentModel(
  supabase: SupabaseClient,
  uid: string,
  id: string,
): Promise<BuiltDocument | null> {
  const [{ data: doc }, { data: lines }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).eq('user_id', uid).single(),
    supabase.from('document_lines').select('*').eq('document_id', id).order('line_number', { ascending: true }),
  ])
  if (!doc) return null

  const d = doc as Record<string, unknown>
  const docType = String(d.doc_type)
  const companyId = (d.company_id as string | null) ?? null
  const cfg = docConfigFor(docType, (d.party_kind as DocSide) ?? 'customer')
  const meta = DOC_META[docType] ?? { title: cfg?.label ?? 'Document', statusLabel: 'ISSUED', statusTone: 'grey' as BandTone }

  let company: Record<string, unknown> | null = null
  if (companyId) {
    const { data } = await supabase.from('companies')
      .select('name, address, gstin, phone, email, bank_account_name, bank_account_number, bank_ifsc, bank_name, swift_code, terms_conditions, invoice_accent, logo_path, document_logo_path')
      .eq('id', companyId).eq('user_id', uid).maybeSingle()
    company = (data as Record<string, unknown> | null) ?? null
  }
  const accent = normalizeAccent(company?.invoice_accent)

  const settings: InvoiceSettings = {
    company_name: (company?.name as string | null) ?? null,
    company_address: (company?.address as string | null) ?? null,
    company_gstin: (company?.gstin as string | null) ?? null,
    company_phone: (company?.phone as string | null) ?? null,
    company_email: (company?.email as string | null) ?? null,
    bank_account_name: null, bank_account_number: null, bank_ifsc: null, bank_name: null, swift_code: null,
    terms_conditions: (company?.terms_conditions as string | null) ?? null,
  }
  const bank = await resolveDocumentBank(supabase, uid, companyId, (d.bank_account_id as string | null) ?? null)
  Object.assign(settings, bank.fields)
  settings.terms_conditions = (await resolveTerms(supabase, uid, docType, companyId, settings.terms_conditions)) ?? null

  let logoUrl: string | null = null
  const docLogoPath = (company?.document_logo_path as string | null) ?? (company?.logo_path as string | null)
  if (docLogoPath) logoUrl = supabase.storage.from('vaultr-avatars').getPublicUrl(docLogoPath).data?.publicUrl ?? null
  const sig = await resolveSignature(supabase, uid, { signatoryId: (d.signatory_id as string | null) ?? null, companyId })

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
    { logoUrl, signatureUrl: sig.url, signatureSize: sig.size, accent },
  )

  return { model, number: String(d.number ?? 'Document'), docType, companyId }
}
