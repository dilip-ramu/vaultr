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
      .single(),
    supabase
      .from('recoverable_invoice_lines')
      .select('*')
      .eq('invoice_id', id)
      .order('line_number', { ascending: true }),
    supabase
      .from('recoverable_invoice_settings')
      .select('company_name, company_address, company_gstin, company_phone, company_email, bank_account_name, bank_account_number, bank_ifsc, bank_name, terms_conditions, hsn_sac')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!invoice) notFound()

  return (
    <InvoicePrintView
      invoice={invoice as RecoverableInvoice}
      lines={(lines ?? []) as RecoverableInvoiceLine[]}
      settings={settings ?? null}
    />
  )
}
