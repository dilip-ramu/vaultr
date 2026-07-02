import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import InvoicePrintView from '@/components/recoverables/invoices/InvoicePrintView'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import { normalizeTemplate, normalizeAccent } from '@/lib/companies/templates'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('recoverable_invoices')
    .select('invoice_number')
    .eq('id', id)
    .maybeSingle()
  return { title: (data as { invoice_number: string } | null)?.invoice_number ?? 'Invoice' }
}

export default async function InvoicePrintPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: invoice }, { data: lines }, { data: settings }] = await Promise.all([
    supabase
      .from('recoverable_invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('invoice_type', 'tax_invoice')  // Batch E: print view is tax-invoice only
      .single(),
    supabase
      .from('recoverable_invoice_lines')
      .select('*')
      .eq('invoice_id', id)
      .order('line_number', { ascending: true }),
    supabase
      .from('recoverable_invoice_settings')
      // logo_path / signature_path added in v57 — files live in the private
      // vaultr-attachments bucket and are rendered from signed URLs below.
      .select('company_name, company_address, company_gstin, company_phone, company_email, bank_account_name, bank_account_number, bank_ifsc, bank_name, swift_code, terms_conditions, hsn_sac, logo_path, signature_path')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!invoice) notFound()

  // ── Resolve the issuing company (Feature 1) ────────────────────────────────
  // The invoice carries company_id (v44). We read that company's branding,
  // template and accent so the printed document reflects the company it was
  // actually issued from — not the legacy single-row settings. Company fields
  // win; the legacy settings row is the fallback for anything the company
  // hasn't filled in.
  const inv = invoice as RecoverableInvoice & { company_id?: string | null }
  let company: Record<string, unknown> | null = null
  if (inv.company_id) {
    const { data } = await supabase
      .from('companies')
      .select('name, address, gstin, phone, email, bank_account_name, bank_account_number, bank_ifsc, bank_name, swift_code, terms_conditions, hsn_sac, logo_path, invoice_template, invoice_accent')
      .eq('id', inv.company_id)
      .eq('user_id', user.id)
      .maybeSingle()
    company = (data as Record<string, unknown> | null) ?? null
  }

  const legacy = settings as (typeof settings & { logo_path?: string | null; signature_path?: string | null }) | null
  const pick = (c: unknown, l: unknown) => (c ?? l ?? null) as string | null

  // Merge company branding over the legacy settings shape the view expects.
  const mergedSettings = {
    company_name:        pick(company?.name,               legacy?.company_name),
    company_address:     pick(company?.address,            legacy?.company_address),
    company_gstin:       pick(company?.gstin,              legacy?.company_gstin),
    company_phone:       pick(company?.phone,              legacy?.company_phone),
    company_email:       pick(company?.email,              legacy?.company_email),
    bank_account_name:   pick(company?.bank_account_name,  legacy?.bank_account_name),
    bank_account_number: pick(company?.bank_account_number, legacy?.bank_account_number),
    bank_ifsc:           pick(company?.bank_ifsc,          legacy?.bank_ifsc),
    bank_name:           pick(company?.bank_name,          legacy?.bank_name),
    swift_code:          pick(company?.swift_code,         legacy?.swift_code),
    terms_conditions:    pick(company?.terms_conditions,   legacy?.terms_conditions),
    hsn_sac:             pick(company?.hsn_sac,            legacy?.hsn_sac),
  }

  const template = normalizeTemplate(company?.invoice_template)
  const accent   = normalizeAccent(company?.invoice_accent)

  // ── Branding image URLs ────────────────────────────────────────────────────
  // Company logos live in the PUBLIC vaultr-avatars bucket (stable public URL);
  // the legacy settings logo + the signature live in the PRIVATE
  // vaultr-attachments bucket and need short-lived (10-min) signed URLs.
  let logoUrl:      string | null = null
  let signatureUrl: string | null = null
  const companyLogoPath = company?.logo_path as string | null | undefined
  if (companyLogoPath) {
    const { data } = supabase.storage.from('vaultr-avatars').getPublicUrl(companyLogoPath)
    logoUrl = data?.publicUrl ?? null
  } else if (legacy?.logo_path) {
    const { data } = await supabase.storage.from('vaultr-attachments').createSignedUrl(legacy.logo_path, 600)
    logoUrl = data?.signedUrl ?? null
  }
  if (legacy?.signature_path) {
    const { data } = await supabase.storage.from('vaultr-attachments').createSignedUrl(legacy.signature_path, 600)
    signatureUrl = data?.signedUrl ?? null
  }

  return (
    <InvoicePrintView
      invoice={invoice as RecoverableInvoice}
      lines={(lines ?? []) as RecoverableInvoiceLine[]}
      settings={mergedSettings}
      logoUrl={logoUrl}
      signatureUrl={signatureUrl}
      template={template}
      accent={accent}
    />
  )
}
