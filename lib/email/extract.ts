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

/**
 * Extracts structured invoice fields from the email body text using Claude.
 * The email body is a reliable, human-written summary of the invoice —
 * far safer than parsing a PDF which may contain multiple figures.
 * The original PDF remains untouched as the official document.
 */
export async function extractFromEmailBody(
  emailBody: string,
  senderEmail: string,
): Promise<ExtractedInvoice | null> {
  if (!emailBody?.trim()) return null

  try {
    // Truncate to 8000 chars — more than enough for any email body
    const bodyText = emailBody.slice(0, 8000)

    const prompt = `You are extracting invoice details from a supplier email. The supplier sent this email to communicate invoice information. Extract the fields below and return ONLY valid JSON — no explanation, no markdown.

Sender email: ${senderEmail}

Email body:
${bodyText}

Return JSON with these keys (use null for any field not clearly stated):
{
  "supplier_name": "company name from email signature or sender",
  "invoice_number": "invoice/bill number",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "currency": "3-letter code e.g. INR, USD, EUR",
  "amount": number (total invoice amount, no currency symbol),
  "gst_amount": number or null,
  "reference": "PO number or reference number if present"
}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error('[extract] Anthropic API error:', res.status)
      return null
    }

    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? '{}'

    // Extract JSON from between first { and last }
    let extracted: Record<string, unknown> = {}
    try {
      const first = text.indexOf('{')
      const last  = text.lastIndexOf('}')
      if (first !== -1 && last > first) {
        extracted = JSON.parse(text.slice(first, last + 1))
      }
    } catch {
      extracted = {}
    }

    const supplier_name  = typeof extracted.supplier_name  === 'string' ? extracted.supplier_name  : null
    const invoice_number = typeof extracted.invoice_number === 'string' ? extracted.invoice_number : null
    const invoice_date   = typeof extracted.invoice_date   === 'string' ? extracted.invoice_date   : null
    const due_date       = typeof extracted.due_date       === 'string' ? extracted.due_date       : null
    const currency       = typeof extracted.currency       === 'string' ? extracted.currency       : null
    const reference      = typeof extracted.reference      === 'string' ? extracted.reference      : null
    const amount     = typeof extracted.amount     === 'number' && !isNaN(extracted.amount as number)     ? extracted.amount as number     : null
    const gst_amount = typeof extracted.gst_amount === 'number' && !isNaN(extracted.gst_amount as number) ? extracted.gst_amount as number : null

    // Confidence: based on the 4 key fields that must be present
    const keyFields = [supplier_name, invoice_number, invoice_date, amount]
    const present   = keyFields.filter(f => f !== null).length
    const confidence = present === 4 ? 1.0 : present === 3 ? 0.75 : present === 2 ? 0.5 : 0.25

    return {
      supplier_name, invoice_number, invoice_date, due_date,
      currency, amount, gst_amount, reference,
      confidence,
      raw_text: bodyText,   // store the email body text for audit
    }
  } catch (err) {
    console.error('[extract] Unexpected error:', (err as Error).message)
    return null
  }
}
