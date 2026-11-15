// How many collections a chit is still waiting on, and how late each one is.
//
// The number on the groups list is "1 out of 20 pending", and the colour is
// the point of it: a collection missed this month is a reminder, one missed
// since June is a problem. One count in one colour hides the difference, and
// the difference is the only reason to look.
//
// EVERY UNPAID MONTH COUNTS, NOT EVERY MEMBER.
//
// Arrears pile up. A member four months behind is four collections you have
// not made, and the list says 4 — not 1. Counting people would make a group
// where one member owes four months look the same as one where he owes one,
// which is exactly the case the colour exists to separate.
//
// EACH MONTH IS COLOURED BY ITS OWN AGE, not by the member's worst. A
// defaulter who owes June, July, August and this month shows as three red and
// one yellow, which is the truth: three are overdue and one is merely due.
//
// The "out of 20" is the number of members, which is one month's worth of
// collections. When arrears run deep the count can pass it — twenty members
// two months behind is "40 out of 20" — so the line underneath says how many
// people that actually is.
//
// Pure, and "today" is passed in: a date comparison that reads the clock
// cannot be tested, and this one decides what turns red.

const DAY = 86400000

/** Older than this and it stops being a reminder. */
export const DEFAULT_OVERDUE_DAYS = 30

export interface PendingInput {
  /** Everyone seated in the group — the "out of 20". */
  memberIds: readonly string[]
  /** member id → the auctioned months they still owe something for. */
  unpaidMonths: ReadonlyMap<string, readonly number[]>
  /** month number → the date that month's auction was held. */
  auctionDates: ReadonlyMap<number, string | null | undefined>
  /** Today, as YYYY-MM-DD. */
  asOf: string
  overdueAfterDays?: number
}

export interface PendingSummary {
  /** Members seated in the group — one month's worth of collections. */
  total: number
  /** Unpaid months across everybody. */
  pending: number
  /** Of those, the ones whose auction was longer ago than the cut-off. */
  overdue: number
  /** The rest — due, but only recently. */
  recent: number
  /** How many people the pending months belong to. */
  membersBehind: number
  /** How many of those have at least one month past the cut-off. */
  membersOverdue: number
  /** Days since the oldest unpaid month anywhere in the group. */
  oldestDays: number | null
  /** How many months behind the worst-off member is. */
  worstMonthsBehind: number
}

export const NO_PENDING: PendingSummary = {
  total: 0, pending: 0, overdue: 0, recent: 0,
  membersBehind: 0, membersOverdue: 0, oldestDays: null, worstMonthsBehind: 0,
}

function daysSince(date: string | null | undefined, asOf: string): number | null {
  if (!date) return null
  const a = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / DAY)
}

export function summarisePending(input: PendingInput): PendingSummary {
  const limit = input.overdueAfterDays ?? DEFAULT_OVERDUE_DAYS
  let pending = 0
  let overdue = 0
  let membersBehind = 0
  let membersOverdue = 0
  let oldestDays: number | null = null
  let worstMonthsBehind = 0

  for (const memberId of input.memberIds) {
    const months = (input.unpaidMonths.get(memberId) ?? []).filter(m => Number.isFinite(m))
    if (!months.length) continue

    membersBehind++
    worstMonthsBehind = Math.max(worstMonthsBehind, months.length)

    let anyOverdue = false
    for (const m of months) {
      pending++
      // A month whose auction has no recorded date cannot be aged, so it
      // counts as recent. A missing date is not evidence of lateness.
      const age = daysSince(input.auctionDates.get(m), input.asOf)
      if (age === null) continue
      if (oldestDays === null || age > oldestDays) oldestDays = age
      if (age > limit) { overdue++; anyOverdue = true }
    }
    if (anyOverdue) membersOverdue++
  }

  return {
    total: input.memberIds.length,
    pending,
    overdue,
    recent: pending - overdue,
    membersBehind,
    membersOverdue,
    oldestDays,
    worstMonthsBehind,
  }
}

// ── Reading it off the ledger the rest of the chit already uses ─────────────

interface LedgerLike {
  byMember: Map<string, { months: { month: number; outstanding: number }[] }>
}
interface AuctionLike {
  month_number: number | string
  auction_date?: string | null
}

/**
 * The same summary, from the GroupLedger every other chit screen reads. One
 * calculation of who owes what, so the list and the group page cannot
 * disagree about whether somebody has paid.
 */
export function pendingFromLedger(
  ledger: LedgerLike,
  auctions: readonly AuctionLike[],
  memberIds: readonly string[],
  asOf: string,
  overdueAfterDays = DEFAULT_OVERDUE_DAYS,
): PendingSummary {
  const auctionDates = new Map<number, string | null | undefined>()
  for (const a of auctions) auctionDates.set(Number(a.month_number), a.auction_date)

  const unpaidMonths = new Map<string, number[]>()
  for (const memberId of memberIds) {
    const months = ledger.byMember.get(memberId)?.months ?? []
    unpaidMonths.set(memberId, months.filter(m => m.outstanding > 0).map(m => m.month))
  }

  return summarisePending({ memberIds, unpaidMonths, auctionDates, asOf, overdueAfterDays })
}

/**
 * The line under the badges, when there is something worth adding.
 *
 * It counts the people who are actually LATE, not everyone who owes
 * something. "15 members behind" on a group where fourteen of them simply
 * have not paid this month yet is true and useless; the number worth having
 * is how many are a real problem.
 */
export function pendingDetail(p: PendingSummary): string | null {
  if (!p.pending) return null
  const parts: string[] = []
  if (p.membersOverdue > 0) {
    parts.push(`${p.membersOverdue} member${p.membersOverdue === 1 ? '' : 's'} more than ${DEFAULT_OVERDUE_DAYS} days behind`)
  }
  if (p.worstMonthsBehind > 1) parts.push(`worst is ${p.worstMonthsBehind} months`)
  if (p.oldestDays !== null && p.oldestDays > DEFAULT_OVERDUE_DAYS) parts.push(`oldest ${p.oldestDays} days`)
  return parts.length ? parts.join(' · ') : null
}
