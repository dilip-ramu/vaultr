/**
 * OCRPipeline — orchestrates the full file → structured-data flow.
 *
 * Pipeline stages:
 *   1. extractText   — raw file → plain text  (TODO: implement with pdf-parse / xlsx)
 *   2. parseStructure — plain text → ParsedCourierInvoice  (routed to provider parser)
 *   3. normalizeToSchema — ParsedCourierInvoice → DB-ready Partial<CourierInvoice+AWB>
 *   4. createDraftRecords — inserts AWBs marked for review
 *
 * Status progression stored in courier_invoices.ocr_status:
 *   none → queued → processing → done | failed
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OCRStatus } from '@/lib/logistics/types'
import type { CourierParser, OCRPipelineResult, ParsedCourierInvoice } from './types'
import type { AWB, CourierInvoice } from '@/lib/logistics/types'
import { DHLParser, FedExParser } from './providers/dhl-parser'
import { normalizeInvoice, normalizeAWBs } from './normalizer'

// ── Provider registry ──────────────────────────────────────

/** All registered courier parsers. Add new providers here. */
const PARSERS: CourierParser[] = [
  new DHLParser(),
  new FedExParser(),
  // new AramexParser(),  // TODO: add when Aramex samples available
]

function getParser(provider: string): CourierParser | null {
  const key = provider.toLowerCase()
  return PARSERS.find(p => p.providerName.toLowerCase() === key) ?? null
}

// ── Pipeline class ─────────────────────────────────────────

export class OCRPipeline {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Main entry point. Call after a file has been uploaded to Supabase Storage.
   *
   * @param courierInvoiceId  — ID of the already-created courier_invoices row
   * @param filePath          — storage path inside the vaultr-attachments bucket
   * @param fileType          — 'pdf' or 'excel'
   * @param provider          — courier name (e.g. 'DHL', 'FedEx')
   *
   * TODO: this method currently stubs text extraction (returns empty string).
   * Implement extractText() to enable the full pipeline.
   */
  async processFile(params: {
    courierInvoiceId: string
    filePath: string
    fileType: 'pdf' | 'excel'
    provider: string
  }): Promise<OCRPipelineResult> {
    const start = Date.now()
    const errors: string[] = []
    const warnings: string[] = []

    try {
      await this.updateStatus(params.courierInvoiceId, 'processing')

      // Stage 1: extract raw text from file
      const rawText = await this.extractText(params.filePath, params.fileType)
      if (!rawText.trim()) {
        warnings.push('File appears to be empty or text could not be extracted.')
      }

      // Stage 2: parse structure
      const parsed = await this.parseStructure(rawText, params.provider)
      if (parsed.awbs.length === 0) {
        warnings.push('No AWBs could be identified in the document.')
      }
      if (parsed.confidence < 0.5) {
        warnings.push(`Low confidence (${(parsed.confidence * 100).toFixed(0)}%). Results should be reviewed carefully.`)
      }

      // Stage 3: normalise to DB schema
      const normalized = this.normalizeToSchema(parsed)

      // Stage 4: persist draft AWBs
      await this.createDraftRecords(params.courierInvoiceId, normalized)

      const status: OCRPipelineResult['status'] =
        parsed.awbs.length === 0 ? 'partial' :
        parsed.confidence >= 0.7 ? 'success' : 'partial'

      await this.updateStatus(params.courierInvoiceId, 'done', {
        confidence: parsed.confidence,
        awbCount: parsed.awbs.length,
        warnings,
      })

      return { status, parsed, errors, warnings, processingMs: Date.now() - start }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(msg)
      await this.updateStatus(params.courierInvoiceId, 'failed', { errors })
      return { status: 'failed', parsed: null, errors, warnings, processingMs: Date.now() - start }
    }
  }

  /**
   * Alternative entry point used when text has already been extracted by the caller
   * (e.g. via pdf-parse in an API route).  Skips Stage 1 (file download) entirely
   * and runs Stage 2 → 4 directly.
   *
   * @param courierInvoiceId  — ID of the already-created courier_invoices row
   * @param rawText           — pre-extracted plain text from the PDF
   * @param provider          — courier name (e.g. 'DHL', 'FedEx')
   */
  async processText(params: {
    courierInvoiceId: string
    rawText: string
    provider: string
  }): Promise<OCRPipelineResult & { normalizedInvoice: Partial<CourierInvoice>; normalizedAWBs: Partial<AWB>[] }> {
    const start = Date.now()
    const errors: string[] = []
    const warnings: string[] = []

    try {
      await this.updateStatus(params.courierInvoiceId, 'processing')

      if (!params.rawText.trim()) {
        warnings.push('Extracted text is empty — the PDF may be scanned or image-only.')
      }

      // Stage 2: parse structure
      const parsed = await this.parseStructure(params.rawText, params.provider)
      if (parsed.awbs.length === 0) {
        warnings.push('No AWBs could be identified in the document.')
      }
      if (parsed.confidence < 0.5) {
        warnings.push(`Low confidence (${(parsed.confidence * 100).toFixed(0)}%). Review each extracted AWB carefully.`)
      }

      // Stage 3: normalise
      const normalized = this.normalizeToSchema(parsed)

      // Stage 4: persist draft AWBs
      await this.createDraftRecords(params.courierInvoiceId, normalized)

      const status: OCRPipelineResult['status'] =
        parsed.awbs.length === 0 ? 'partial' :
        parsed.confidence >= 0.7 ? 'success' : 'partial'

      await this.updateStatus(params.courierInvoiceId, 'done', {
        confidence: parsed.confidence,
        awbCount:   parsed.awbs.length,
        warnings,
      })

      return {
        status,
        parsed,
        errors,
        warnings,
        processingMs:      Date.now() - start,
        normalizedInvoice: normalized.invoice,
        normalizedAWBs:    normalized.awbs.map(awb => ({
          ...awb,
          courier_invoice_id: params.courierInvoiceId,
        })),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(msg)
      await this.updateStatus(params.courierInvoiceId, 'failed', { errors })
      return {
        status:            'failed',
        parsed:            null,
        errors,
        warnings,
        processingMs:      Date.now() - start,
        normalizedInvoice: {},
        normalizedAWBs:    [],
      }
    }
  }

  /**
   * Stage 1: Extracts plain text from the uploaded file.
   *
   * TODO: implement with real libraries:
   *   - PDF: `import pdfParse from 'pdf-parse'; const result = await pdfParse(buffer); return result.text`
   *   - Excel: `import { read, utils } from 'xlsx'; const wb = read(buffer); return utils.sheet_to_csv(...)`
   *   - Scanned PDF (low text quality): route to Anthropic Vision API instead.
   *
   * For now returns an empty string (pipeline compiles but produces no data).
   */
  private async extractText(filePath: string, fileType: string): Promise<string> {
    // TODO: download file from Supabase Storage, then parse with pdf-parse or xlsx
    // const { data, error } = await this.supabase.storage.from('vaultr-attachments').download(filePath)
    // if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)
    // const buffer = Buffer.from(await data.arrayBuffer())
    // if (fileType === 'pdf') { const result = await pdfParse(buffer); return result.text }
    // if (fileType === 'excel') { ... }
    void filePath; void fileType  // suppress unused-variable warnings until implemented
    return ''
  }

  /**
   * Stage 2: Routes raw text to the correct courier-specific parser.
   * Falls back to a generic empty result if no parser is registered for the provider.
   *
   * TODO: add an AI fallback here — if parser confidence < 0.4, call the Anthropic
   * Vision API with the raw text and a structured extraction prompt.
   */
  private async parseStructure(rawText: string, provider: string): Promise<ParsedCourierInvoice> {
    const parser = getParser(provider)

    if (!parser) {
      // Generic fallback — returns minimal structure so pipeline can continue
      return {
        provider,
        awbs:        [],
        rawData:     rawText,
        parseMethod: 'regex',
        confidence:  0,
      }
    }

    return parser.parse(rawText)
  }

  /**
   * Stage 3: Converts the parsed courier invoice into DB-ready partial objects.
   * Does not write to the DB — that is Stage 4's job.
   */
  private normalizeToSchema(parsed: ParsedCourierInvoice): {
    invoice: Partial<CourierInvoice>
    awbs: Partial<AWB>[]
  } {
    return {
      invoice: normalizeInvoice(parsed),
      awbs:    normalizeAWBs(parsed, ''),  // courierInvoiceId is injected in Stage 4
    }
  }

  /**
   * Stage 4: Batch-inserts draft AWB rows.
   * AWBs are inserted with total_pieces = 0 so they appear in the UI as needing review.
   * raw_line_data preserves the OCR output for debugging.
   *
   * TODO: consider using a Postgres transaction (RPC) to make this atomic.
   */
  private async createDraftRecords(
    courierInvoiceId: string,
    normalized: { awbs: Partial<AWB>[] },
  ): Promise<void> {
    if (normalized.awbs.length === 0) return

    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const rows = normalized.awbs.map(awb => ({
      ...awb,
      courier_invoice_id: courierInvoiceId,
      user_id: user.id,
    }))

    const { error } = await this.supabase.from('awbs').insert(rows)
    if (error) throw new Error(`Failed to insert draft AWBs: ${error.message}`)
  }

  /**
   * Updates ocr_status on the courier_invoices row.
   * Called at the start (processing), end (done), and on failure.
   *
   * @param id     — courier_invoices.id
   * @param status — new OCRStatus value
   * @param data   — optional extra data merged into ocr_raw_data
   */
  async updateStatus(id: string, status: OCRStatus, data?: object): Promise<void> {
    const update: Record<string, unknown> = { ocr_status: status }
    if (data) update['ocr_raw_data'] = data
    await this.supabase.from('courier_invoices').update(update).eq('id', id)
  }
}

// ── Factory ────────────────────────────────────────────────

/**
 * Creates an OCRPipeline bound to the given Supabase client.
 * Use this in server actions or API routes, not in client components.
 *
 * @example
 * const pipeline = createOCRPipeline(supabase)
 * const result = await pipeline.processFile({ courierInvoiceId, filePath, fileType: 'pdf', provider: 'DHL' })
 */
export function createOCRPipeline(supabase: SupabaseClient): OCRPipeline {
  return new OCRPipeline(supabase)
}
