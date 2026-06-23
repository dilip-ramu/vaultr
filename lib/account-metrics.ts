// ── Account metrics ──────────────────────────────────────────────────────────
// Turns a raw account balance into the right meaning for its type.
//
// Sign convention (matches the account_balances view):
//   • asset accounts (current/savings/cash/investment): balance ≥ 0 normally.
//   • credit cards & loans: balance is NEGATIVE when you OWE money — each
//     spend is an expense (−), each repayment a transfer in (+).

export interface AccountLike {
  type: string
  balance?: number | null
  initial_balance?: number | null
  credit_limit?: number | null
  loan_principal?: number | null
  interest_rate?: number | null
  emi_amount?: number | null
}

export function isCredit(type: string): boolean { return type === 'credit' }
export function isLoan(type: string): boolean { return type === 'loan' }
export function isLiability(type: string): boolean { return type === 'credit' || type === 'loan' }

const round2 = (n: number) => Math.round(n * 100) / 100
const bal = (a: AccountLike) => Number(a.balance ?? a.initial_balance ?? 0)

/** Amount currently owed on a credit card or loan (≥ 0). */
export function outstanding(a: AccountLike): number {
  const b = bal(a)
  return b < 0 ? round2(-b) : 0
}

export interface CreditMetrics {
  outstanding: number          // amount owed
  limit: number | null         // sanctioned credit limit
  available: number | null     // limit − outstanding (≥ 0)
  utilisation: number | null   // outstanding / limit, 0..1
  overLimit: boolean
  creditBalance: number        // > 0 when the card is in credit (overpaid)
}

export function creditMetrics(a: AccountLike): CreditMetrics {
  const owed = outstanding(a)
  const limit = a.credit_limit != null ? Number(a.credit_limit) : null
  const b = bal(a)
  const creditBalance = b > 0 ? round2(b) : 0
  if (limit == null || limit <= 0) {
    return { outstanding: owed, limit, available: null, utilisation: null, overLimit: false, creditBalance }
  }
  const available = round2(Math.max(0, limit - owed))
  return {
    outstanding: owed,
    limit,
    available,
    utilisation: round2(owed / limit),
    overLimit: owed > limit,
    creditBalance,
  }
}

export interface LoanMetrics {
  outstanding: number          // remaining to repay
  principal: number | null     // original sanctioned amount
  repaid: number | null        // principal − outstanding (≥ 0)
  progress: number | null      // repaid / principal, 0..1
  emi: number | null
  rate: number | null
}

export function loanMetrics(a: AccountLike): LoanMetrics {
  const owed = outstanding(a)
  const principal = a.loan_principal != null ? Number(a.loan_principal) : null
  const emi = a.emi_amount != null ? Number(a.emi_amount) : null
  const rate = a.interest_rate != null ? Number(a.interest_rate) : null
  if (principal == null || principal <= 0) {
    return { outstanding: owed, principal, repaid: null, progress: null, emi, rate }
  }
  const repaid = round2(Math.max(0, principal - owed))
  return { outstanding: owed, principal, repaid, progress: round2(repaid / principal), emi, rate }
}

export interface CreditSummary {
  totalAvailable: number       // sum of available credit across cards with a limit
  totalCardOutstanding: number // sum owed across all credit cards
  totalLoanOutstanding: number // sum owed across all loans
  totalOutstanding: number     // cards + loans
  totalLimit: number           // sum of card limits (only cards that have one)
  overallUtilisation: number | null // totalCardOutstanding / totalLimit
}

/** Roll up credit/loan figures for the dashboard. */
export function creditSummary(accounts: AccountLike[]): CreditSummary {
  let totalAvailable = 0, totalCardOutstanding = 0, totalLoanOutstanding = 0, totalLimit = 0
  for (const a of accounts) {
    if (isCredit(a.type)) {
      const m = creditMetrics(a)
      totalCardOutstanding += m.outstanding
      if (m.limit && m.limit > 0) { totalLimit += m.limit; totalAvailable += m.available ?? 0 }
    } else if (isLoan(a.type)) {
      totalLoanOutstanding += outstanding(a)
    }
  }
  return {
    totalAvailable: round2(totalAvailable),
    totalCardOutstanding: round2(totalCardOutstanding),
    totalLoanOutstanding: round2(totalLoanOutstanding),
    totalOutstanding: round2(totalCardOutstanding + totalLoanOutstanding),
    totalLimit: round2(totalLimit),
    overallUtilisation: totalLimit > 0 ? round2(totalCardOutstanding / totalLimit) : null,
  }
}
