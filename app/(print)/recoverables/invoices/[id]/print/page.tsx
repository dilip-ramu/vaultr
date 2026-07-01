import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import InvoicePrintView from '@/components/recoverables/invoices/InvoicePrintView'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'

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

  // Sign short-lived URLs for the branding files. TTL is 10 minutes — enough
  // for the user to click "Print / Download PDF" but not enough for the URL
  // to be usefully shared. If the file is missing or the column is null,
  // the print view renders without it — the invoice is still legally valid.
  const s = settings as (typeof settings & { logo_path?: string | null; signature_path?: string | null }) | null
  let logoUrl:      string | null = null
  let signatureUrl: string | null = null
  if (s?.logo_path) {
    const { data } = await supabase.storage.from('vaultr-attachments').createSignedUrl(s.logo_path, 600)
    logoUrl = data?.signedUrl ?? null
  }
  if (s?.signature_path) {
    const { data } = await supabase.storage.from('vaultr-attachments').createSignedUrl(s.signature_path, 600)
    signatureUrl = data?.signedUrl ?? null
  }

  return (
    <InvoicePrintView
      invoice={invoice as RecoverableInvoice}
      lines={(lines ?? []) as RecoverableInvoiceLine[]}
      settings={settings ?? null}
      logoUrl={logoUrl}
      signatureUrl={signatureUrl}
    />
  )
}
