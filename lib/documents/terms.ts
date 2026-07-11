import type { SupabaseClient } from '@supabase/supabase-js'

/** Formats that carry terms & conditions on the printed page. */
export const TERMS_FORMATS: { slug: string; label: string; hint: string }[] = [
  { slug: 'tax_invoice',      label: 'Tax Invoice',            hint: 'Payment terms, interest on late payment, jurisdiction.' },
  { slug: 'reimbursable',     label: 'Courier / Reimbursable',  hint: 'Reimbursement basis, supporting documents, dispute window.' },
  { slug: 'quotation',        label: 'Quotation',              hint: 'Validity period, price basis, taxes extra.' },
  { slug: 'proforma_gst',     label: 'Proforma',               hint: 'Not a tax invoice; advance terms; validity.' },
  { slug: 'sales_order',      label: 'Sales Order',            hint: 'Delivery schedule, cancellation, acceptance.' },
  { slug: 'delivery_challan', label: 'Delivery Challan',       hint: 'Goods checked on receipt; damage claims window.' },
  { slug: 'credit_note',      label: 'Credit Note',            hint: 'Adjustment basis; GST credit reversal note.' },
  { slug: 'purchase_order',   label: 'Purchase Order',         hint: 'Acceptance, delivery, invoicing and payment terms.' },
  { slug: 'debit_note',       label: 'Debit Note',             hint: 'Reason for debit; adjustment against future bills.' },
]

/** Sensible starting text, used only until the user writes their own. */
export const DEFAULT_TERMS: Record<string, string> = {
  tax_invoice: 'Payment due within 30 days of invoice date. Interest at 18% p.a. applies on overdue amounts. Goods once sold are not returnable. Subject to jurisdiction of the courts at the place of issue.',
  reimbursable: 'Charges are reimbursed at actuals against supporting documents. Any discrepancy must be raised within 7 days of receipt of this invoice.',
  quotation: 'This quotation is valid for 15 days from the date of issue. Prices are exclusive of taxes, which will be charged as applicable at the time of supply.',
  proforma_gst: 'This is a proforma invoice and not a tax invoice. It does not constitute a demand for payment. A tax invoice will be raised on supply.',
  sales_order: 'Delivery dates are indicative and subject to material availability. Cancellation after acceptance may attract charges.',
  delivery_challan: 'Not a tax invoice. Value stated for transport and e-way bill purposes only. Goods to be checked on receipt; claims for shortage or damage must be raised within 48 hours.',
  credit_note: 'This credit note adjusts the referenced invoice. Please account for the corresponding GST reversal in the same tax period.',
  purchase_order: 'Please confirm acceptance of this order. Invoices must quote this PO number. Goods not conforming to specification may be rejected at your cost.',
  debit_note: 'This debit note is raised against the referenced supplier bill and will be adjusted against future payments unless settled separately.',
}

/**
 * Terms for a document at print time.
 * Company-specific row → global row for the format → the company's legacy
 * terms_conditions field → the built-in default. Never throws: if the table
 * hasn't been migrated yet, it quietly falls back.
 */
export async function resolveTerms(
  supabase: SupabaseClient,
  userId: string,
  format: string,
  companyId: string | null,
  companyFallback?: string | null,
): Promise<string | undefined> {
  try {
    const { data } = await supabase
      .from('document_terms')
      .select('terms, company_id')
      .eq('user_id', userId)
      .eq('format', format)

    const rows = (data ?? []) as { terms: string | null; company_id: string | null }[]
    const forCompany = companyId ? rows.find(r => r.company_id === companyId) : undefined
    const global = rows.find(r => r.company_id === null)
    const hit = (forCompany?.terms ?? global?.terms ?? '').trim()
    if (hit) return hit
  } catch { /* table not migrated yet — fall through */ }

  const legacy = (companyFallback ?? '').trim()
  if (legacy) return legacy
  return DEFAULT_TERMS[format] || undefined
}
