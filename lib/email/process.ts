import type { SupabaseClient } from '@supabase/supabase-js'
import { extractFromEmailBody } from './extract'

export interface ProcessResult {
  status: 'needs_review' | 'duplicate_suspected' | 'error'
  reason?: string
}

/**
 * Extracts invoice data from an email document and saves the fields for review.
 * Does NOT create a supplier invoice — that only happens when the user
 * clicks "Approve & Log Invoice" in the Review modal.
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

  // 2. Mark as processing
  await supabase
    .from('email_documents')
    .update({ status: 'processing', processing_error: null })
    .eq('id', documentId)

  // 3. Extract invoice data
  const bodyForExtraction = emailDoc.email_body?.trim()
    ? emailDoc.email_body
    : `(no email body — attachment: ${emailDoc.attachment_name ?? 'unknown'})`

  let extracted: Awaited<ReturnType<typeof extractFromEmailBody>>
  try {
    extracted = await extractFromEmailBody(bodyForExtraction, emailDoc.sender_email ?? '')
  } catch (err) {
    const reason = (err as Error).message
    await supabase
      .from('email_documents')
      .update({ status: 'needs_review', processing_error: reason })
      .eq('id', documentId)
    return { status: 'needs_review', reason }
  }

  // 4. Check for duplicate against existing supplier invoices
  if (extracted.invoice_number) {
    const { data: existing } = await supabase
      .from('supplier_invoices')
      .select('id')
      .eq('user_id', emailDoc.user_id)
      .eq('invoice_number', extracted.invoice_number)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('email_documents')
        .update({
          status: 'duplicate_suspected',
          processing_error: `Invoice ${extracted.invoice_number} already exists`,
          extracted_supplier_name: extracted.supplier_name,
          extracted_invoice_number: extracted.invoice_number,
          extracted_invoice_date: extracted.invoice_date,
          extracted_due_date: extracted.due_date,
          extracted_currency: extracted.currency,
          extracted_amount: extracted.amount,
          extracted_gst_amount: extracted.gst_amount,
          extraction_confidence: extracted.confidence,
        })
        .eq('id', documentId)
      return { status: 'duplicate_suspected', reason: `Invoice ${extracted.invoice_number} already exists` }
    }
  }

  // 5. Save extracted fields and set to needs_review — user must approve before invoice is created
  await supabase
    .from('email_documents')
    .update({
      status: 'needs_review',
      processing_error: null,
      extracted_supplier_name: extracted.supplier_name,
      extracted_invoice_number: extracted.invoice_number,
      extracted_invoice_date: extracted.invoice_date,
      extracted_due_date: extracted.due_date,
      extracted_currency: extracted.currency,
      extracted_amount: extracted.amount,
      extracted_gst_amount: extracted.gst_amount,
      extraction_confidence: extracted.confidence,
    })
    .eq('id', documentId)

  return { status: 'needs_review' }
}
