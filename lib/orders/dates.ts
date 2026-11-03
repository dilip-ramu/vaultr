// The two dates an order is chased against.
//
// CUT-OFF is the last day the order can still be accepted or changed. It
// stops mattering the moment the purchase order is placed — after that the
// order is bought and nobody is going to change it, so a red flag on it is
// just noise.
//
// ETD is when the goods are meant to leave. It stops mattering when they
// have all left, and not before: an ETD that passed last week on an order
// still sitting in the factory is the single most useful thing this page can
// tell you.
//
// Pure, and the "today" is passed in. A date comparison that quietly uses the
// machine clock cannot be tested, and this one decides what turns red.

export type DateState = 'ok' | 'soon' | 'passed'

export interface OrderDateInput {
  cutoffDate?: string | null
  etd?: string | null
  stage: string
  /** True once every piece has gone. */
  fullyShipped: boolean
}

export interface DateFlag {
  kind: 'cutoff' | 'etd'
  label: string
  date: string
  state: DateState
  /** Negative when the date has gone by. */
  daysAway: number
}

/** Anything inside this many days is worth a nudge. */
export const SOON_DAYS = 7

const DAY = 86400000

function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / DAY)
}

/** The dates still worth showing, and how worried to be about each. */
export function orderDateFlags(o: OrderDateInput, today: string): DateFlag[] {
  const out: DateFlag[] = []
  const dead = o.stage === 'closed' || o.stage === 'cancelled'
  if (dead) return out

  // Cut-off: only while the order could still change — i.e. before it is bought.
  const cutoffMatters = o.stage === 'enquiry' || o.stage === 'confirmed'
  if (o.cutoffDate && cutoffMatters) {
    const d = daysBetween(today, o.cutoffDate)
    if (d !== null) out.push({ kind: 'cutoff', label: 'Cut-off', date: o.cutoffDate, state: stateOf(d), daysAway: d })
  }

  // ETD: until everything has actually gone.
  if (o.etd && !o.fullyShipped) {
    const d = daysBetween(today, o.etd)
    if (d !== null) out.push({ kind: 'etd', label: 'ETD', date: o.etd, state: stateOf(d), daysAway: d })
  }

  return out
}

function stateOf(daysAway: number): DateState {
  if (daysAway < 0) return 'passed'
  if (daysAway <= SOON_DAYS) return 'soon'
  return 'ok'
}

/** "in 4 days", "today", "3 days ago" — how a person says it. */
export function whenWords(daysAway: number): string {
  if (daysAway === 0) return 'today'
  if (daysAway === 1) return 'tomorrow'
  if (daysAway === -1) return 'yesterday'
  return daysAway > 0 ? `in ${daysAway} days` : `${-daysAway} days ago`
}

/** The worst thing happening across a set of orders, for the list header. */
export function countLate(flags: readonly DateFlag[][]): { passed: number; soon: number } {
  let passed = 0, soon = 0
  for (const set of flags) {
    if (set.some(f => f.state === 'passed')) passed++
    else if (set.some(f => f.state === 'soon')) soon++
  }
  return { passed, soon }
}
