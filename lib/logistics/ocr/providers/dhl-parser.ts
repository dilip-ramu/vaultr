/**
 * DHL (and FedEx) courier invoice parser — regex-based.
 *
 * DHL Express invoice PDF text-layer structure (as produced by pdf-parse):
 *
 *   INVOICE
 *   Invoice No.  1234567890          Invoice Date  01/01/2025
 *   Account No.  123456789
 *   ...
 *   Shipment detail
 *   AWB No.     Shipper Ref   Ship Date    Dest  Pcs  Weight    Amount
 *   1234567890  REF001        01 Jan 25    AE    2    5.00 KG   1500.00
 *     Freight                                                    1200.00
 *     Fuel Surcharge                                              200.00
 *     Demand Surcharge                                             50.00
 *     GoGreen Surcharge                                            30.00
 *     Tax/GST 18%                                                  20.00
 *   ...
 *   Invoice Total  INR  15000.00
 *
 * FedExParser extends this class — the tabular format is identical,
 * AWB numbers are 12 digits, and the same charge labels apply.
 */

import type { CourierParser, ParsedAWB, ParsedAWBCharge, ParsedCourierInvoice } from '../types'

// ── Regex constants ────────────────────────────────────────

/** DHL AWB numbers are 10–12 digits; FedEx 12 digits. Both are captured. */
const AWB_NUMBER_REGEX = /\b(\d{10,12})\b/

/** A line whose first non-space token is a 10–12 digit AWB number starts a new section. */
const AWB_HEADER_LINE_REGEX = /^\d{10,12}\b/

/**
 * Date formats in DHL/FedEx header lines:
 *   "01 Jan 25"  /  "01 Jan 2025"
 */
const DATE_LONG_REGEX = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})\b/i

/** Fallback date: DD/MM/YYYY or DD-MM-YYYY */
const DATE_SHORT_REGEX = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/

/** Pieces and chargeable weight on the AWB header line: "2  5.00 KG" */
const PIECES_WEIGHT_REGEX = /\b(\d+)\s+([\d.]+)\s*KG\b/i

/**
 * Charge lines are indented (≥2 leading spaces) and end with a decimal monetary amount.
 * The amount must contain a decimal point (eliminates page-number false positives).
 */
const CHARGE_LINE_REGEX = /^[ \t]{2,}(.+?)\s{2,}([\d,]+\.\d+)\s*$/

/**
 * Charge label → AWB column mapping.
 * Ordered most-specific first so the first match wins.
 */
const CHARGE_PATTERNS: Array<{ field: string; pattern: RegExp }> = [
  { field: 'fuel_surcharge',     pattern: /(?:fuel|energy)\s+surcharge/i },
  { field: 'demand_surcharge',   pattern: /(?:demand|peak)\s+surcharge/i },
  { field: 'gogreen_surcharge',  pattern: /(?:go\s*green|gogreen|environmental|carbon|eco)/i },
  { field: 'remote_area_charge', pattern: /(?:remote\s+area|ras\b|extended\s+(?:area|delivery|service))/i },
  { field: 'tax_amount',         pattern: /^(?:gst|vat|tax)\b/i },
  { field: 'other_charges',      pattern: /(?:additional\s+(?:handling|charge)|residential|address\s+correction|emergency|covid|misc|handling\s+fee)/i },
  // Freight / base charge — least specific, must come last
  { field: 'shipment_charge',    pattern: /(?:^freight$|^shipment\s+charge|transportation|express\s+charge|base\s+charge)/i },
]

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// ── ISO 3-letter currency codes to skip during destination detection ──
const CURRENCY_CODES = new Set(['INR', 'USD', 'EUR', 'AED', 'GBP', 'JPY', 'CNY', 'SGD', 'AUD', 'CAD'])

// ── Parser ─────────────────────────────────────────────────

export class DHLParser implements CourierParser {
  readonly providerName: string = 'DHL'

  parse(rawText: string): ParsedCourierInvoice {
    const lines = rawText.split('\n')

    // Invoice-level header fields
    const invoiceNumber = this.extractHeaderField(rawText, /invoice\s+no\.?\s+([\w\-]+)/i)
    const invDateRaw    = this.extractHeaderField(rawText, /invoice\s+date\s+(\d{1,2}[\/\s]\w+[\/\s]\d{2,4})/i)
    const invoiceDate   = invDateRaw ? this.normaliseDate(invDateRaw) : undefined
    const currency      = this.extractCurrency(rawText)

    // "Invoice Total  INR  15000.00"  or  "Total Charges  USD  9850.00"
    const totalMatch  = rawText.match(/(?:invoice\s+total|total\s+charges?)\s+([A-Z]{3})\s+([\d,]+\.?\d*)/i)
    const totalAmount = totalMatch ? parseFloat(totalMatch[2].replace(/,/g, '')) : undefined

    const sections = this.splitIntoAWBSections(lines)
    const awbs = sections
      .map(s => this.parseAWBSection(s))
      .filter(a => a.awbNumber !== '')

    const overallConfidence = awbs.length > 0
      ? awbs.reduce((s, a) => s + a.confidence, 0) / awbs.length
      : 0

    return {
      provider:      this.providerName,
      invoiceNumber: invoiceNumber ?? undefined,
      invoiceDate,
      currency,
      totalAmount,
      awbs,
      rawData:     rawText,
      parseMethod: 'regex',
      confidence:  overallConfidence,
    }
  }

  // ── Section splitting ────────────────────────────────────

  /**
   * Groups lines into AWB sections. A new section begins whenever a line
   * (after trimming) starts with a 10–12 digit AWB number.
   */
  private splitIntoAWBSections(lines: string[]): string[][] {
    const sections: string[][] = []
    let current: string[] | null = null

    for (const line of lines) {
      if (AWB_HEADER_LINE_REGEX.test(line.trim())) {
        if (current && current.length > 0) sections.push(current)
        current = [line]
      } else if (current !== null) {
        current.push(line)
      }
    }
    if (current && current.length > 0) sections.push(current)
    return sections
  }

  // ── Section parser ───────────────────────────────────────

  private parseAWBSection(lines: string[]): ParsedAWB {
    const { awbNumber, date, destination, pieces, weight } = this.parseHeaderLine(lines[0] ?? '')
    const charges = this.extractCharges(lines.slice(1))

    const awb: ParsedAWB = {
      awbNumber,
      shipmentDate:       date,
      destinationCountry: destination,
      destinationCity:    undefined,
      chargeableWeight:   weight,
      charges,
      // Embed piece count as a comment in rawText; normalizer sets total_pieces=0 for manual review
      rawText: pieces !== undefined
        ? `[ocr:pieces=${pieces}]\n` + lines.join('\n')
        : lines.join('\n'),
      confidence: 0,
    }

    awb.confidence = this.calculateConfidence(awb)
    return awb
  }

  // ── Header line parser ───────────────────────────────────

  /**
   * Parses the first line of an AWB section.
   * Column layout (DHL Express): AWB#  ShipperRef  DD Mon YY  DEST  Pcs  Weight KG  Amount
   */
  private parseHeaderLine(line: string): {
    awbNumber: string
    date?:        string
    destination?: string
    pieces?:      number
    weight?:      number
  } {
    const t = line.trim()

    const awbMatch  = t.match(AWB_NUMBER_REGEX)
    const awbNumber = awbMatch ? awbMatch[1] : ''

    // Date — prefer "DD Mon YYYY" form, fall back to "DD/MM/YYYY"
    let date: string | undefined
    const longDate = t.match(DATE_LONG_REGEX)
    if (longDate) {
      const d = longDate[1].padStart(2, '0')
      const m = MONTH_MAP[longDate[2].toLowerCase()] ?? '01'
      const y = longDate[3].length === 2 ? `20${longDate[3]}` : longDate[3]
      date = `${y}-${m}-${d}`
    } else {
      const short = t.match(DATE_SHORT_REGEX)
      if (short) date = this.normaliseDate(`${short[1]}/${short[2]}/${short[3]}`)
    }

    // Pieces + chargeable weight: "2  5.00 KG"
    const pw     = t.match(PIECES_WEIGHT_REGEX)
    const pieces = pw ? parseInt(pw[1], 10) : undefined
    const weight = pw ? parseFloat(pw[2]) : undefined

    // Destination: last 2–3 letter uppercase token immediately before the "N X.XX KG" pattern
    let destination: string | undefined
    if (pw) {
      const beforePW = t.slice(0, t.indexOf(pw[0]))
      const destMatch = beforePW.match(/\b([A-Z]{2,3})\s*$/)
      if (destMatch && !CURRENCY_CODES.has(destMatch[1]) && destMatch[1] !== 'AWB') {
        destination = destMatch[1]
      }
    }

    return { awbNumber, date, destination, pieces, weight }
  }

  // ── Charge extractor ─────────────────────────────────────

  /**
   * Parses indented charge lines (label … amount) into ParsedAWBCharge[].
   * Label is resolved to an AWB column key; unknown labels go to 'other_charges'.
   */
  private extractCharges(lines: string[]): ParsedAWBCharge[] {
    const charges: ParsedAWBCharge[] = []

    for (const line of lines) {
      const m = line.match(CHARGE_LINE_REGEX)
      if (!m) continue

      const rawLabel = m[1].trim()
      const amount   = parseFloat(m[2].replace(/,/g, ''))
      if (!isFinite(amount) || amount <= 0 || rawLabel.length < 2) continue

      let field      = 'other_charges'
      let confidence = 0.5

      for (const { field: f, pattern } of CHARGE_PATTERNS) {
        if (pattern.test(rawLabel)) {
          field      = f
          confidence = 0.85
          break
        }
      }

      charges.push({ label: field, amount, confidence })
    }

    return charges
  }

  // ── Helpers ──────────────────────────────────────────────

  private extractHeaderField(text: string, pattern: RegExp): string | null {
    const m = text.match(pattern)
    return m ? m[1].trim() : null
  }

  private extractCurrency(text: string): string | undefined {
    const m = text.match(/\b(INR|USD|EUR|AED|GBP|JPY|CNY|SGD|AUD|CAD)\b/)
    return m ? m[1] : undefined
  }

  /**
   * Normalises several date formats to ISO YYYY-MM-DD.
   * Handles: DD/MM/YYYY, DD-MM-YYYY, DD Mon YY(YY)
   */
  private normaliseDate(raw: string): string {
    const parts = raw.trim().split(/[\/\-\.\s]+/)
    if (parts.length < 3) return raw
    const [d, m, y] = parts
    const year  = y.length === 2 ? `20${y}` : y
    const month = isNaN(Number(m))
      ? (MONTH_MAP[m.toLowerCase()] ?? '01')
      : m.padStart(2, '0')
    return `${year}-${month}-${d.padStart(2, '0')}`
  }

  /**
   * Confidence scoring (0–1):
   *   +0.40  AWB number present
   *   +0.30  at least one charge extracted
   *   +0.15  destination country code identified
   *   +0.15  shipment date identified
   * Charge-level confidence is blended in at 30%.
   */
  private calculateConfidence(awb: ParsedAWB): number {
    let score = 0
    if (awb.awbNumber)          score += 0.40
    if (awb.charges.length > 0) score += 0.30
    if (awb.destinationCountry) score += 0.15
    if (awb.shipmentDate)       score += 0.15

    if (awb.charges.length > 0) {
      const avgChargeConf = awb.charges.reduce((s, c) => s + c.confidence, 0) / awb.charges.length
      score = score * 0.7 + avgChargeConf * 0.3
    }

    return Math.round(score * 100) / 100
  }
}

// ── FedEx parser ───────────────────────────────────────────

/**
 * FedEx invoices use the same tabular layout as DHL Express.
 * AWB tracking numbers are 12 digits. All charge patterns carry over.
 */
export class FedExParser extends DHLParser {
  readonly providerName = 'FedEx'
}
