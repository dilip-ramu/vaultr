// Grand net worth: you, plus your share of every company you own.
//
// ── The formula ─────────────────────────────────────────────────────────────
//
//   grand = personal cash
//         + personal assets
//         − personal debt
//         + owner-loan balance          (what your companies owe you)
//         + Σ  stake% × company equity
//
//   company equity = cash + assets + receivables − debt − payables
//
// ── Why the stake multiplies EQUITY and not each line ────────────────────────
//
// The tempting version — "60% of its cash, 60% of its receivables" — added next
// to your personal cash reads like a balance sheet and is a trap. You do not own
// 60% of a company's cash as a fact you can spend; you own 60% of what is LEFT
// after its debts. Multiplying the net is the only version that survives the
// company being in the red.
//
// ── Why inter-company invoices do not inflate the total ──────────────────────
//
// Company A bills Company B: a receivable in A, a payable in B. Own both 100%
// and they cancel — right, no wealth was created by invoicing yourself. Own 100%
// of A and 60% of B and you're left holding 40% of that invoice, because your
// partners in B owe it. The equity formula produces that automatically. A
// dashboard that showed "business inwards" and "business outwards" as two
// separate additive tiles would not, and you would never see the error.
//
// ── Owner loans: the same trick, one level up ────────────────────────────────
//
// Lend the company ₹1L and it is a receivable to you and a payable inside it. At
// 100% those cancel to zero — you moved your own money between pockets. At 60%
// you keep +₹40k. Booked on both sides, this falls out for free.
//
// ── Unknown is not zero ──────────────────────────────────────────────────────
//
// A stock with no price, a currency with no rate: EXCLUDED and NAMED, never
// counted as 0. A net worth that quietly drops because a price feed was down is
// worse than one that says "₹4L not included — no rate".

import { buildBalanceSheet, type CompanyBalanceSheet, type SheetAccount, type SheetAsset, type SheetReceivable, type SheetPayable } from '@/lib/companies/balanceSheet'

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const sum = (ns: number[]) => money(ns.reduce((t, n) => t + (Number(n) || 0), 0))

export interface NetWorthCompany {
  id: string
  name: string
  color?: string | null
  /** 0–100. Your share of this company's EQUITY. */
  ownershipPct: number
}

export type LoanDirection = 'lent' | 'repaid' | 'drawn' | 'returned'

export interface OwnerLoanRow {
  companyId: string
  direction: LoanDirection
  amount: number
}

/** Something we could not value. Named, so it can be fixed. */
export interface Exclusion {
  what: string
  why: string
}

export interface CompanyStake {
  company: NetWorthCompany
  sheet: CompanyBalanceSheet
  /** What the company owes you (positive) or you owe it (negative). */
  ownerLoan: number
  /** Equity AFTER the owner loan is booked as a payable/receivable inside it. */
  equity: number
  /** stake% × equity. Your money. */
  yourShare: number
  /** True when no accounts are tagged here — its "cash" is not 0, it's unknown. */
  noAccounts: boolean
}

export interface GrandNetWorth {
  personal: {
    cash: number
    assets: number
    debt: number
    /** cash + assets − debt */
    net: number
  }
  /** Net of what your companies owe you, less what you owe them. */
  ownerLoans: number
  companies: CompanyStake[]
  /** Σ yourShare. */
  business: number
  /** personal.net + ownerLoans + business */
  grand: number
  /** Everything we refused to guess at. Shown, never silently zeroed. */
  excluded: Exclusion[]
  /**
   * Counted, but NOT at market value — a stock with no price fetched, a currency
   * with no rate. These sit in the total at what they COST, which is a real
   * number but not today's number. Distinct from `excluded` (not counted at all)
   * because the honest thing to say about them is different.
   */
  caveats: Exclusion[]
}

/**
 * Net owner-loan balance for one company.
 * Positive: the company owes you. Negative: you owe the company.
 */
export function ownerLoanBalance(rows: OwnerLoanRow[], companyId: string): number {
  const sign: Record<LoanDirection, number> = {
    lent: 1,       // you put money in  → it owes you
    repaid: -1,    // it gave it back   → it owes you less
    drawn: -1,     // you took money out → you owe it
    returned: 1,   // you put that back → you owe it less
  }
  return sum(
    rows.filter(r => r.companyId === companyId).map(r => sign[r.direction] * (Number(r.amount) || 0)),
  )
}

export function computeNetWorth(data: {
  accounts: SheetAccount[]
  assets: SheetAsset[]
  receivables: SheetReceivable[]
  payables: SheetPayable[]
  companies: NetWorthCompany[]
  loans: OwnerLoanRow[]
  /** Things we could not price at all. Passed in — this lib does not fetch. */
  excluded?: Exclusion[]
  /** Things counted at cost because no market price was available. */
  caveats?: Exclusion[]
}): GrandNetWorth {
  // Personal = the null bucket. Anything untagged lands here, which is exactly
  // how you find what you forgot to tag rather than having it vanish.
  const personalSheet = buildBalanceSheet(null, data)

  const companies: CompanyStake[] = data.companies.map(company => {
    const sheet = buildBalanceSheet(company.id, data)
    const ownerLoan = ownerLoanBalance(data.loans, company.id)

    // The loan is a liability OF the company (it owes you), so it comes off the
    // company's equity. Leaving it out would let you count the same rupee twice:
    // once as your receivable and once inside the company's cash.
    const equity = money(sheet.net - ownerLoan)
    const pct = Math.min(100, Math.max(0, Number(company.ownershipPct) || 0))
    const yourShare = money(equity * (pct / 100))

    return {
      company,
      sheet,
      ownerLoan,
      equity,
      yourShare,
      noAccounts: sheet.counts.accounts === 0,
    }
  })

  const excluded: Exclusion[] = [...(data.excluded ?? [])]

  // A company with no accounts tagged has cash we don't know, not cash of zero.
  // Saying "₹0" here would be a confident lie; this makes it a visible gap.
  for (const c of companies) {
    if (c.noAccounts) {
      excluded.push({
        what: c.company.name,
        why: 'no accounts tagged to it — its cash is not counted',
      })
    }
  }

  const ownerLoans = sum(companies.map(c => c.ownerLoan))
  const business = sum(companies.map(c => c.yourShare))

  return {
    personal: {
      cash: personalSheet.cash,
      assets: personalSheet.assets,
      debt: money(personalSheet.debt + personalSheet.payables),
      net: money(personalSheet.cash + personalSheet.assets - personalSheet.debt - personalSheet.payables),
    },
    ownerLoans,
    companies,
    business,
    grand: money(
      personalSheet.cash + personalSheet.assets - personalSheet.debt - personalSheet.payables
      + ownerLoans
      + business,
    ),
    excluded,
    caveats: [...(data.caveats ?? [])],
  }
}

/**
 * The four headline numbers for the dashboard.
 *
 * Deliberately NOT "inwards" and "outwards" as top-level tiles — those are
 * components of a company's equity, and standing them next to cash invites you
 * to add them to it, which double-counts every invoice you've ever raised.
 * They belong inside the Business drill-down, where they explain the equity
 * rather than competing with it.
 */
export function dashboardTiles(nw: GrandNetWorth) {
  return {
    cash: nw.personal.cash,
    assets: nw.personal.assets,
    business: nw.business,
    /** Personal debt, shown as a positive number you owe. */
    debt: nw.personal.debt,
    loans: nw.ownerLoans,
    grand: nw.grand,
  }
}
