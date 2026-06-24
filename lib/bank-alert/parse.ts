// ── Bank transaction alert parser ────────────────────────────────────────────
// Turns one bank alert email into structured fields. Built as a registry so
// each bank can have its own precise extractor; until a bank-specific parser is
// added, a generic Indian-bank heuristic handles the common patterns. We'll add
// exact per-bank parsers as we test each bank's real emails.

export interface ParsedAlert {
  amount: number | null
  direction: 'debit' | 'credit'
  partialAccount: string | null   // last 4 digits
  merchant: string | null
  date: string | null             // YYYY-MM-DD
  confidence: number              // 0..1
}

export interface EmailInput {
  from: string        // sender address (lowercased)
  subject: string
  body: string        // plain text body
  receivedAt?: string // ISO; fallback for date
}

// A bank parser: matches by sender, extracts fields.
export interface BankParser {
  id: string
  matches: (email: EmailInput) => boolean
  parse: (email: EmailInput) => ParsedAlert | null
}

// Per-bank parsers get registered here (filled in as we test each bank).
const REGISTRY: BankParser[] = []
export function registerBankParser(p: BankParser) { REGISTRY.push(p) }

// ── Generic heuristic helpers ────────────────────────────────────────────────

const DEBIT_WORDS = /\b(debited|debit|withdrawn|spent|paid|sent|purchase|deducted|charged)\b/i
const CREDIT_WORDS = /\b(credited|credit|received|deposited|refund|added)\b/i

/** Pull a money amount: "Rs. 1,234.56", "INR 1234", "₹1,03,428.15". */
export function extractAmount(text: string): number | null {
  const re = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
  const m = text.match(re)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Direction from wording — debit unless clearly a credit. */
export function extractDirection(text: string): 'debit' | 'credit' {
  const debit = DEBIT_WORDS.test(text)
  const credit = CREDIT_WORDS.test(text)
  if (credit && !debit) return 'credit'
  // If both appear, the first occurrence wins (e.g. "credited" vs "debited")
  if (credit && debit) {
    return (text.search(CREDIT_WORDS) < text.search(DEBIT_WORDS)) ? 'credit' : 'debit'
  }
  return 'debit'
}

/** Last 4 digits near an account/card reference: "a/c XX1234", "card ending 5678". */
export function extractPartialAccount(text: string): string | null {
  const patterns = [
    /(?:a\/c|acc(?:ount)?|account)\D{0,6}(?:x|\*|X|•|ending|no\.?)?\s*[xX*•\s]*?(\d{4})\b/i,
    /(?:card)\D{0,12}(?:ending|no\.?)?\s*[xX*•\s]*?(\d{4})\b/i,
    /[xX*•]{2,}\s*(\d{4})\b/,           // XXXX1234 / ****1234
    /ending\s+(?:in\s+)?(\d{4})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[1]
  }
  return null
}

/** Merchant / counterparty: after "at", "to", "VPA", "info:". Best-effort. */
export function extractMerchant(text: string): string | null {
  const patterns = [
    /\b(?:at|to|towards)\s+([A-Z0-9][A-Za-z0-9&._@\- ]{2,40}?)(?:\s+on\b|\.|,|;|\n|$)/,
    /\bvpa\s+([a-z0-9._\-]+@[a-z]+)/i,
    /\binfo[:\-]\s*([A-Za-z0-9&._@\- ]{2,40})/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const cleaned = m[1].trim().replace(/\s{2,}/g, ' ')
      if (cleaned.length >= 2) return cleaned
    }
  }
  return null
}

/** A date in the text, else the email's received date. */
export function extractDate(text: string, fallbackIso?: string): string | null {
  // dd-mm-yyyy / dd/mm/yy / dd Mon yyyy
  const dmy = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/)
  if (dmy) {
    let [, d, mo, y] = dmy
    if (y.length === 2) y = '20' + y
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
  const dMon = text.match(/\b(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})\b/)
  if (dMon) {
    const mo = months[dMon[2].toLowerCase()]
    if (mo) {
      let y = dMon[3]; if (y.length === 2) y = '20' + y
      return `${y}-${mo}-${dMon[1].padStart(2, '0')}`
    }
  }
  if (fallbackIso) return fallbackIso.slice(0, 10)
  return null
}

/** Generic parser used when no bank-specific parser matches. */
export function genericParse(email: EmailInput): ParsedAlert {
  const text = `${email.subject}\n${email.body}`
  const amount = extractAmount(text)
  const partialAccount = extractPartialAccount(text)
  const merchant = extractMerchant(text)
  // Confidence reflects how much we actually extracted
  let confidence = 0
  if (amount != null) confidence += 0.5
  if (partialAccount) confidence += 0.3
  if (merchant) confidence += 0.2
  return {
    amount,
    direction: extractDirection(text),
    partialAccount,
    merchant,
    date: extractDate(text, email.receivedAt),
    confidence: Math.round(confidence * 100) / 100,
  }
}

/** Parse an alert: use a registered bank parser if one matches, else generic. */
export function parseAlert(email: EmailInput): ParsedAlert | null {
  for (const p of REGISTRY) {
    if (p.matches(email)) {
      const r = p.parse(email)
      if (r) return r
    }
  }
  return genericParse(email)
}
