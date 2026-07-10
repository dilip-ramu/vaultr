import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TypedInvoiceClient from '@/components/customers/invoices/TypedInvoiceClient'

export const dynamic = 'force-dynamic'

/** Edit an existing typed GST tax invoice (all details + line items). Only
 *  typed tax invoices are editable here — courier/reimbursable ones redirect
 *  back to their detail page. */
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: invoice }, { data: lines }, { data: customers }, { data: companies }] = await Promise.all([
    supabase.from('recoverable_invoices').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('recoverable_invoice_lines').select('*').eq('invoice_id', id).order('line_number', { ascending: true }),
    supabase.from('customers').select('id, name').eq('user_id', user.id).order('name'),
    supabase.from('companies').select('id, name, is_default, cgst_rate, sgst_rate, hsn_sac').eq('user_id', user.id).order('is_default', { ascending: false }).order('created_at', { ascending: true }),
  ])

  if (!invoice) notFound()
  const inv = invoice as Record<string, unknown>
  // Only typed tax invoices are editable via this form.
  if (inv.invoice_type !== 'tax_invoice') redirect(`/recoverables/invoices/${id}`)

  const draftLines = (lines ?? []).map((l: Record<string, unknown>) => ({
    description: String(l.description ?? l.awb ?? ''),
    hsn: String(l.hsn_sac ?? ''),
    qty: String(l.qty ?? '1'),
    rate: String(l.rate ?? ''),
    cgst: String(l.cgst_rate ?? 9),
    sgst: String(l.sgst_rate ?? 9),
  }))

  return (
    <TypedInvoiceClient
      customers={(customers ?? []).map(c => ({ id: c.id, name: c.name }))}
      companies={(companies ?? []).map(c => ({ id: c.id, name: c.name, is_default: !!c.is_default, cgst_rate: Number(c.cgst_rate ?? 9), sgst_rate: Number(c.sgst_rate ?? 9), hsn_sac: (c.hsn_sac as string | null) ?? '996812' }))}
      initialCustomerId={null}
      invoiceId={id}
      initial={{
        customerId: (inv.customer_id as string | null) ?? '',
        companyId: (inv.company_id as string | null) ?? '',
        invoiceDate: String(inv.invoice_date ?? '').slice(0, 10),
        paymentTerms: (inv.payment_terms as string | null) ?? 'due_on_receipt',
        notes: (inv.notes as string | null) ?? '',
        lines: draftLines.length ? draftLines : [{ description: '', hsn: '', qty: '1', rate: '', cgst: '9', sgst: '9' }],
      }}
    />
  )
}
