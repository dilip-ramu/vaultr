import type { SupabaseClient } from '@supabase/supabase-js'

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
 * Downloads a PDF from Supabase Storage, extracts text with pdf-parse,
 * then calls Claude Haiku to extract structured invoice fields.
 */
export async function extractFromPdf(
  storagePath: string,
  supabase: SupabaseClient
): Promise<ExtractedInvoice | null> {
  try {
    // 1. Download the PDF blob from storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from('vaultr-attachments')
      .download(storagePath)

    if (downloadError || !blob) {
      console.error('[extract] Download failed:', downloadError?.message)
      return null
    }

    // 2. Convert Blob to Buffer for pdf-parse
    const buffer = Buffer.from(await blob.arrayBuffer())

    // 3. Extract raw text with pdf-parse
    let rawText = ''
    try {
      // Dynamic import to avoid SSR bundling issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfMod = await import('pdf-parse') as any
      const pdfParse = pdfMod.default ?? pdfMod
      const parsed = await pdfParse(buffer)
      rawText = parsed.text ?? ''
    } catch (pdfErr) {
      console.error('[extract] pdf-parse error:', (pdfErr as Error).message)
      // If text extraction fails entirely, return null
      return null
    }

    if (!rawText.trim()) {
      return null
    }

    // 4. Truncate text to a reasonable size for the LLM call
    const truncatedText = rawText.slice(0, 4000)

    // 5. Call Claude Haiku to extract structured fields
    const prompt = `Extract invoice fields from this text and return ONLY valid JSON with keys: supplier_name, invoice_number, invoice_date (YYYY-MM-DD), due_date (YYYY-MM-DD), currency (3-letter code), amount (number), gst_amount (number), reference. Use null for missing fields.\n\nText:\n${truncatedText}`

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
      console.error('[extract] Anthropic API error:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const text = data.content?.[0]?.text ?? '{}'

    // 6. Parse JSON from Claude response (extract between first { and last })
    let extracted: Record<string, unknown> = {}
    try {
      const firstBrace = text.indexOf('{')
      const lastBrace = text.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = text.slice(firstBrace, lastBrace + 1)
        extracted = JSON.parse(jsonStr)
      }
    } catch (parseErr) {
      console.error('[extract] JSON parse error:', (parseErr as Error).message, 'text was:', text)
      extracted = {}
    }

    const supplier_name = typeof extracted.supplier_name === 'string' ? extracted.supplier_name : null
    const invoice_number = typeof extracted.invoice_number === 'string' ? extracted.invoice_number : null
    const invoice_date = typeof extracted.invoice_date === 'string' ? extracted.invoice_date : null
    const due_date = typeof extracted.due_date === 'string' ? extracted.due_date : null
    const currency = typeof extracted.currency === 'string' ? extracted.currency : null
    const amount = (typeof extracted.amount === 'number' && !isNaN(extracted.amount)) ? extracted.amount : null
    const gst_amount = (typeof extracted.gst_amount === 'number' && !isNaN(extracted.gst_amount)) ? extracted.gst_amount : null
    const reference = typeof extracted.reference === 'string' ? extracted.reference : null

    // 7. Calculate confidence based on key fields present
    const keyFields = [supplier_name, invoice_number, invoice_date, amount]
    const presentCount = keyFields.filter(f => f !== null).length
    let confidence: number
    if (presentCount === 4) confidence = 1.0
    else if (presentCount === 3) confidence = 0.75
    else if (presentCount === 2) confidence = 0.5
    else confidence = 0.25

    return {
      supplier_name,
      invoice_number,
      invoice_date,
      due_date,
      currency,
      amount,
      gst_amount,
      reference,
      confidence,
      raw_text: rawText,
    }
  } catch (err) {
    console.error('[extract] Unexpected error:', (err as Error).message)
    return null
  }
}
