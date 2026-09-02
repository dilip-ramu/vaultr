// Chit bidding — the rules, as pure functions. PURE: no database, no network.
//
// WHY THESE ARE SEPARATE FROM THE CODE THAT WRITES THE BID
//
// Whether a bid is allowed decides who receives a lakh rupees. That decision
// must be testable without a database, readable in one screen, and identical
// everywhere it is asked — the member's phone shows "you can bid ₹X more", and
// the server accepts or rejects on the same arithmetic. Two implementations of
// one rule is how a member gets told yes and then told no.
//
// The rules, in order of how often they bite:
//
//   1. The window must be OPEN. The foreman opens and closes it by hand; there
//      is no clock, so "closed" always means a person closed it.
//   2. You must be IN the group.
//   3. You must not have ALREADY WON in this group. Standard chit rule: once
//      you have taken the prize, your turn is over.
//   4. Your bid must beat the standing highest by at least the increment.
//   5. Your bid must not exceed the ceiling frozen onto the window.
//
// Nothing here consults payment status. That was a deliberate choice: a member
// in arrears can bid, and the foreman simply does not award the prize to
// someone he would not pay. The rule lives with the person, not the code.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

export type BidWindowStatus = 'open' | 'closed' | 'cancelled'

export interface BidWindowRules {
  status: BidWindowStatus
  /** The most any bid may be, frozen when the window opened. */
  ceilingAmount: number
  /** The least a new bid must beat the standing one by. */
  minIncrement: number
}

export interface BidContext {
  window: BidWindowRules
  /** Highest bid so far, or null when nobody has bid yet. */
  highestAmount: number | null
  /** Is this member in the group? */
  isMember: boolean
  /** Has this member already taken the prize in this group? */
  alreadyWon: boolean
}

export type BidRejection =
  | 'WINDOW_CLOSED'
  | 'NOT_IN_GROUP'
  | 'ALREADY_WON'
  | 'NOT_A_NUMBER'
  | 'BELOW_MINIMUM'
  | 'ABOVE_CEILING'

export interface BidCheck {
  ok: boolean
  reason?: BidRejection
  /** Plain English, shown to the member as-is. */
  message?: string
}

/**
 * The smallest bid that would be accepted right now. The phone shows this so a
 * member is never invited to type a number that will be refused.
 * Returns null when no bid could be accepted at all.
 */
export function minimumAcceptableBid(ctx: BidContext): number | null {
  const inc = Math.max(1, num(ctx.window.minIncrement))
  const floor = ctx.highestAmount == null ? inc : round2(num(ctx.highestAmount) + inc)
  return floor > num(ctx.window.ceilingAmount) ? null : floor
}

/** Everything that must be true for a bid to be accepted. */
export function checkBid(amountRaw: unknown, ctx: BidContext): BidCheck {
  if (ctx.window.status !== 'open') {
    return { ok: false, reason: 'WINDOW_CLOSED', message: 'Bidding is closed for this month.' }
  }
  if (!ctx.isMember) {
    return { ok: false, reason: 'NOT_IN_GROUP', message: 'You are not a member of this group.' }
  }
  if (ctx.alreadyWon) {
    return {
      ok: false, reason: 'ALREADY_WON',
      message: 'You have already taken the prize in this chit, so you cannot bid again.',
    }
  }

  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'NOT_A_NUMBER', message: 'Enter a bid amount in rupees.' }
  }

  const ceiling = num(ctx.window.ceilingAmount)
  if (round2(amount) > ceiling) {
    return {
      ok: false, reason: 'ABOVE_CEILING',
      message: `The most anyone may bid this month is ₹${Math.round(ceiling).toLocaleString('en-IN')}.`,
    }
  }

  const floor = minimumAcceptableBid(ctx)
  if (floor == null) {
    // The standing bid is already at the ceiling. Nobody can beat it.
    return {
      ok: false, reason: 'ABOVE_CEILING',
      message: 'The highest bid has reached the ceiling for this month, so no higher bid is possible.',
    }
  }
  if (round2(amount) < floor) {
    return {
      ok: false, reason: 'BELOW_MINIMUM',
      message: ctx.highestAmount == null
        ? `The first bid must be at least ₹${Math.round(floor).toLocaleString('en-IN')}.`
        : `You need to bid at least ₹${Math.round(floor).toLocaleString('en-IN')} to beat the current highest.`,
    }
  }

  return { ok: true }
}

/**
 * A sensible minimum increment for a group that has not set one. A quarter of a
 * percent of the pot, rounded up to the nearest hundred, never below ₹100 —
 * small enough not to distort the auction, big enough that bidding cannot crawl.
 */
export function defaultIncrement(chitValue: number): number {
  const quarterPct = num(chitValue) * 0.0025
  return Math.max(100, Math.ceil(quarterPct / 100) * 100)
}
