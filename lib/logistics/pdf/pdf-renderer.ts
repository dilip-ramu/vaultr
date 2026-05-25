import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupplierInvoice, SupplierInvoiceLine } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'

const BUCKET = 'vaultr-attachments'

export async function generateAndStorePDF(params: {
  supabase: SupabaseClient
  invoiceId: string
  userId: string
}): Promise<string> {
  const { supabase, invoiceId, userId } = params

  // Fetch full invoice + customer + lines
  const { data, error } = await supabase
    .from('supplier_invoices')
    .select(`
      *,
      customer:customers(id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at),
      lines:supplier_invoice_lines(*)
    `)
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('Invoice not found')

  const invoiceData = {
    ...data,
    customer: data.customer as unknown as Customer,
    lines: ((data.lines ?? []) as SupplierInvoiceLine[]).sort(
      (a, b) => a.sort_order - b.sort_order
    ),
  } as SupplierInvoice & { customer: Customer; lines: SupplierInvoiceLine[] }

  // Dynamic imports — keeps @react-pdf/renderer out of SSR bundles
  const [{ pdf }, { default: SupplierInvoicePDF }, { default: React }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./SupplierInvoicePDF'),
    import('react'),
  ])

  // Cast required: SupplierInvoicePDF wraps Document but its Props don't extend DocumentProps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(SupplierInvoicePDF, { invoice: invoiceData }) as any
  const blob = await pdf(element).toBlob()

  // Upload to storage
  const path = `logistics/supplier-invoices/${userId}/${invoiceId}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

  // Persist path on the invoice row
  await supabase
    .from('supplier_invoices')
    .update({ pdf_path: path })
    .eq('id', invoiceId)

  // Return fresh signed URL (1 hour)
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600)

  if (signErr || !signed) throw new Error('Failed to create download URL')
  return signed.signedUrl
}

export async function getInvoicePDFUrl(params: {
  supabase: SupabaseClient
  invoiceId: string
}): Promise<string | null> {
  const { supabase, invoiceId } = params

  const { data } = await supabase
    .from('supplier_invoices')
    .select('pdf_path')
    .eq('id', invoiceId)
    .single()

  if (!data?.pdf_path) return null

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.pdf_path, 3600)

  return signed?.signedUrl ?? null
}
