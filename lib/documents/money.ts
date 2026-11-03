// Money, in whatever currency the document is actually in.
//
// Every document in Inex printed rupees, because every amount went through
// one hard-coded '₹' + en-IN formatter. That was fine while the only
// documents were domestic. It is wrong the moment a sales order goes to a
// buyer in USD: the figures are dollars and the symbol says rupees, which is
// not a cosmetic problem — it is a document stating the wrong price.
//
// THE RULE, in one place:
//   Sales order, proforma, customer invoice → the customer's currency.
//   Purchase order to the supplier           → rupees.
//   The profit and loss                      → rupees.
//
// Grouping follows the currency, not the user: ₹12,34,567 is right for
// rupees and wrong for dollars, and $1,234,567 is right for dollars and
// wrong for rupees.

import { getCurrencyMeta } from '@/lib/currencies'

/** Indian grouping for rupees, Western grouping for everything else. */
function localeFor(currency: string): string {
  return currency === 'INR' ? 'en-IN' : 'en-US'
}

/**
 * INR is deliberately NOT in lib/currencies — that list is the FOREIGN
 * currencies offered in pickers, because the rupee is the base everything
 * converts to. So asking it for the rupee gets the fallback, which is the
 * literal code. Handled here rather than by adding INR to that list, which
 * would put "INR" in every "convert to" dropdown in the app.
 */
export function currencySymbol(currency: string): string {
  const code = currency || 'INR'
  if (code === 'INR') return '₹'
  return getCurrencyMeta(code).symbol
}

/** "₹2,59,600" / "$48,000" — the symbol and the grouping that belong together. */
export function money(amount: number, currency = 'INR', maximumFractionDigits = 2): string {
  const cur = currency || 'INR'
  const n = Number.isFinite(amount) ? amount : 0
  const body = new Intl.NumberFormat(localeFor(cur), { maximumFractionDigits }).format(n)
  return `${currencySymbol(cur)}${body}`
}

/** Always two decimals — for a form where the figure is being typed and
 *  "₹1,200" vs "₹1,200.00" jumping about as you type is distracting. */
export function moneyExact(amount: number, currency = 'INR'): string {
  const cur = currency || 'INR'
  const n = Number.isFinite(amount) ? amount : 0
  return currencySymbol(cur) + n.toLocaleString(localeFor(cur), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Negative money reads as −₹12,000, never ₹-12,000. */
export function signedMoney(amount: number, currency = 'INR'): string {
  const n = Number.isFinite(amount) ? amount : 0
  return (n < 0 ? '−' : '') + money(Math.abs(n), currency)
}

/** The number alone, grouped for the currency — for table cells with a column header. */
export function plainAmount(amount: number, currency = 'INR', maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(localeFor(currency || 'INR'), { maximumFractionDigits }).format(Number.isFinite(amount) ? amount : 0)
}

/**
 * Whether a document in this currency should charge Indian GST by default.
 *
 * An export invoice is zero-rated — under an LUT no IGST is charged at all.
 * Defaulting a USD document to 18% would put a tax line on a document that
 * must not have one. It is a DEFAULT, not a rule: exports made with payment
 * of tax do carry IGST, and the form still lets you set it.
 */
export function defaultGstFor(currency: string): string {
  return (currency || 'INR') === 'INR' ? '18' : '0'
}
