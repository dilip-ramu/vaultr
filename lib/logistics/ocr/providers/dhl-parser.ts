/**
 * DHL courier invoice parser — regex-based stub.
 *
 * DHL PDF invoice structure (typical):
 *   - Header block: "INVOICE" + invoice number, date, total
 *   - Per-shipment sections starting with AWB number (10–12 digits)
 *   - Each section lists charge lines: label + amount + currency
 *   - Section total appears before the next AWB or end-of-invoice
 *
 * TODO (when real DHL PDF samples are available):
 *   1. Run a DHL PDF through `pdf-parse` and inspect the raw text layout.
 *   2. Refine AWB_SECTION_REGEX to match the exact section separator pattern.
 *   3. Validate CHARGE_PATTERNS against real charge labels in the document.
 *   4. Add weight-extraction regex once field positions are confirmed.
 *   5. If text extraction quality is low (scanned PDF), route to AI vision instead.
 */

import type { CourierParser, ParsedAWB, ParsedAWBCharge, ParsedCourierInvoice } from '../types'

// ── Regex patterns ─────────────────────────────────────────

/** DHL AWB numbers are 10–12 digits, sometimes hyphenated. */
const AWB_NUMBER_REGEX = /\b(\d{10,12})\b/

/**
 * Splits the invoice text into per-AWB sections.
 * TODO: adjust separator pattern once real PDF text is analysed.
 * Common separators: repeated dashes, the word "Shipment", or the AWB number itself.
 */
const AWB_SECTION_SEPARATOR = /(?=Shipment\s+\d{10,12}|\b\d{10,12}\b\s+[\w\s]+\n)/i

/**
 * Charge label patterns mapped to the AWB field they populate.
 * Each entry: [fieldKey, ...labelPatterns].
 * TODO: expand with labels from a real DHL invoice.
 */
const CHARGE_PATTERNS: Array<{ field: string; pattern: RegExp }> = [
  { field: 'shipment_charge',    pattern: /(?:shipment|transportation)\s+charge[s]?/i },
  { field: 'fuel_surcharge',     pattern: /(?:fuel|energy)\s+surcharge/i },
  { field: 'demand_surcharge',   pattern: /demand\s+surcharge/i },
  { field: 'gogreen_surcharge',  pattern: /(?:gogreen|go\s*green)/i },
  { field: 'remote_area_charge', pattern: /(?:remote\s+area|ras)\s+(?:surcharge|charge)?/i },
  { field: 'other_charges',      pattern: /(?:peak\s+surcharge|miscellaneous|other\s+charge)/i },
  { field: 'tax_amount',         pattern: /(?:gst|vat|tax)\s+(?:\d+%\s+)?(?:charge)?/i },
]

/** Matches a monetary amount on the same line as a charge label. */
const AMOUNT_ON_LINE_REGEX = /(\d[\d,]*\.?\d*)\s*(?:INR|USD|EUR|AED|GBP)?$/

// ── Parser implementation ──────────────────────────────────

export class DHLParser implements CourierParser {
  readonly providerName = 'DHL'

  /**
   * Entry point. Receives the full raw text extracted from the DHL PDF.
   * Returns a ParsedCourierInvoice with best-effort data.
   *
   * TODO: replace stub header extraction with real regex once layout is known.
   */
  parse(rawText: string): ParsedCourierInvoice {
    const sections = this.extractAWBSections(rawText)
    const awbs = sections.map(s => this.parseAWBSection(s)).filter(a => a.awbNumber !== '')

    const invoiceNumber = this.extractHeaderField(rawText, /invoice\s+(?:no\.?|number)[:\s]+(\S+)/i)
    const invoiceDate   = this.extractHeaderField(rawText, /invoice\s+date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
    const totalMatch    = rawText.match(/(?:total\s+charges?|invoice\s+total)[:\s]+([\d,]+\.?\d*)/i)
    const totalAmount   = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : undefined
    const currency      = this.extractCurrency(rawText)

    const overallConfidence = awbs.length > 0
      ? awbs.reduce((s, a) => s + a.confidence, 0) / awbs.length
      : 0

    return {
      provider: 'DHL',
      invoiceNumber:  invoiceNumber ?? undefined,
      invoiceDate:    invoiceDate   ? this.normaliseDate(invoiceDate) : undefined,
      currency,
      totalAmount,
      awbs,
      rawData:     rawText,
      parseMethod: 'regex',
      confidence:  overallConfidence,
    }
  }

  /**
   * Splits raw text into one section per AWB.
   * TODO: adjust AWB_SECTION_SEPARATOR for real DHL format.
   */
  private extractAWBSections(text: string): string[] {
    const parts = text.split(AWB_SECTION_SEPARATOR).filter(s => s.trim().length > 0)
    return parts.length > 1 ? parts.slice(1) : parts // skip header block
  }

  /**
   * Parses a single AWB section string into a ParsedAWB.
   * TODO: add weight extraction once field positions are confirmed.
   */
  private parseAWBSection(section: string): ParsedAWB {
    const awbNumber    = this.extractAWBNumber(section) ?? ''
    const charges      = this.extractCharges(section)
    const destination  = this.extractDestination(section)
    const shipmentDate = this.extractDate(section)

    const awb: ParsedAWB = {
      awbNumber,
      shipmentDate,
      destinationCountry: destination?.country,
      destinationCity:    destination?.city,
      charges,
      rawText:    section,
      confidence: 0,
    }

    awb.confidence = this.calculateConfidence(awb)
    return awb
  }

  /**
   * Extracts the AWB (air waybill) tracking number from a section.
   * DHL: 10–12 consecutive digits (e.g. "1234567890" or "12345678901").
   */
  private extractAWBNumber(section: string): string | null {
    const m = section.match(AWB_NUMBER_REGEX)
    return m ? m[1] : null
  }

  /**
   * Extracts all charge lines from an AWB section.
   * Each line is matched against CHARGE_PATTERNS; unmatched lines become 'other_charges'.
   * TODO: verify against real DHL layout — amounts may appear on the same or next line.
   */
  private extractCharges(section: string): ParsedAWBCharge[] {
    const charges: ParsedAWBCharge[] = []
    const lines = section.split('\n')

    for (const line of lines) {
      const amountMatch = line.match(AMOUNT_ON_LINE_REGEX)
      if (!amountMatch) continue
      const amount = parseFloat(amountMatch[1].replace(/,/g, ''))
      if (!isFinite(amount) || amount <= 0) continue

      let label = line.replace(AMOUNT_ON_LINE_REGEX, '').trim()
      let confidence = 0.5 // default for unmatched lines

      for (const { field, pattern } of CHARGE_PATTERNS) {
        if (pattern.test(line)) {
          label = field
          confidence = 0.85
          break
        }
      }

      charges.push({ label, amount, confidence })
    }

    return charges
  }

  /**
   * Attempts to extract destination city and country from the AWB section.
   * TODO: DHL typically shows "To: CITY, COUNTRY" — adjust regex to match.
   */
  private extractDestination(section: string): { city?: string; country?: string } | null {
    const m = section.match(/(?:to|destination)[:\s]+([A-Z][A-Za-z\s]+),\s*([A-Z]{2,3})/i)
    if (!m) return null
    return { city: m[1].trim(), country: m[2].trim().toUpperCase() }
  }

  /**
   * Extracts a date string from the section using common date formats.
   * Returns ISO YYYY-MM-DD or undefined.
   */
  private extractDate(section: string): string | undefined {
    const m = section.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
    if (!m) return undefined
    return this.normaliseDate(`${m[1]}/${m[2]}/${m[3]}`)
  }

  /**
   * Extracts a single header field using the provided pattern.
   * Returns the first capture group, or null.
   */
  private extractHeaderField(text: string, pattern: RegExp): string | null {
    const m = text.match(pattern)
    return m ? m[1].trim() : null
  }

  /** Detects the invoice currency from ISO 3-letter codes in the text. */
  private extractCurrency(text: string): string | undefined {
    const m = text.match(/\b(INR|USD|EUR|AED|GBP|JPY|CNY)\b/)
    return m ? m[1] : undefined
  }

  /**
   * Converts common date formats to ISO YYYY-MM-DD.
   * TODO: handle more locale formats (DD-MMM-YYYY, MMM DD YYYY).
   */
  private normaliseDate(raw: string): string {
    const parts = raw.split(/[\/\-\.]/)
    if (parts.length !== 3) return raw
    const [d, m, y] = parts
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  /**
   * Scores an AWB based on how much data was successfully extracted.
   *   - +0.40 if AWB number found
   *   - +0.30 if at least one charge found
   *   - +0.15 if destination extracted
   *   - +0.15 if shipment date extracted
   * Charge-level confidence then averaged in for final score.
   */
  private calculateConfidence(awb: ParsedAWB): number {
    let score = 0
    if (awb.awbNumber)        score += 0.40
    if (awb.charges.length)   score += 0.30
    if (awb.destinationCity)  score += 0.15
    if (awb.shipmentDate)     score += 0.15

    if (awb.charges.length > 0) {
      const avgChargeConf = awb.charges.reduce((s, c) => s + c.confidence, 0) / awb.charges.length
      score = score * 0.7 + avgChargeConf * 0.3
    }

    return Math.round(score * 100) / 100
  }
}
