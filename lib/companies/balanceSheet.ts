// A balance sheet for one company: what it owns, what it owes, and the
// difference. Pure functions over plain rows — no database, no React — because
// the sign conventions here are exactly the kind of thing that goes quietly
// wrong and misstates a position by twice the amount.
//
// The rule that matters: a liability is stored as a POSITIVE number and
// SUBTRACTED. A credit-card account whose balance reads −45,000 owes 45,000; if
// you add that raw balance to "cash" you understate cash AND lose the debt.

export interface SheetAccount {
  id: string
  name: string
  /** checking | savings | cash | investment | credit | loan | other */
  type: string
  companyId: string | null
  /** Live balance. Negative on a credit card or loan you owe money on. */
  balance: number
}

export interface SheetAsset {
  id: string
  name: string
  category: string
  companyId: string | null
  /** Today's value (market rate or manual), not what it cost. */
  value: number
  status: 'held' | 'sold'
}

export interface SheetReceivable {
  id: string
  number: string
  party: string
  companyId: string | null
  /** Still owed to you. */
  outstanding: number
  dueDate?: string | null
}

export interface SheetPayable {
  id: string
  number: string
  party: string
  companyId: string | null
  /** Still owed by you. */
  outstanding: number
  dueDate?: string | null
  /**
   * True when this is the OTHER SIDE of an invoice one of your own companies
   * raised on this one. Company A billing company B is a receivable for A and a
   * payable for B — one event, two entries. Without this the money only ever
   * appears once and the group's books don't balance.
   */
  interCompany?: boolean
}

/** Same, for the receiving side. */
export interface InterCompanyNote {
  fromCompanyId: string
  toCompanyId: string
  amount: number
}

/** Account types that represent money you OWE, not money you have. */
const LIABILITY_TYPES = new Set(['credit', 'loan'])

export const isLiabilityAccount = (a: { type: string }) => LIABILITY_TYPES.has(a.type)

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const sum = (ns: number[]) => money(ns.reduce((t, n) => t + (Number(n) || 0), 0))

export interface CompanyBalanceSheet {
  companyId: string | null
  /** Money in the bank / in hand. Overdrawn current accounts count against it. */
  cash: number
  /** Assets still held, at today's value. Sold assets are gone — they became cash. */
  assets: number
  /** Invoiced but not yet collected. */
  receivables: number
  /** What you owe on cards and loans. Positive = owed. */
  debt: number
  /** Supplier bills raised on you but not yet paid. Positive = owed. */
  payables: number
  /** assets + cash + receivables − debt − payables */
  net: number
  counts: { accounts: number; assets: number; receivables: number; payables: number }
}

/**
 * Build the sheet for one company. Pass `null` to get the "unassigned" bucket:
 * everything not tagged to any company — which is exactly how you find the
 * things you forgot to tag.
 */
export function buildBalanceSheet(
  companyId: string | null,
  data: {
    accounts: SheetAccount[]
    assets: SheetAsset[]
    receivables: SheetReceivable[]
    payables: SheetPayable[]
  },
): CompanyBalanceSheet {
  const mine = <T extends { companyId: string | null }>(rows: T[]) =>
    rows.filter(r => (r.companyId ?? null) === companyId)

  const accounts = mine(data.accounts)
  // A sold asset is not an asset any more — the money it became is in an account.
  // Counting both would double it.
  const assets = mine(data.assets).filter(a => a.status !== 'sold')
  const receivables = mine(data.receivables).filter(r => r.outstanding > 0)
  const payables = mine(data.payables).filter(p => p.outstanding > 0)

  const cashAccounts = accounts.filter(a => !isLiabilityAccount(a))
  const debtAccounts = accounts.filter(isLiabilityAccount)

  const cash = sum(cashAccounts.map(a => a.balance))
  // Stored negative (you owe), reported positive (this much is owed).
  const debt = money(Math.abs(sum(debtAccounts.map(a => Math.min(0, a.balance)))))

  const assetValue = sum(assets.map(a => a.value))
  const recv = sum(receivables.map(r => r.outstanding))
  const pay = sum(payables.map(p => p.outstanding))

  return {
    companyId,
    cash,
    assets: assetValue,
    receivables: recv,
    debt,
    payables: pay,
    net: money(assetValue + cash + recv - debt - pay),
    counts: {
      accounts: accounts.length,
      assets: assets.length,
      receivables: receivables.length,
      payables: payables.length,
    },
  }
}

/** Everything that isn't tagged to any company. */
export const unassignedSheet = (data: Parameters<typeof buildBalanceSheet>[1]) =>
  buildBalanceSheet(null, data)
