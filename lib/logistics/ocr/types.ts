/**
 * OCR pipeline types for courier invoice parsing.
 * These types define the intermediate representation between raw file text
 * and the Vaultr DB schema (CourierInvoice / AWB).
 */

// ── Parsed primitives ──────────────────────────────────────

/** A single charge line extracted from an AWB section. */
export interface ParsedAWBCharge {
  /** Human-readable label as found in the document (e.g. "Fuel Surcharge"). */
  label: string
  /** Extracted numeric amount. */
  amount: number
  /** Confidence that this charge was correctly identified and parsed (0–1). */
  confidence: number
}

/** All data extracted for a single AWB from the invoice. */
export interface ParsedAWB {
  awbNumber: string
  shipmentDate?: string         // ISO date string YYYY-MM-DD
  receiverName?: string
  destinationCountry?: string
  destinationCity?: string
  actualWeight?: number
  volumetricWeight?: number
  chargeableWeight?: number
  charges: ParsedAWBCharge[]
  /** The raw text section this AWB was parsed from — used for debugging and AI fallback. */
  rawText: string
  /** Overall confidence for this AWB (0–1). Average of field-level confidence scores. */
  confidence: number
}

/** The complete structured output from parsing a courier invoice file. */
export interface ParsedCourierInvoice {
  provider: string
  invoiceNumber?: string
  invoiceDate?: string          // ISO date string YYYY-MM-DD
  currency?: string
  totalAmount?: number
  taxAmount?: number
  awbs: ParsedAWB[]
  /** Full raw text extracted from the file — preserved for re-parsing or AI fallback. */
  rawData: string
  /**
   * Which extraction method produced this result:
   * - 'manual'  — user-entered, no parsing
   * - 'regex'   — rule-based pattern matching
   * - 'ai'      — Anthropic Vision API or similar
   */
  parseMethod: 'manual' | 'regex' | 'ai'
  /** Overall document-level confidence (0–1). */
  confidence: number
}

// ── Pipeline result ────────────────────────────────────────

/** Top-level result returned by OCRPipeline.processFile(). */
export interface OCRPipelineResult {
  /**
   * - 'success'  — all AWBs parsed with high confidence
   * - 'partial'  — some AWBs parsed or confidence below threshold
   * - 'failed'   — could not extract usable data
   */
  status: 'success' | 'partial' | 'failed'
  /** Null only when status = 'failed'. */
  parsed: ParsedCourierInvoice | null
  /** Hard errors that prevented parsing. */
  errors: string[]
  /** Non-fatal issues that may require user review. */
  warnings: string[]
  /** Wall-clock time in milliseconds for the full pipeline run. */
  processingMs: number
}

// ── Provider registry ──────────────────────────────────────

/** Interface all courier-specific parsers must implement. */
export interface CourierParser {
  readonly providerName: string
  parse(rawText: string): ParsedCourierInvoice
}
