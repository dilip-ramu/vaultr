// Chit fund maths — the one part of this feature that must be exactly right.
//
// Every rupee a member pays, every payout a winner receives, and every dividend
// credited back flows from these formulas. Get one wrong and the whole ledger is
// wrong in a way nobody spots until someone is short-paid. So it lives here,
// pure and tested, and nothing else re-derives it.
//
// ── A chit in one paragraph ─────────────────────────────────────────────────
//
// N members put in a fixed installment each month for N months (MONTHLY model).
// Each month the pot — the chit value C — is auctioned. Members bid a DISCOUNT:
// how much of C they'll give up to take the money this month instead of later.
// Highest discount wins and receives C minus their discount. The discount, less
// the foreman's commission, is shared back to every member as a "dividend" that
// reduces what they owe. Over the whole chit, the winner has borrowed; everyone
// else has saved and earned the dividends.
//
// ── The two commission models ───────────────────────────────────────────────
//
// MONTHLY  — the foreman takes a fixed cut (commissionPct of C) at EVERY auction.
//            The chit runs for exactly N months.
//
// UPFRONT  — the foreman takes the ENTIRE first pot as commission (month 1: the
//            company gets C, no member is paid). From month 2 onwards there is NO
//            commission, and the winner takes the full C minus their discount.
//            To still give every member a turn, the chit runs N+1 months.
//
// Both are real, both are used; the model is chosen per group and cannot be
// mixed within one.

export type CommissionModel = 'MONTHLY' | 'UPFRONT'

export interface GroupParams {
  /** The pot. What one member takes home (before their own discount). */
  chitValue: number
  /** How many members. */
  members: number
  /** Foreman's cut, as a % of chit value. Only used by MONTHLY. */
  commissionPct: number
  /** The most a bid may discount, as a % of chit value. Caps a runaway auction. */
  bidCeilingPct: number
  model: CommissionModel
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// ── Group-level, computed once when the group is created ────────────────────

/** What each member pays in, per month. The pot divided by the members. */
export function monthlyInstallment(p: Pick<GroupParams, 'chitValue' | 'members'>): number {
  const m = num(p.members)
  if (m <= 0) return 0
  return round2(num(p.chitValue) / m)
}

/**
 * How many monthly auctions the chit runs for.
 *
 * MONTHLY: one per member, so N.
 * UPFRONT: the first month is the foreman's, so every member still needs a turn
 *          AFTER that — N members over months 2…N+1 — giving N+1 in total.
 */
export function numberOfMonths(p: Pick<GroupParams, 'members' | 'model'>): number {
  const m = Math.max(0, Math.floor(num(p.members)))
  return p.model === 'UPFRONT' ? m + 1 : m
}

/** The foreman's commission at a MONTHLY auction — fixed, every month. */
export function monthlyCommission(p: Pick<GroupParams, 'chitValue' | 'commissionPct'>): number {
  return round2(num(p.chitValue) * (num(p.commissionPct) / 100))
}

/** The biggest discount a bid may be. Above this, the auction is capped. */
export function bidCeiling(p: Pick<GroupParams, 'chitValue' | 'bidCeilingPct'>): number {
  return round2(num(p.chitValue) * (num(p.bidCeilingPct) / 100))
}

// ── One auction ─────────────────────────────────────────────────────────────

export interface AuctionInput {
  group: GroupParams
  /** 1-based. Month 1 is special under UPFRONT. */
  monthNumber: number
  /** The winning discount, in rupees. Clamped to the ceiling. */
  bidAmount: number
  /**
   * How many members share the dividend this month. Normally every member (they
   * all pay in, so they all share back). Pass a smaller number only if you
   * deliberately exclude, say, defaulters — the caller decides policy, the maths
   * just divides by what it's given.
   */
  payingMembers?: number
}

export interface AuctionResult {
  /** The discount actually applied, after the ceiling. */
  discount: number
  /** The foreman's cut this month. */
  commission: number
  /** What the winner takes home: C − discount (or 0 in an UPFRONT first month). */
  netPayout: number
  /** Shared back to members: (discount − commission) ÷ payingMembers. */
  dividendPerMember: number
  /** What each member effectively pays this month: installment − dividend. */
  netInstallment: number
  /** True when this is the foreman's upfront month — no auction really happened. */
  isForemanMonth: boolean
  /** Set when the entered bid was above the ceiling and got capped. */
  cappedFrom?: number
}

/**
 * Run one auction. Pure: give it the group, the month and the winning bid, and
 * it tells you exactly who gets what.
 */
export function runAuction(input: AuctionInput): AuctionResult {
  const { group, monthNumber } = input
  const C = num(group.chitValue)
  const installment = monthlyInstallment(group)
  const paying = Math.max(1, Math.floor(num(input.payingMembers ?? group.members)))

  // ── UPFRONT, month 1: the foreman takes the whole pot ─────────────────────
  // No member is paid, no discount, no dividend. This is the company's fee for
  // running the chit, taken as the entire first collection.
  if (group.model === 'UPFRONT' && monthNumber === 1) {
    return {
      discount: 0,
      commission: C,          // the foreman's commission IS the pot
      netPayout: 0,           // nobody is paid out
      dividendPerMember: 0,
      netInstallment: installment,
      isForemanMonth: true,
    }
  }

  // ── A normal auction ──────────────────────────────────────────────────────
  const ceiling = bidCeiling(group)
  const rawBid = Math.max(0, num(input.bidAmount))
  const discount = Math.min(rawBid, ceiling)

  // MONTHLY takes its fixed cut; UPFRONT (months 2+) takes nothing.
  const commission = group.model === 'MONTHLY' ? monthlyCommission(group) : 0

  // The winner gets the pot less what they bid away. The commission does NOT come
  // out of their payout — it comes out of the DISCOUNT, i.e. out of the dividend
  // the other members would have shared. That is the foreman's fee, and it is why
  // a higher commission means smaller dividends, not a smaller payout.
  const netPayout = round2(C - discount)

  // What's left of the discount after the foreman is the members' dividend.
  const distributable = Math.max(0, discount - commission)
  const dividendPerMember = round2(distributable / paying)
  const netInstallment = round2(installment - dividendPerMember)

  return {
    discount,
    commission: round2(commission),
    netPayout,
    dividendPerMember,
    netInstallment,
    isForemanMonth: false,
    ...(rawBid > ceiling ? { cappedFrom: round2(rawBid) } : {}),
  }
}

// ── Whole-group projections, for the dashboard and reports ──────────────────

export interface GroupTotals {
  installment: number
  months: number
  ceiling: number
  /** Total the foreman earns across the whole chit, if every auction hits the
   *  commission (MONTHLY) or from the first pot (UPFRONT). A planning figure. */
  foremanTotal: number
  /** What every member pays in over the life of the chit, ignoring dividends. */
  grossPerMember: number
}

export function groupTotals(p: GroupParams): GroupTotals {
  const installment = monthlyInstallment(p)
  const months = numberOfMonths(p)
  return {
    installment,
    months,
    ceiling: bidCeiling(p),
    foremanTotal: p.model === 'UPFRONT'
      ? round2(num(p.chitValue))                      // the whole first pot, once
      : round2(monthlyCommission(p) * num(p.members)), // fixed cut, every month
    grossPerMember: round2(installment * months),
  }
}

/**
 * What a member actually pays for a month, after the auction.
 *
 * The auction that month produces a dividend per member — everyone's share of the
 * winner's discount — and that dividend REDUCES what each member owes for the same
 * month. So the due is the installment minus the dividend, floored at zero (a
 * dividend can't turn into a payment TO the member here). Before the month's
 * auction has run there's no dividend yet, so the due is the full installment.
 *
 * This is exactly runAuction()'s `netInstallment`, but keyed off the stored
 * dividend so the collection screens don't have to re-run the auction.
 */
export function monthlyDue(installment: number, dividendPerMember: number): number {
  const due = num(installment) - Math.max(0, num(dividendPerMember))
  return Math.max(0, round2(due))
}

export interface GroupValidation { ok: boolean; errors: string[] }

export function validateGroup(p: Partial<GroupParams>): GroupValidation {
  const errors: string[] = []
  if (num(p.chitValue) <= 0) errors.push('Enter the chit value (the pot).')
  if (Math.floor(num(p.members)) < 2) errors.push('A chit needs at least 2 members.')
  if (num(p.commissionPct) < 0 || num(p.commissionPct) > 100) errors.push('Commission must be between 0 and 100%.')
  if (num(p.bidCeilingPct) < 0 || num(p.bidCeilingPct) > 100) errors.push('Bid ceiling must be between 0 and 100%.')
  if (p.model !== 'MONTHLY' && p.model !== 'UPFRONT') errors.push('Pick a commission model.')
  return { ok: errors.length === 0, errors }
}
