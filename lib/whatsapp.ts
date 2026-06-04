// ── WhatsApp click-to-chat helpers ───────────────────────────────────────────
// Uses the official wa.me deep links (no API, no cost). The PDF must be
// attached manually by the sender — WhatsApp does not allow automatic
// attachments without the paid Business API.

/** Normalise a phone number for wa.me: digits only, with country code.
 *  10-digit numbers are assumed to be Indian (+91).
 *  Returns null when the number can't plausibly be a WhatsApp number. */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  // digits only, drop leading zeros (domestic format like 098765 43210)
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 10) return `91${digits}`        // assume India
  if (digits.length >= 11 && digits.length <= 15) return digits  // has country code
  return null
}

/** Build a wa.me click-to-chat URL with a prefilled message. */
export function buildWhatsAppUrl(rawNumber: string | null | undefined, message: string): string | null {
  const num = normalizeWhatsAppNumber(rawNumber)
  if (!num) return null
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
}

/** Prefilled message for a salary slip. */
export function salarySlipMessage(employeeName: string, monthLabel: string, netPayable: string): string {
  const firstName = employeeName.trim().split(/\s+/)[0]
  return `Hi ${firstName}, please find attached your salary slip for ${monthLabel}. Net payable: ${netPayable}.`
}
