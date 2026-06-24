import { registerBankParser, extractDate, type EmailInput, type ParsedAlert } from '../parse'

// ── Amazon Pay ───────────────────────────────────────────────────────────────
// Sample (no-reply@amazonpay.in):
//   Your payment to SWIGGY was Approved
//   Paid to: SWIGGY   Amount: ₹497.0
//   Seller: SWIGGY ... Payment date: Wednesday, 24 June, 2026 12:12:09 PM IST
//
// Amazon Pay emails carry no account number, so the draft is routed to the
// account set as this sender's default (set in the Senders panel).

function amazonPay(email: EmailInput): ParsedAlert | null {
  const text = `${email.subject}\n${email.body}`

  // GATE: a payment (debit) or money added to balance (credit). Skip the rest.
  const isPayment = /your payment to .+ was approved|paid to/i.test(text)
  const isCredit = /added to your (amazon pay )?balance|refund|cashback|received/i.test(text)
  if (!isPayment && !isCredit) return null

  // Amount: "₹497.0" (note: may have a single decimal place)
  const amt = text.match(/₹\s*([\d,]+(?:\.\d+)?)/) || text.match(/(?:rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i)
  if (!amt) return null
  const amount = parseFloat(amt[1].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null

  // Merchant: "payment to SWIGGY" or "Paid to SWIGGY" or "Seller SWIGGY"
  const m =
    text.match(/your payment to\s+([A-Za-z0-9&._@\- ]{2,40}?)\s+was\b/i) ||
    text.match(/Paid to\s*:?\s*([A-Za-z0-9&._@\- ]{2,40})/i) ||
    text.match(/Seller\s*:?\s*([A-Za-z0-9&._@\- ]{2,40})/i)

  return {
    amount,
    currency: 'INR',
    direction: isCredit ? 'credit' : 'debit',
    partialAccount: null,             // no account number — routed by sender default
    merchant: m ? m[1].trim() : null,
    date: extractDate(text, email.receivedAt),
    confidence: 0.95,
  }
}

registerBankParser({
  id: 'amazon-pay',
  matches: (email) => email.from.includes('amazonpay') || /amazon\s*pay/i.test(email.subject + email.body),
  parse: amazonPay,
})
