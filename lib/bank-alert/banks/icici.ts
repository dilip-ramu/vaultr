import { registerBankParser, normalizeCurrency, extractDate, type EmailInput, type ParsedAlert } from '../parse'

// ── ICICI Bank Credit Card alert ─────────────────────────────────────────────
// Sample:
//   Your ICICI Bank Credit Card XX0015 has been used for a transaction of
//   INR 3,808.67 on Jun 12, 2026 at 05:44:02. Info: TIRUPUR LORRY URIMAIYA.

const CUR = '(INR|USD|EUR|GBP|AED|SGD|Rs\\.?|₹)'

function iciciCreditCard(email: EmailInput): ParsedAlert | null {
  const text = `${email.subject}\n${email.body}`

  // GATE: only real transaction emails. A spend says "used for a transaction";
  // a credit says "payment received"/"credited". Anything else (EMI promos,
  // statements, OTPs) is skipped — returns null so it never becomes a draft.
  const isSpend = /has been used for a transaction/i.test(text)
  const isCredit = /\b(payment received|received towards|has been credited|amount credited)\b/i.test(text)
  if (!isSpend && !isCredit) return null

  // Amount + currency. Anchor to the transaction/payment phrase so we never
  // pick up the "Credit Limit" figures lower in the email.
  const amt =
    text.match(new RegExp(`(?:transaction of|payment of|amount of|credited with|of)\\s+${CUR}\\s*([\\d,]+(?:\\.\\d+)?)`, 'i'))
  if (!amt) return null
  const amount = parseFloat(amt[2].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null

  const card = text.match(/Credit Card\s+[xX*•]+\s*(\d{4})/)
  const info = text.match(/Info:\s*([^.\n]+?)\s*(?:\.|$)/i)

  return {
    amount,
    currency: normalizeCurrency(amt[1]),
    direction: isCredit ? 'credit' : 'debit',
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
