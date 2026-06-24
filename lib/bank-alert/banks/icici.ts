import { registerBankParser, normalizeCurrency, extractDate, type EmailInput, type ParsedAlert } from '../parse'

// ── ICICI Bank Credit Card alert ─────────────────────────────────────────────
// Sample:
//   Your ICICI Bank Credit Card XX0015 has been used for a transaction of
//   INR 3,808.67 on Jun 12, 2026 at 05:44:02. Info: TIRUPUR LORRY URIMAIYA.

function iciciCreditCard(email: EmailInput): ParsedAlert | null {
  const text = `${email.subject}\n${email.body}`

  // amount + currency: "transaction of INR 3,808.67"
  const amt = text.match(/transaction of\s+(INR|USD|EUR|GBP|AED|SGD|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i)
  if (!amt) return null
  const amount = parseFloat(amt[2].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null

  // card last 4: "Credit Card XX0015"
  const card = text.match(/Credit Card\s+[xX*•]+\s*(\d{4})/)

  // merchant: "Info: TIRUPUR LORRY URIMAIYA." — stop at the period
  const info = text.match(/Info:\s*([^.\n]+?)\s*(?:\.|$)/i)

  // ICICI credit-card "has been used for a transaction" = a spend (debit).
  // A refund/reversal would read "credited"/"reversed".
  const direction: 'debit' | 'credit' = /\b(credited|reversed|refund)\b/i.test(text) ? 'credit' : 'debit'

  return {
    amount,
    currency: normalizeCurrency(amt[1]),
    direction,
    partialAccount: card ? card[1] : null,
    merchant: info ? info[1].trim() : null,
    date: extractDate(text, email.receivedAt),
    confidence: 0.97,
  }
}

registerBankParser({
  id: 'icici-credit-card',
  matches: (email) =>
    email.from.includes('icici') &&
    /icici bank credit card/i.test(`${email.subject} ${email.body}`),
  parse: iciciCreditCard,
})
