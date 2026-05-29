import type { SupabaseClient } from '@supabase/supabase-js'
import { extractFromPdf } from './extract'

export interface ProcessResult {
  status: 'invoice_created' | 'needs_review' | 'duplicate_suspected' | 'error'
  supplier_invoice_id?: string
  reason?: string
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function calcPaymentTermsDays(
  paymentTerms: string,
  customTermsDays: number | null
): number | null {
  if (paymentTerms === 'immediate') return 0
  if (paymentTerms === 'custom') return customTermsDays ?? 30
  const n = parseInt(paymentTerms, 10)
  return isNaN(n) ? null : n
}

/**
 * Main processing pipeline: extract invoice data from a PDF email document
 * and auto-create a supplier invoice.
 */
export async function processEmailDocument(
  documentId: string,
  supabase: SupabaseClient
): Promise<ProcessResult> {
  // 1. Fetch the email document
  const { data: emailDoc, error: fetchError } = await supabase
    .from('email_documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (fetchError || !emailDoc) {
    return { status: 'error', reason: 'Document not found' }
  }

  if (!emailDoc.storage_path) {
    return { status: 'needs_review', reason: 'No PDF attachment stored' }
  }

  // 2. Update status to 'processing'
  await supabase
    .from('email_documents')
    .update({ status: 'processing', processing_error: null })
    .eq('id', documentId)

  // 3. Extract invoice data from PDF
  const extracted = await extractFromPdf(emailDoc.storage_path, supabase)

  // 4. If extraction fails
  if (!extracted) {
    await supabase
      .from('email_documents')
      .update({ status: 'needs_review', processing_error: 'Extraction failed' })
      .eq('id', documentId)
    return { status: 'needs_review', reason: 'Extraction failed' }
  }

  // 5. Save extracted fields to the email_document record
  await supabase
    .from('email_documents')
    .update({
      extracted_text: extracted.raw_text.slice(0, 10000),
      extracted_supplier_name: extracted.supplier_name,
      extracted_invoice_number: extracted.invoice_number,
      extracted_invoice_date: extracted.invoice_date,
      extracted_due_date: extracted.due_date,
      extracted_currency: extracted.currency,
      extracted_amount: extracted.amount,
      extracted_gst_amount: extracted.gst_amount,
      extracted_reference: extracted.reference,
      extraction_confidence: extracted.confidence,
    })
    .eq('id', documentId)

  // 6. Match supplier (3 priorities)
  let matchedSupplier: {
    id: string
    name: string
    payment_terms: string
    custom_terms_days: number | null
  } | null = null

  // Priority 1: find supplier by sender email
  const senderEmail = emailDoc.sender_email ?? ''
  if (senderEmail) {
    const { data: supplierByEmail } = await supabase
      .from('suppliers')
      .select('id, name, payment_terms, custom_terms_days')
      .eq('user_id', emailDoc.user_id)
      .ilike('email', `%${senderEmail}%`)
      .limit(1)
      .maybeSingle()

    if (supplierByEmail) {
      matchedSupplier = supplierByEmail
    }
  }

  // Priority 2: match by extracted supplier name
  if (!matchedSupplier && extracted.supplier_name) {
    const { data: supplierByName } = await supabase
      .from('suppliers')
      .select('id, name, payment_terms, custom_terms_days')
      .eq('user_id', emailDoc.user_id)
      .ilike('name', `%${extracted.supplier_name}%`)
      .limit(1)
      .maybeSingle()

    if (supplierByName) {
      matchedSupplier = supplierByName
    }
  }

  // 7. If no supplier matched
  if (!matchedSupplier) {
    await supabase
      .from('email_documents')
      .update({ status: 'needs_review', processing_error: 'Supplier not matched' })
      .eq('id', documentId)
    return { status: 'needs_review', reason: 'Supplier not matched' }
  }

  // 8. Confidence gate — if very low confidence, mark needs_review without creating
  if (extracted.confidence < 0.5) {
    await supabase
      .from('email_documents')
      .update({ status: 'needs_review', processing_error: `Low confidence: ${extracted.confidence}` })
      .eq('id', documentId)
    return { status: 'needs_review', reason: `Low confidence: ${extracted.confidence}` }
  }

  // 9. Check for duplicate invoice
  if (extracted.invoice_number) {
    const { data: existing } = await supabase
      .from('supplier_invoices')
      .select('id')
      .eq('user_id', emailDoc.user_id)
      .eq('supplier_id', matchedSupplier.id)
      .eq('invoice_number', extracted.invoice_number)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('email_documents')
        .update({ status: 'duplicate_suspected', processing_error: `Invoice ${extracted.invoice_number} already exists` })
        .eq('id', documentId)
      return { status: 'duplicate_suspected', reason: `Invoice ${extracted.invoice_number} already exists` }
    }
  }

  // 10. Calculate due date
  let dueDate: string | null = extracted.due_date ?? null
  if (!dueDate) {
    const invoiceDateForCalc = extracted.invoice_date ?? new Date().toISOString().split('T')[0]
    const termsDays = calcPaymentTermsDays(
      matchedSupplier.payment_terms,
      matchedSupplier.custom_terms_days
    )
    if (termsDays !== null) {
      dueDate = addDaysToDate(invoiceDateForCalc, termsDays)
    }
  }

  // 11. Build renamed filename (sanitize: replace non-alphanum with _)
  const renamedParts = [
    sanitizeFilename(matchedSupplier.name),
    sanitizeFilename(extracted.invoice_number ?? 'UNKNOWN'),
    String(extracted.amount ?? '0'),
  ]
  const renamedFilename = `${renamedParts.join('_')}.pdf`

  // 12. Determine final status for the invoice
  const today = new Date().toISOString().split('T')[0]
  const invoiceDate = extracted.invoice_date ?? today

  // 13. Create supplier_invoice
  const { data: newInvoice, error: insertError } = await supabase
    .from('supplier_invoices')
    .insert({
      user_id: emailDoc.user_id,
      supplier_id: matchedSupplier.id,
      invoice_number: extracted.invoice_number,
      invoice_date: invoiceDate,
      due_date: dueDate,
      amount: extracted.amount ?? 0,
      currency: extracted.currency ?? 'INR',
      notes: `Auto-imported from email: ${emailDoc.email_subject ?? ''}`,
      attachment_path: emailDoc.storage_path,
      attachment_name: renamedFilename,
      source_email_document_id: documentId,
      auto_imported: true,
      import_date: new Date().toISOString(),
      extraction_confidence: extracted.confidence,
      status: 'pending',
      is_paid: false,
      is_recoverable: false,
    })
    .select('id')
    .single()

  if (insertError || !newInvoice) {
    console.error('[process] Insert invoice error:', insertError?.message)
    await supabase
      .from('email_documents')
      .update({ status: 'needs_review', processing_error: insertError?.message ?? 'Failed to create invoice' })
      .eq('id', documentId)
    return { status: 'needs_review', reason: insertError?.message ?? 'Failed to create invoice' }
  }

  // 14. Update email_document to final state
  // If confidence < 0.75, still created but mark email doc as needs_review
  const finalEmailStatus = extracted.confidence >= 0.75 ? 'invoice_created' : 'needs_review'

  await supabase
    .from('email_documents')
    .update({
      status: finalEmailStatus,
      supplier_invoice_id: newInvoice.id,
      renamed_filename: renamedFilename,
      extracted_text: extracted.raw_text.slice(0, 10000),
      extracted_supplier_name: extracted.supplier_name,
      extracted_invoice_number: extracted.invoice_number,
      extracted_invoice_date: extracted.invoice_date,
      extracted_due_date: extracted.due_date,
      extracted_currency: extracted.currency,
      extracted_amount: extracted.amount,
      extracted_gst_amount: extracted.gst_amount,
      extracted_reference: extracted.reference,
      extraction_confidence: extracted.confidence,
      processing_error: extracted.confidence < 0.75 ? 'Low confidence — please review' : null,
    })
    .eq('id', documentId)

  return { status: 'invoice_created', supplier_invoice_id: newInvoice.id }
}
