// Indian-system amount-to-words for cheques.
// 123456.75 → "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Five Paise Only"

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10), o = n % 10
  return TENS[t] + (o ? ' ' + ONES[o] : '')
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100
  const parts: string[] = []
  if (h) parts.push(ONES[h] + ' Hundred')
  if (rest) parts.push(twoDigits(rest))
  return parts.join(' ')
}

/** Convert a whole number (< 1 crore-crore) to Indian-system words. */
function wholeToWords(num: number): string {
  if (num === 0) return 'Zero'
  const crore = Math.floor(num / 10000000)
  const lakh = Math.floor((num % 10000000) / 100000)
  const thousand = Math.floor((num % 100000) / 1000)
  const hundred = num % 1000

  const parts: string[] = []
  if (crore) parts.push(wholeToWords(crore) + ' Crore')
  if (lakh) parts.push(twoDigits(lakh) + ' Lakh')
  if (thousand) parts.push(twoDigits(thousand) + ' Thousand')
  if (hundred) parts.push(threeDigits(hundred))
  return parts.join(' ')
}

/**
 * Cheque-ready amount in words, e.g.
 *   amountInWords(1234.5) → "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only"
 *   amountInWords(1000)   → "Rupees One Thousand Only"
 */
export function amountInWords(amount: number, currencyWord = 'Rupees', subWord = 'Paise'): string {
  const safe = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100)
  const rupees = Math.floor(safe)
  const paise = Math.round((safe - rupees) * 100)

  let out = `${currencyWord} ${wholeToWords(rupees)}`
  if (paise > 0) out += ` and ${twoDigits(paise)} ${subWord}`
  out += ' Only'
  return out
}

/** Grouped figures with a trailing "/-", e.g. 1234.5 → "1,234.50/-". */
export function amountInFigures(amount: number): string {
  const safe = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100)
  return safe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/-'
}
