const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below100(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return TENS[t] + (o > 0 ? '-' + ONES[o] : '')
}

function below1000(n: number): string {
  if (n === 0) return ''
  if (n < 100) return below100(n)
  const h   = Math.floor(n / 100)
  const rem = n % 100
  return ONES[h] + ' Hundred' + (rem > 0 ? ' ' + below100(rem) : '')
}

function integerToWords(n: number): string {
  if (n === 0) return 'Zero'

  const parts: string[] = []

  // Crores (1,00,00,000) — included for completeness though spec caps at ~1 crore
  if (n >= 10_000_000) {
    const crores = Math.floor(n / 10_000_000)
    parts.push(below100(crores) + ' Crore')
    n = n % 10_000_000
  }

  // Lakhs (1,00,000)
  if (n >= 100_000) {
    const lakhs = Math.floor(n / 100_000)
    parts.push(below100(lakhs) + ' Lakh')
    n = n % 100_000
  }

  // Thousands
  if (n >= 1_000) {
    const thousands = Math.floor(n / 1_000)
    parts.push(below100(thousands) + ' Thousand')
    n = n % 1_000
  }

  // Hundreds and below
  if (n > 0) {
    parts.push(below1000(n))
  }

  return parts.join(' ')
}

const CURRENCY_NAMES: Record<string, string> = {
  INR: 'Indian Rupee',
  USD: 'US Dollar',
  EUR: 'Euro',
  AED: 'UAE Dirham',
  GBP: 'British Pound',
}

const SUBUNIT_NAMES: Record<string, string> = {
  INR: 'Paise',
  USD: 'Cents',
  EUR: 'Cents',
  AED: 'Fils',
  GBP: 'Pence',
}

export function amountToWords(amount: number, currency: string = 'INR'): string {
  const currencyName = CURRENCY_NAMES[currency] ?? currency
  const subunitName  = SUBUNIT_NAMES[currency] ?? 'Cents'

  const whole   = Math.floor(amount)
  const subunit = Math.round((amount - whole) * 100)

  const wholeWords = integerToWords(whole)

  if (subunit > 0) {
    return `${currencyName} ${wholeWords} and ${integerToWords(subunit)} ${subunitName} Only`
  }
  return `${currencyName} ${wholeWords} Only`
}
