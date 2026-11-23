// Every transaction connected to an asset, and why.
//
// WHY THIS EXISTS
//
// An asset accumulates money from five directions, and until now each one was
// visible only in the place that created it:
//
//   • the expense that bought it            (purchase_transaction_id)
//   • the income from selling it            (sale_transaction_id)
//   • bills tagged onto an improvement      (improvement.transaction_ids)
//   • bills arriving through a funding category, not yet folded  (the bucket)
//   • bills already folded away into another asset
//
// So "what has this thing actually cost me" meant opening four screens and
// adding up by hand. This gathers them, grouped by WHY each one is attached,
// because a list of twenty amounts with no reason against them is not an
// answer — the purchase, the wall and the sale are different kinds of money.
//
// A TRANSACTION THAT NO LONGER EXISTS IS REPORTED, NOT DROPPED. An id with
// nothing behind it means a bill was deleted after being tagged, and the
// asset's figures were built on it. Saying so is the difference between a
// number you can trust and one you cannot.
//
// Pure. No React, no database.

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

export interface TxnRow {
  id: string
  name?: string | null
  amount: number
  date: string
  type?: string | null
}

export type LinkReason = 'purchase' | 'sale' | 'improvement' | 'bucket' | 'folded'

export interface LinkedTxn {
  id: string
  name: string
  amount: number
  date: string
  /** False when the transaction behind this id is gone. */
  found: boolean
}

export interface LinkedGroup {
  reason: LinkReason
  /** 'Bought with', 'Compound wall', 'Building up now'. */
  label: string
  total: number
  txns: LinkedTxn[]
  /** How many of its ids no longer have a transaction. */
  missing: number
}

export interface LinkedInput {
  purchaseTransactionId?: string | null
  saleTransactionId?: string | null
  /** Improvements on the asset, each with the bills tagged to it. */
  improvements?: readonly { name: string; transaction_ids?: readonly string[] }[]
  /** The live bucket's bills — spend not yet folded. */
  bucketTxns?: readonly TxnRow[]
  /** Buckets folded out of this asset. */
  folds?: readonly { improvementName: string; completedOn: string; transactionIds: readonly string[] }[]
  /** Every transaction the page could find, by id. */
  byId: ReadonlyMap<string, TxnRow>
}

function resolve(ids: readonly string[], byId: ReadonlyMap<string, TxnRow>): LinkedTxn[] {
  return ids.map(id => {
    const t = byId.get(id)
    return t
      ? { id, name: (t.name ?? '').trim() || 'Untitled', amount: Math.abs(num(t.amount)), date: String(t.date).slice(0, 10), found: true }
      : { id, name: 'Deleted transaction', amount: 0, date: '', found: false }
  })
}

function group(reason: LinkReason, label: string, txns: LinkedTxn[]): LinkedGroup {
  return {
    reason,
    label,
    total: r2(txns.reduce((s, t) => s + t.amount, 0)),
    // Newest first inside a group; a missing one has no date, so it sinks.
    txns: [...txns].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    missing: txns.filter(t => !t.found).length,
  }
}

export interface Linked {
  groups: LinkedGroup[]
  /** Everything that went IN: purchase, improvements, bucket, folds. */
  spent: number
  /** Everything that came OUT: the sale. */
  received: number
  count: number
  missing: number
}

/**
 * Everything attached to one asset, grouped by why.
 *
 * Order is deliberate: how it started, what was added to it, what is being
 * added right now, what has been folded away, and finally how it ended. That
 * reads as the asset's story rather than as a database dump.
 */
export function linkedTransactions(i: LinkedInput): Linked {
  const groups: LinkedGroup[] = []

  if (i.purchaseTransactionId) {
    groups.push(group('purchase', 'Bought with', resolve([i.purchaseTransactionId], i.byId)))
  }

  for (const imp of i.improvements ?? []) {
    const ids = imp.transaction_ids ?? []
    if (ids.length === 0) continue
    groups.push(group('improvement', imp.name || 'Improvement', resolve(ids, i.byId)))
  }

  const live = i.bucketTxns ?? []
  if (live.length > 0) {
    groups.push(group('bucket', 'Building up now', resolve(live.map(t => t.id), i.byId)))
  }

  for (const f of i.folds ?? []) {
    if (f.transactionIds.length === 0) continue
    groups.push(group('folded', `${f.improvementName} — folded ${f.completedOn}`, resolve([...f.transactionIds], i.byId)))
  }

  if (i.saleTransactionId) {
    groups.push(group('sale', 'Sold for', resolve([i.saleTransactionId], i.byId)))
  }

  const spent = r2(groups.filter(g => g.reason !== 'sale').reduce((s, g) => s + g.total, 0))
  const received = r2(groups.filter(g => g.reason === 'sale').reduce((s, g) => s + g.total, 0))

  return {
    groups,
    spent,
    received,
    count: groups.reduce((s, g) => s + g.txns.length, 0),
    missing: groups.reduce((s, g) => s + g.missing, 0),
  }
}

/** What to say when an asset has nothing attached. */
export function nothingLinkedWords(hasFundingCategory: boolean): string {
  return hasFundingCategory
    ? 'No transactions attached yet. The next bill filed under its category will appear here.'
    : 'No transactions attached. Tag an expense onto this asset, or point a category at it, and they show up here.'
}

/** One line about deleted transactions, or null when there are none. */
export function missingWords(l: Linked): string | null {
  if (l.missing === 0) return null
  return l.missing === 1
    ? 'One transaction behind these figures has since been deleted.'
    : `${l.missing} transactions behind these figures have since been deleted.`
}
