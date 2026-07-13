// Things you did TO an asset after you bought it.
//
// You buy land in 2019. You build a house on it in 2026. That is not two assets
// — you cannot sell the house and keep the land under it — and it is not a new
// asset either, because the land's own history didn't stop.
//
// ── The rule that makes this worth building ─────────────────────────────────
//
// EVERY IMPROVEMENT HAS ITS OWN CLOCK.
//
// The land appreciates from the day you BOUGHT it. The structure depreciates
// from the day it was FINISHED. Before this existed, the only way to record a
// house on old land was to flip the asset to "Building" — which depreciates the
// structure from the asset's purchase date, i.e. it would age a brand-new house
// by seven years the moment you saved it, and show you a loss you never took.
//
// So: an improvement carries its own date, its own cost, and its own rate. The
// asset's value is the base asset on its clock, plus each improvement on its own.
//
// It generalises past buildings: a renovation, a compound wall, an engine
// rebuild, stones added to a necklace. Anything that costs money and changes what
// the thing is worth, without being a separate thing.

export type ImprovementKind = 'appreciate' | 'depreciate' | 'flat'

export interface Improvement {
  id: string
  /** "Building", "Compound wall", "Kitchen renovation". */
  name: string
  /** When it was FINISHED — the day its clock starts. Not when the asset was bought. */
  date: string
  /** What it cost, in rupees. */
  cost: number
  /**
   * appreciate — worth more over time (an extra floor, a well)
   * depreciate — worth less over time (a structure, fittings)
   * flat       — worth exactly what it cost, forever (a boundary survey, legal fees)
   */
  kind: ImprovementKind
  /** %/yr. Ignored when kind is 'flat'. */
  rate_pct?: number
  /** Transactions that paid for this, if you tagged them. */
  transaction_ids?: string[]
  note?: string
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * Years since a date, fractionally. Negative — a date in the future — is clamped
 * to 0: a building you haven't finished yet has not started depreciating, and
 * letting the maths run backwards would make it worth MORE than it cost.
 */
export function yearsSince(dateStr: string | null | undefined, now = new Date()): number {
  if (!dateStr) return 0
  const then = new Date(dateStr)
  if (Number.isNaN(then.getTime())) return 0
  const years = (now.getTime() - then.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return Math.max(0, years)
}

/**
 * What one improvement is worth today, on ITS OWN clock.
 *
 * This is the entire point of the module. A structure finished last month is
 * worth what it cost; the same structure finished in 2019 is not.
 */
export function improvementValue(imp: Improvement, now = new Date()): number {
  const cost = num(imp.cost)
  if (cost <= 0) return 0
  if (imp.kind === 'flat') return round2(cost)

  const years = yearsSince(imp.date, now)
  const pct = Math.abs(num(imp.rate_pct))
  if (pct === 0) return round2(cost)

  const factor = imp.kind === 'appreciate'
    ? Math.pow(1 + pct / 100, years)
    : Math.pow(1 - pct / 100, years)

  // A depreciating thing tends to zero but never below it. You cannot owe money
  // for owning a wall.
  return round2(Math.max(0, cost * factor))
}

/** What you put in. */
export const improvementsCost = (imps: Improvement[] = []): number =>
  round2(imps.reduce((t, i) => t + num(i.cost), 0))

/** What they're worth now, all of them, each on its own clock. */
export const improvementsValue = (imps: Improvement[] = [], now = new Date()): number =>
  round2(imps.reduce((t, i) => t + improvementValue(i, now), 0))

/** Up or down since you spent the money. */
export const improvementsGain = (imps: Improvement[] = [], now = new Date()): number =>
  round2(improvementsValue(imps, now) - improvementsCost(imps))

export function validateImprovement(imp: Partial<Improvement>): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!(imp.name ?? '').trim()) errors.push('Give it a name — "Building", "Compound wall".')
  if (num(imp.cost) <= 0) errors.push('What did it cost?')

  // The date is not optional and not defaultable. Defaulting it to the asset's
  // purchase date is exactly the bug this module exists to prevent, and defaulting
  // it to today would quietly make every old structure brand new.
  if (!(imp.date ?? '').trim()) errors.push('When was it finished? Its value is measured from that day, not from when you bought the asset.')

  if (imp.kind !== 'flat' && num(imp.rate_pct) < 0) errors.push('The rate is a percentage per year — the direction comes from the type, so keep it positive.')
  return { ok: errors.length === 0, errors }
}

/**
 * Improvements paid for by tagged transactions.
 * Used to reconcile "did I actually account for every cement bill?"
 */
export function taggedTransactionIds(imps: Improvement[] = []): Set<string> {
  const ids = new Set<string>()
  for (const i of imps) for (const t of i.transaction_ids ?? []) ids.add(t)
  return ids
}

/**
 * Sum of transactions tagged to an improvement, so the UI can say "you've tagged
 * ₹38L of bills against a ₹40L building" — and, more usefully, when they DON'T
 * match, say so rather than silently trusting the typed figure.
 */
export function costFromTransactions(
  imp: Improvement,
  txnAmounts: Record<string, number>,
): number {
  return round2((imp.transaction_ids ?? []).reduce((t, id) => t + num(txnAmounts[id]), 0))
}

/**
 * Does the typed cost match the bills tagged to it?
 *
 * Returns null when nothing is tagged (nothing to check — you typed a lump sum,
 * which is allowed). Otherwise the difference, so the UI can show it. A mismatch
 * is NOT an error: you may have paid some of it in cash before using the app. It
 * is just something you'd want to know.
 */
export function costReconciliation(
  imp: Improvement,
  txnAmounts: Record<string, number>,
): { tagged: number; typed: number; difference: number } | null {
  if (!imp.transaction_ids?.length) return null
  const tagged = costFromTransactions(imp, txnAmounts)
  const typed = num(imp.cost)
  return { tagged, typed, difference: round2(typed - tagged) }
}
