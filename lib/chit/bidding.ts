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
  /**
   * Kept because the column exists and old windows carry a value, but NOT used.
   * See minimumAcceptableBid for why honouring it would keep a live bug alive.
   */
  minIncrement?: number
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
  | 'NOT_A_STEP'
  | 'BELOW_MINIMUM'
  | 'ABOVE_CEILING'

/**
 * Bids move in hundreds. That is how the auction is called in the room, so it
 * is how it works here — a member may bid any amount they like as long as it is
 * a round hundred and it beats the standing bid.
 */
export const BID_STEP = 100

/** The next multiple of BID_STEP at or above n. */
export function roundUpToStep(n: number): number {
  return Math.ceil(num(n) / BID_STEP) * BID_STEP
}

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
  // One step above the standing bid. Nothing else.
  //
  // The window stores a frozen min_increment, and this deliberately ignores it.
  // No screen has ever let a foreman choose that number — every stored value
  // came from an automatic quarter-of-a-percent default, which on a ₹5,20,000
  // chit meant a member who bid ₹1,500 was told their next bid had to be
  // ₹2,800. Reading the frozen value back would keep that wrong number alive
  // for every window that is already open.
  const floor = ctx.highestAmount == null
    ? BID_STEP
    : roundUpToStep(round2(num(ctx.highestAmount) + BID_STEP))
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

  if (round2(amount) % BID_STEP !== 0) {
    return {
      ok: false, reason: 'NOT_A_STEP',
      message: `Bids go up in ${BID_STEP}s. Enter a round figure — ${
        Math.round(roundUpToStep(amount)).toLocaleString('en-IN')}, for example.`,
    }
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
 * The minimum increment for a group that has not set one: one step.
 *
 * This used to be a quarter of a percent of the pot, which on a ₹5,20,000 chit
 * made the smallest legal raise ₹1,300 — so a member who bid ₹1,500 was then
 * told their next bid had to be ₹2,800. That is not how the auction is called.
 * Any round hundred that beats the standing bid is a valid bid, and the
 * increment exists only to stop bidding crawling in rupees.
 *
 * A foreman who wants a larger step can still set one when opening the window;
 * it is frozen onto that window and honoured.
 */
export function defaultIncrement(_chitValue?: number): number {
  return BID_STEP
}
