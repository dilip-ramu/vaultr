/**
 * POST /api/logistics/extract-invoice
 *
 * Extracts structured invoice data (header fields + AWBs) from an uploaded
 * courier invoice PDF using pdf-parse + the OCR regex pipeline.
 * No external AI API is required.
 *
 * Body:   { courierInvoiceId: string }
 * Returns: { success: true, extracted: { invoice, awbs }, status, warnings, awbCount }
 *
 * Flow:
 *   1. Auth check
 *   2. Load courier_invoices row
 *   3. Mark ocr_status = 'processing'
 *   4. Download PDF from Supabase Storage
 *   5. Extract text with pdf-parse
 *   6. Run OCRPipeline.processText() → parse + normalise + insert draft AWBs
 *   7. Patch invoice header with extracted fields
 *   8. Return extracted data for client preview
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AWB, CourierInvoice } from '@/lib/logistics/types'

// ── Types ──────────────────────────────────────────────────

export interface ExtractedInvoiceData {
  invoice: Partial<Pick<CourierInvoice,
    | 'invoice_number' | 'invoice_date' | 'currency'
    | 'subtotal' | 'tax_amount' | 'total_amount'
  >>
  awbs: Partial<AWB>[]
}

// ── Route handler ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { courierInvoiceId } = body as { courierInvoiceId?: string }
  if (!courierInvoiceId) {
    return NextResponse.json({ error: 'courierInvoiceId is required' }, { status: 400 })
  }

  // ── 1. Load invoice row ──────────────────────────────────
  const { data: invoice, error: invErr } = await supabase
    .from('courier_invoices')
    .select('*')
    .eq('id', courierInvoiceId)
    .eq('user_id', user.id)
    .single()

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  if (!invoice.file_path) {
    return NextResponse.json({ error: 'No file attached to this invoice' }, { status: 400 })
  }

  // ── 2. Mark as processing ────────────────────────────────
  await supabase
    .from('courier_invoices')
    .update({ ocr_status: 'processing' })
    .eq('id', courierInvoiceId)

  // ── 3. Download file from Storage ────────────────────────
  const { data: blob, error: dlErr } = await supabase.storage
    .from('vaultr-attachments')
    .download(invoice.file_path)

  if (dlErr || !blob) {
    await supabase
      .from('courier_invoices')
      .update({
        ocr_status:   'failed',
        ocr_raw_data: { error: 'Storage download failed', detail: dlErr?.message },
      })
      .eq('id', courierInvoiceId)
    return NextResponse.json({ error: `File download failed: ${dlErr?.message}` }, { status: 500 })
  }

  const isPDF = invoice.file_type === 'pdf' || invoice.file_name?.toLowerCase().endsWith('.pdf')
  if (!isPDF) {
    await supabase
      .from('courier_invoices')
      .update({
        ocr_status:   'failed',
        ocr_raw_data: { error: 'Only PDF files are supported for auto-extraction' },
      })
      .eq('id', courierInvoiceId)
    return NextResponse.json(
      { error: 'Only PDF files are currently supported for auto-extraction' },
      { status: 400 },
    )
  }

  // ── 4. Extract text with pdf-parse ───────────────────────
  let rawText = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: object) => Promise<{ text: string }>
    const result = await pdfParse(Buffer.from(await blob.arrayBuffer()))
    rawText = result.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase
      .from('courier_invoices')
      .update({
        ocr_status:   'failed',
        ocr_raw_data: { error: 'PDF text extraction failed', detail: msg },
      })
      .eq('id', courierInvoiceId)
    return NextResponse.json({ error: `PDF extraction failed: ${msg}` }, { status: 500 })
  }

  // ── 5. Run OCR pipeline ──────────────────────────────────
  const { createOCRPipeline } = await import('@/lib/logistics/ocr/pipeline')
  const pipeline = createOCRPipeline(supabase)
  const ocrResult = await pipeline.processText({
    courierInvoiceId,
    rawText,
    provider: invoice.courier_provider,
  })

  // ── 6. Patch invoice header (don't overwrite user-entered data) ──
  const inv = ocrResult.normalizedInvoice
  const headerPatch: Record<string, unknown> = {
    ocr_confidence: ocrResult.parsed?.confidence ?? 0,
  }
  if (!invoice.invoice_number && inv.invoice_number) headerPatch.invoice_number = inv.invoice_number
  if (!invoice.invoice_date   && inv.invoice_date)   headerPatch.invoice_date   = inv.invoice_date
  if (inv.currency)                                  headerPatch.currency       = inv.currency
  if ((inv.subtotal     ?? 0) > 0 && invoice.subtotal     === 0) headerPatch.subtotal     = inv.subtotal
  if ((inv.tax_amount   ?? 0) > 0 && invoice.tax_amount   === 0) headerPatch.tax_amount   = inv.tax_amount
  if ((inv.total_amount ?? 0) > 0 && invoice.total_amount === 0) headerPatch.total_amount = inv.total_amount

  if (Object.keys(headerPatch).length > 0) {
    await supabase
      .from('courier_invoices')
      .update(headerPatch)
      .eq('id', courierInvoiceId)
  }

  const extracted: ExtractedInvoiceData = {
    invoice: {
      invoice_number: inv.invoice_number   ?? undefined,
      invoice_date:   inv.invoice_date     ?? undefined,
      currency:       inv.currency         ?? undefined,
      subtotal:       inv.subtotal         ?? undefined,
      tax_amount:     inv.tax_amount       ?? undefined,
      total_amount:   inv.total_amount     ?? undefined,
    },
    awbs: ocrResult.normalizedAWBs,
  }

  return NextResponse.json({
    success:  true,
    extracted,
    status:   ocrResult.status,
    warnings: ocrResult.warnings,
    awbCount: ocrResult.normalizedAWBs.length,
  })
}
