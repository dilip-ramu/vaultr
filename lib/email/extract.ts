export interface ExtractedInvoice {
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  currency: string | null
  amount: number | null
  gst_amount: number | null
  reference: string | null
  confidence: number
  raw_text: string
}

// ── Month name → number ───────────────────────────────────────────────────────
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseDate(raw: string): string | null {
  // Handles: "27 May 2026", "27-05-2026", "27/05/2026", "2026-05-27"
  raw = raw.trim()

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // "27 May 2026" or "27-May-2026"
  const dmy = raw.match(/^(\d{1,2})[\s\-\/]([A-Za-z]+)[\s\-\/](\d{4})$/)
  if (dmy) {
    const month = MONTHS[dmy[2].toLowerCase().slice(0, 3)]
    if (month) return `${dmy[3]}-${month}-${dmy[1].padStart(2, '0')}`
  }

  // "27/05/2026" or "27-05-2026"
  const dmyn = raw.match(/^(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})$/)
  if (dmyn) return `${dmyn[3]}-${dmyn[2]}-${dmyn[1].padStart(2, '0')}`

  return null
}

function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// ── Fast regex extractor — no API call ───────────────────────────────────────
// Reads the structured banner that suppliers like DHL put at the top of their
// emails: "Invoice TNSIR00563751  Inv. Date  27 May 2026  Total  ₹ 9871.29"
// Also reads the subject line for invoice numbers.

function fastExtract(emailBody: string): Partial<ExtractedInvoice> {
  const result: Partial<ExtractedInvoice> = {}

  // ── Invoice number ──────────────────────────────────────────────────────────
  // From subject line: "Your latest DHL invoice: TNSIR00563751 for account..."
  const subjectInv = emailBody.match(/invoice[:\s]+([A-Z0-9]{5,})/i)
  // From banner table: "Invoice\nTNSIR00563751" or "Invoice TNSIR00563751"
  const bannerInv  = emailBody.match(/Invoice\s+([A-Z0-9]{5,})/i)
  // Generic: invoice number / invoice no
  const genericInv = emailBody.match(/(?:invoice\s*(?:no\.?|number|#)[\s:]+)([A-Z0-9\-\/]{4,})/i)

  result.invoice_number = (subjectInv ?? bannerInv ?? genericInv)?.[1] ?? null

  // ── Invoice date ──────────────────────────────────────────────────────────────
  // HTML tables put label and value in separate cells/rows, so after stripping
  // the layout is: "Inv. Date  Total  <invoice_no>  27 May 2026  ₹ amount"
  // We use a loose match that allows up to 200 chars between the label and value.
  const datePatterns = [
    // Loose: label then value anywhere within 200 chars (handles table layouts)
    /Inv\.?\s*Date[\s\S]{0,200}?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
    /Inv\.?\s*Date[\s\S]{0,200}?(\d{1,2}[\-\/]\d{2}[\-\/]\d{4})/i,
    // "dated 27 May 2026" in plain-text paragraph
    /dated?\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
    // Generic label
    /(?:invoice\s+date|date of invoice)[\s:]+(\d{1,2}[\s\-\/][A-Za-z]+[\s\-\/]\d{4})/i,
    // "DATE 27/05/2026"
    /\bDATE\s+(\d{2}\/\d{2}\/\d{4})/,
  ]
  for (const pat of datePatterns) {
    const m = emailBody.match(pat)
    if (m) {
      result.invoice_date = parseDate(m[1])
      if (result.invoice_date) break
    }
  }

  // ── Total amount ──────────────────────────────────────────────────────────────
  // DHL HTML table: "Total" label and "₹ 9871.29" value are in separate cells,
  // so stripped text looks like: "Total  Pay  TNSIR...  27 May 2026  ₹ 9871.29"
  // Strategy: find ₹ symbol directly (all invoices are INR per user confirmation),
  // then fall back to labeled patterns for other currencies.
  const rupeeMatch = emailBody.match(/₹\s*([\d,]+(?:\.\d{1,2})?)/)
  if (rupeeMatch) {
    result.amount = parseAmount(rupeeMatch[1])
    result.currency = 'INR'
  } else {
    const amountPatterns = [
      // Loose: label then ₹/$/€ value within 300 chars (handles table layouts)
      /Total[\s\S]{0,300}?[₹$€£]\s*([\d,]+\.\d{2})/i,
      /AMOUNT\s+DUE\s+([\d,]+\.\d{2})/i,
      /(?:grand\s+total|net\s+total|total\s+amount)[\s:₹$€£]+([\d,]+\.\d{2})/i,
    ]
    for (const pat of amountPatterns) {
      const m = emailBody.match(pat)
      if (m) {
        result.amount = parseAmount(m[1])
        if (result.amount !== null) break
      }
    }
  }

  // ── Currency ──────────────────────────────────────────────────────────────────
  if (/₹/.test(emailBody))        result.currency = 'INR'
  else if (/\$/.test(emailBody))  result.currency = 'USD'
  else if (/€/.test(emailBody))   result.currency = 'EUR'
  else if (/£/.test(emailBody))   result.currency = 'GBP'

  // ── GST ──────────────────────────────────────────────────────────────────────
  const gstMatch = emailBody.match(/(?:CGST|SGST|GST|TAX)\s+[₹$€£]?\s*([\d,]+\.\d{2})/i)
  if (gstMatch) result.gst_amount = parseAmount(gstMatch[1])

  // ── Supplier name — from signature / "Sincerely, The X Team" ─────────────────
  const sincerely = emailBody.match(/(?:Sincerely|Regards|Thanks)[,\s]+(?:The\s+)?([^\n]{3,50})/i)
  if (sincerely) result.supplier_name = sincerely[1].trim().replace(/\s+Team$/, '').trim()

  return result
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function scoreConfidence(r: Partial<ExtractedInvoice>): number {
  const key = [r.invoice_number, r.invoice_date, r.amount]
  const present = key.filter(f => f !== null && f !== undefined).length
  return present === 3 ? 1.0 : present === 2 ? 0.75 : present === 1 ? 0.5 : 0.25
}

// ── Claude fallback — only called when regex misses key fields ────────────────

async function claudeExtract(
  emailBody: string,
  senderEmail: string,
): Promise<Partial<ExtractedInvoice>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured — add it to your Vercel environment variables')
  }

  const prompt = `Extract invoice details from this supplier email. Return ONLY valid JSON, no markdown.

Sender: ${senderEmail}

Email:
${emailBody.slice(0, 4000)}

JSON keys (null if not found):
{
  "supplier_name": "company name",
  "invoice_number": "invoice number",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "currency": "INR/USD/EUR/GBP",
  "amount": number,
  "gst_amount": number
}`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    throw new Error(`Network error reaching Anthropic API: ${(err as Error).message}`)
  }

  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch { /* ignore */ }
    throw new Error(`Anthropic API returned ${res.status}: ${detail.slice(0, 200)}`)
  }

  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? '{}'

  let parsed: Record<string, unknown> = {}
  try {
    const first = text.indexOf('{')
    const last  = text.lastIndexOf('}')
    if (first !== -1 && last > first) parsed = JSON.parse(text.slice(first, last + 1))
  } catch { /* ignore */ }

  return {
    supplier_name:  typeof parsed.supplier_name  === 'string' ? parsed.supplier_name  : null,
    invoice_number: typeof parsed.invoice_number === 'string' ? parsed.invoice_number : null,
    invoice_date:   typeof parsed.invoice_date   === 'string' ? parsed.invoice_date   : null,
    due_date:       typeof parsed.due_date        === 'string' ? parsed.due_date       : null,
    currency:       typeof parsed.currency        === 'string' ? parsed.currency       : null,
    amount:     typeof parsed.amount     === 'number' ? parsed.amount     : null,
    gst_amount: typeof parsed.gst_amount === 'number' ? parsed.gst_amount : null,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extracts invoice fields from email body text.
 * 1. Tries fast regex parsing (no API cost) — reads the structured banner.
 * 2. Falls back to Claude only if invoice_number, date, or amount is still missing.
 */
export async function extractFromEmailBody(
  emailBody: string,
  senderEmail: string,
): Promise<ExtractedInvoice> {
  const bodyText = (emailBody ?? '').slice(0, 8000) || '(no email body)'

  // Step 1: regex
  const fast = fastExtract(bodyText)
  const fastConfidence = scoreConfidence(fast)

  // If regex got all three key fields, return immediately — no API call needed
  if (fast.invoice_number && fast.invoice_date && fast.amount !== null) {
    return {
      supplier_name:  fast.supplier_name  ?? null,
      invoice_number: fast.invoice_number,
      invoice_date:   fast.invoice_date,
      due_date:       fast.due_date       ?? null,
      currency:       fast.currency       ?? null,
      amount:         fast.amount         ?? null,
      gst_amount:     fast.gst_amount     ?? null,
      reference:      null,
      confidence:     fastConfidence,
      raw_text:       bodyText,
    }
  }

  // Step 2: Claude fallback for anything regex missed
  const ai = await claudeExtract(bodyText, senderEmail)

  const supplier_name  = fast.supplier_name  ?? ai.supplier_name  ?? null
  const invoice_number = fast.invoice_number ?? ai.invoice_number ?? null
  const invoice_date   = fast.invoice_date   ?? ai.invoice_date   ?? null
  const due_date       = fast.due_date       ?? ai.due_date       ?? null
  const currency       = fast.currency       ?? ai.currency       ?? null
  const amount         = fast.amount         ?? ai.amount         ?? null
  const gst_amount     = fast.gst_amount     ?? ai.gst_amount     ?? null

  return {
    supplier_name, invoice_number, invoice_date, due_date,
    currency, amount, gst_amount,
    reference: null,
    confidence: scoreConfidence({ invoice_number, invoice_date, amount }),
    raw_text: bodyText,
  }
}
