import { registerBankParser, extractDate, type EmailInput, type ParsedAlert } from '../parse'

// ── HDFC Bank ────────────────────────────────────────────────────────────────
// HDFC sends alerts from two distinct addresses, each with its own format:
//
//   alerts@hdfcbank.net      → bank / credit-card alerts (Sample A, C)
//   alerts@hdfcbank.bank.in  → UPI / account debit alerts (Sample B)
//
// Sample A (credit card spend) — from alerts@hdfcbank.net:
//   Rs.1308.00 is debited from your HDFC Bank Credit Card ending 7667 towards
//   RHR HOTELS COIMBATORE on 02 Oct, 2025 at 15:31:04.
// Sample B (UPI / account debit) — from alerts@hdfcbank.bank.in:
//   Rs.56000.00 has been debited from account **2172 to account **0456 on
//   03-08-24. Your UPI transaction reference number is 421669856335.
// Sample C (declined — MUST be ignored) — from alerts@hdfcbank.net:
//   ...a transaction of Rs.8173.00 on your HDFC Bank Credit Card 7667 was
//   declined at AMARILLY DESIGNER STUD.

const HDFC_SENDERS = ['alerts@hdfcbank.net', 'alerts@hdfcbank.bank.in'] as const

/** Bank / credit-card format — alerts@hdfcbank.net.
 *  "Rs.X debited from your HDFC Bank Credit Card ending NNNN towards MERCHANT on DATE". */
function parseHdfcBankCard(email: EmailInput): ParsedAlert | null {
  const text = `${email.subject}\n${email.body}`

  // Skip non-completed transactions (declined / failed / reversed / promo)
  if (/\b(declined|failed|unsuccessful|not processed|reversed)\b/i.test(text)) return null

  const debit = /\bdebited\b/i.test(text)
  const credit = /\bcredited\b/i.test(text)
  if (!debit && !credit) return null
  const direction: 'debit' | 'credit' = credit && !debit ? 'credit' : 'debit'

  // Amount: "Rs.1308.00"
  const amt = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i)
  if (!amt) return null
  const amount = parseFloat(amt[1].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null

  // Last-4 from credit card "ending 7667", fallback to account "**1234"
  const card = text.match(/Credit Card\s+(?:ending\s+)?[*xX•]*\s*(\d{4})/i)
  const acct = text.match(/from\s+account\s+[*xX•]+\s*(\d{4})/i) || text.match(/\baccount\s+[*xX•]+\s*(\d{4})/i)
  const partialAccount = card ? card[1] : (acct ? acct[1] : null)

  // Merchant after "towards ... on"
  const towards = text.match(/towards\s+([A-Za-z0-9&._@\- ]{2,50}?)\s+on\b/i)
  const merchant = towards ? towards[1].trim() : null

  return {
    amount,
    currency: 'INR',
    direction,
    partialAccount,
    merchant,
    date: extractDate(text, email.receivedAt),
    confidence: 0.95,
  }
}

/** UPI format — alerts@hdfcbank.bank.in.
 *  "Rs.X has been debited from account **AAAA to account **BBBB on DATE. Your UPI transaction reference …". */
function parseHdfcUpi(email: EmailInput): ParsedAlert | null {
  const text = `${email.subject}\n${email.body}`

  if (/\b(declined|failed|unsuccessful|not processed|reversed)\b/i.test(text)) return null

  const debit = /\bdebited\b/i.test(text)
  const credit = /\bcredited\b/i.test(text)
  if (!debit && !credit) return null
  const direction: 'debit' | 'credit' = credit && !debit ? 'credit' : 'debit'

  // Amount: "Rs.56000.00"
  const amt = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i)
  if (!amt) return null
  const amount = parseFloat(amt[1].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null

  // Source a/c after "from account **NNNN"
  const fromAcct = text.match(/from\s+account\s+[*xX•]+\s*(\d{4})/i)
  const partialAccount = fromAcct ? fromAcct[1] : null

  // Counterparty after "to account **NNNN"
  let merchant: string | null = null
  const toAcct = text.match(/to\s+account\s+[*xX•]+\s*(\d{4})/i)
  if (toAcct) merchant = `UPI to a/c ••${toAcct[1]}`

  return {
    amount,
    currency: 'INR',
    direction,
    partialAccount,
    merchant,
    date: extractDate(text, email.receivedAt),
    confidence: 0.95,
  }
}

/** Route by sender; fall back to format detection if a future variant appears. */
function hdfc(email: EmailInput): ParsedAlert | null {
  const from = email.from.toLowerCase()
  if (from.includes('hdfcbank.bank.in')) return parseHdfcUpi(email)
  if (from.includes('hdfcbank.net')) return parseHdfcBankCard(email)
  // Subject/body-matched (no sender hint) — try card first, then UPI
  return parseHdfcBankCard(email) ?? parseHdfcUpi(email)
}

registerBankParser({
  id: 'hdfc',
  matches: (email) => {
    const from = email.from.toLowerCase()
    if (HDFC_SENDERS.some(s => from.includes(s))) return true
    if (from.includes('hdfcbank')) return true                   // any other hdfcbank.* sender
    return /\bhdfc bank\b/i.test(email.subject + email.body)
  },
  parse: hdfc,
})
