// The arithmetic of selling an asset. Pure, so it can be tested — and it needs
// to be, because getting it subtly wrong overstates every gain you ever made.
//
// Three numbers matter and they are NOT the same number:
//
//   gross     what the buyer agreed to pay
//   net       what actually reached your account (gross − charges − tax)
//   realised  what you actually made (net − what the asset cost you)
//
// The naive version — "profit = sold price − cost" — is what the app did before,
// and it silently pockets the bank's fees and the taxman's cut as if they were
// yours.

export type SalePaymentStatus = 'awaiting' | 'received'

export interface SaleInput {
  /** Agreed sale price. */
  gross: number
  /** Bank / brokerage / platform fees deducted before remittance. */
  charges?: number | null
  /** TDS or any tax withheld at source. */
  tax?: number | null
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** What actually lands in the account. */
export function netProceeds(sale: SaleInput): number {
  return money(num(sale.gross) - num(sale.charges) - num(sale.tax))
}

/** Total taken out of the sale before it reached you. */
export function totalDeductions(sale: SaleInput): number {
  return money(num(sale.charges) + num(sale.tax))
}

/**
 * Profit or loss actually realised: what reached your account, less what the
 * asset cost you. Deductions come out — they are a cost of selling, not profit.
 */
export function realisedGain(sale: SaleInput, cost: number): number {
  return money(netProceeds(sale) - num(cost))
}

/** Realised gain as a percentage of cost. Zero-cost assets have no meaningful %. */
export function realisedPct(sale: SaleInput, cost: number): number | null {
  const c = num(cost)
  if (c <= 0) return null
  return money((realisedGain(sale, cost) / c) * 100)
}

export interface SaleValidation {
  ok: boolean
  errors: string[]
}

/**
 * Refuse to record an incoherent sale. These aren't style points: a negative
 * net, or deductions that exceed the price, mean a typo — and once it's saved
 * it quietly corrupts every realised-gain total on the assets page.
 */
export function validateSale(
  sale: SaleInput,
  opts: { markReceived: boolean; accountId?: string | null; date?: string | null },
): SaleValidation {
  const errors: string[] = []
  const gross = num(sale.gross)
  const charges = num(sale.charges)
  const tax = num(sale.tax)

  if (gross <= 0) errors.push('Enter the price the asset sold for.')
  if (charges < 0) errors.push('Bank charges cannot be negative.')
  if (tax < 0) errors.push('Tax deducted cannot be negative.')
  if (gross > 0 && charges + tax > gross) {
    errors.push('Charges and tax add up to more than the sale price.')
  }
  if (!opts.date) errors.push('Pick the date of sale.')
  if (opts.markReceived && !opts.accountId) {
    errors.push('Choose the account the money was remitted to.')
  }

  return { ok: errors.length === 0, errors }
}

/** The row written to `assets` when a sale is recorded. */
export function salePatch(
  sale: SaleInput,
  opts: {
    soldDate: string
    buyer?: string | null
    reference?: string | null
    markReceived: boolean
    accountId?: string | null
    receivedDate?: string | null
    transactionId?: string | null
  },
) {
  return {
    status: 'sold' as const,
    sold_price: money(num(sale.gross)),
    sold_date: opts.soldDate,
    sale_charges: money(num(sale.charges)),
    sale_tax: money(num(sale.tax)),
    sale_net: netProceeds(sale),
    sale_buyer: opts.buyer?.trim() || null,
    sale_reference: opts.reference?.trim() || null,
    sale_payment_status: (opts.markReceived ? 'received' : 'awaiting') as SalePaymentStatus,
    sale_account_id: opts.markReceived ? (opts.accountId ?? null) : null,
    sale_received_date: opts.markReceived ? (opts.receivedDate || opts.soldDate) : null,
    sale_transaction_id: opts.transactionId ?? null,
  }
}

/** Undo a sale entirely — back to held, with no trace of money. */
export const unsellPatch = () => ({
  status: 'held' as const,
  sold_price: null,
  sold_date: null,
  sale_charges: 0,
  sale_tax: 0,
  sale_net: null,
  sale_buyer: null,
  sale_reference: null,
  sale_payment_status: 'awaiting' as SalePaymentStatus,
  sale_account_id: null,
  sale_received_date: null,
  sale_transaction_id: null,
})
