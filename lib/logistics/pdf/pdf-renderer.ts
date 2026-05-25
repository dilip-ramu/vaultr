import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupplierInvoice, SupplierInvoiceLine } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'

const BUCKET = 'vaultr-attachments'

/** Converts a numeric amount to Indian-English words (e.g. 12500 → "Twelve Thousand Five Hundred Rupees Only") */
export function amountInWords(amount: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function twoDigit(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    return tens[Math.floor(n / 10)] + (n % 10 > 0 ? ' ' + ones[n % 10] : '')
  }

  function threeDigit(n: number): string {
    if (n === 0) return ''
    const h = Math.floor(n / 100)
    const r = n % 100
    const hundredPart = h > 0 ? ones[h] + ' Hundred' : ''
    const restPart = r > 0 ? twoDigit(r) : ''
    return hundredPart + (hundredPart && restPart ? ' ' : '') + restPart
  }

  const whole = Math.floor(amount)
  const paise = Math.round((amount - whole) * 100)

  if (whole === 0 && paise === 0) return 'Zero Rupees Only'

  const crore    = Math.floor(whole / 10_000_000)
  const lakh     = Math.floor((whole % 10_000_000) / 100_000)
  const thousand = Math.floor((whole % 100_000) / 1_000)
  const rest     = whole % 1_000

  const parts: string[] = []
  if (crore    > 0) parts.push(threeDigit(crore)    + ' Crore')
  if (lakh     > 0) parts.push(threeDigit(lakh)     + ' Lakh')
  if (thousand > 0) parts.push(threeDigit(thousand) + ' Thousand')
  if (rest     > 0) parts.push(threeDigit(rest))

  const rupeeWords = parts.join(' ') || 'Zero'
  const paiseWords = paise > 0 ? ' and ' + twoDigit(paise) + ' Paise' : ''
  return rupeeWords + ' Rupees' + paiseWords + ' Only'
}

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
