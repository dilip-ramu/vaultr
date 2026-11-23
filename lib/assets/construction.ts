// Money spent on building something you already own.
//
// WHY THIS EXISTS
//
// You own the land. You spend eighteen months buying cement, steel and labour.
// Each bill is a transaction in a category — Construction — and none of them is
// an expense in the ordinary sense: the money is still there, standing in the
// field as a wall. Tagging each one onto the asset by hand works, and nobody
// does it, because it is a second job done one bill at a time.
//
// So the CATEGORY carries the link. Anything filed under it counts towards the
// asset, with no extra click when the transaction is entered — not even an
// automatic one, because there is no copy to keep in step. The figure IS the
// sum of the bills. Add one and it rises, delete one and it falls, correct an
// amount and it follows. One number, so nothing can drift.
//
// ── THE BUCKET EMPTIES ──────────────────────────────────────────────────────
//
// A construction ends. The spend stops being work-in-progress and becomes the
// thing it built, which may well be an asset of its own. So the bucket is
// FOLDED: its total lands on another asset as one dated improvement, the bills
// behind it are recorded against that fold, and the bucket reads zero again —
// ready for the next project, whose spend is its own figure from the start.
//
// A fold is a SNAPSHOT on purpose. Once a building is finished and valued, its
// cost must not move because somebody corrected a two-year-old cement bill.
// The bills are remembered, so a later disagreement can be SHOWN rather than
// silently absorbed — the same rule the order P/L follows.
//
// Pure. No React, no database.

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

export interface SpendTxn {
  id: string
  /** Rupees. Signed amounts are taken at their absolute value: a bill is a bill. */
  amount: number
  date: string
  name?: string | null
}

export interface Fold {
  id: string
  /** The asset whose bucket was emptied. Optional: bucket() does not need it,
   *  the screens do. */
  sourceAssetId?: string
  /** The asset the bucket was folded INTO. */
  targetAssetId: string
  /** What it became: 'House', 'Second floor'. */
  improvementName: string
  /** The day the work was finished — the improvement's own clock starts here. */
  completedOn: string
  /** What was folded, as it stood on the day. Frozen. */
  amount: number
  /** Exactly which bills went in. */
  transactionIds: readonly string[]
}

export interface Bucket {
  /** What has been spent and not yet folded. */
  amount: number
  /** How many bills are behind it. */
  count: number
  /** The first and last of them, for 'since March'. */
  firstDate: string | null
  lastDate: string | null
  /** The bills themselves, oldest first. */
  transactions: SpendTxn[]
}

/**
 * What is in the bucket right now.
 *
 * Folded bills are excluded BY ID, not by date. A bill entered late but dated
 * before the fold would be wrongly swallowed by a date cut-off; by id it stays
 * in the new bucket, where it belongs, and is visible rather than lost.
 */
export function bucket(spend: readonly SpendTxn[], folds: readonly Fold[] = []): Bucket {
  const folded = new Set<string>()
  for (const f of folds) for (const id of f.transactionIds) folded.add(id)

  const live = spend
    .filter(t => !folded.has(t.id))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return {
    amount: r2(live.reduce((t, x) => t + Math.abs(num(x.amount)), 0)),
    count: live.length,
    firstDate: live.length ? live[0].date : null,
    lastDate: live.length ? live[live.length - 1].date : null,
    transactions: live,
  }
}

/** The bucket in words, for the asset screen. */
export function bucketWords(b: Bucket): string {
  if (b.count === 0) return 'Nothing spent yet on this one.'
  const bills = `${b.count} bill${b.count === 1 ? '' : 's'}`
  return b.firstDate === b.lastDate
    ? `${bills}, all on ${b.firstDate}`
    : `${bills}, ${b.firstDate} to ${b.lastDate}`
}

export type FoldKind = 'flat' | 'depreciate' | 'appreciate'

export interface FoldRequest {
  /** The asset holding the bucket — a category points at it. */
  sourceAssetId: string
  targetAssetId: string
  improvementName: string
  completedOn: string
  kind: FoldKind
  /** %/yr. Ignored when kind is 'flat'. */
  ratePct?: number | null
}

/** Why a fold cannot go ahead, or null when it can. */
export function foldProblem(b: Bucket, r: FoldRequest): string | null {
  if (b.count === 0) return 'There is nothing in this bucket to fold.'
  if (!r.targetAssetId) return 'Pick the asset this becomes part of.'
  // Folding a bucket into itself would wipe the bucket and add the same money
  // straight back as an improvement — a no-op that looks like a reset.
  if (r.targetAssetId === r.sourceAssetId) return 'Pick a different asset — a bucket cannot be folded into itself.'
  if (!r.improvementName.trim()) return 'Give it a name, so the asset says what was built.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.completedOn)) return 'Say when the work was finished.'
  if (r.kind !== 'flat' && !(num(r.ratePct) > 0)) return 'Set the yearly rate, or choose worth-what-it-cost.'
  return null
}

export interface ImprovementDraft {
  name: string
  date: string
  cost: number
  kind: FoldKind
  rate_pct?: number
  transaction_ids: string[]
  note: string
}

export interface FoldResult {
  /** Appended to the target asset's improvements. */
  improvement: ImprovementDraft
  /** Stored so the bucket knows these bills are done with. */
  fold: Omit<Fold, 'id'> & { sourceAssetId: string }
}

/**
 * Everything a fold produces: one improvement on the target, one record of
 * what went into it.
 *
 * The caller checks foldProblem first. This does no validating of its own
 * beyond refusing to invent money — it is the arithmetic, not the gatekeeper.
 */
export function foldBucket(b: Bucket, r: FoldRequest): FoldResult {
  const ids = b.transactions.map(t => t.id)
  const cost = r2(b.amount)
  const note = b.firstDate === b.lastDate
    ? `${b.count} bill${b.count === 1 ? '' : 's'} on ${b.firstDate}.`
    : `${b.count} bill${b.count === 1 ? '' : 's'} from ${b.firstDate} to ${b.lastDate}.`

  return {
    improvement: {
      name: r.improvementName.trim(),
      date: r.completedOn,
      cost,
      kind: r.kind,
      ...(r.kind === 'flat' ? {} : { rate_pct: num(r.ratePct) }),
      transaction_ids: ids,
      note,
    },
    fold: {
      sourceAssetId: r.sourceAssetId,
      targetAssetId: r.targetAssetId,
      improvementName: r.improvementName.trim(),
      completedOn: r.completedOn,
      amount: cost,
      transactionIds: ids,
    },
  }
}

/**
 * Do the bills behind a finished fold still add up to what was folded?
 *
 * A fold is frozen, so a corrected bill does NOT move a finished building's
 * cost. But the disagreement is worth saying out loud rather than hiding:
 * either the correction is right and the asset should be adjusted, or the
 * correction is wrong. Silence helps neither.
 */
export function foldDrift(f: Fold, spend: readonly SpendTxn[]): { difference: number; words: string } | null {
  const byId = new Map(spend.map(t => [t.id, t]))
  let now = 0
  let missing = 0
  for (const id of f.transactionIds) {
    const t = byId.get(id)
    if (!t) { missing++; continue }
    now += Math.abs(num(t.amount))
  }
  const difference = r2(now - num(f.amount))
  if (Math.abs(difference) < 0.01 && missing === 0) return null

  const bits: string[] = []
  if (Math.abs(difference) >= 0.01) {
    bits.push(`the bills behind it now come to ₹${Math.round(now).toLocaleString('en-IN')}, ${difference > 0 ? 'more' : 'less'} than the ₹${Math.round(num(f.amount)).toLocaleString('en-IN')} folded`)
  }
  if (missing > 0) bits.push(`${missing} of them ${missing === 1 ? 'has' : 'have'} since been deleted`)
  return { difference, words: `${f.improvementName}: ${bits.join(', ')}.` }
}
