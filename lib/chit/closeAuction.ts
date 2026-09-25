// Who won, when the foreman closes bidding.
//
// Closing used to do one thing: mark the window closed. The foreman then typed
// the winner and the amount into the auction form by hand, reading them off the
// bid list he had just been looking at. Two chances to get it wrong — a
// mistyped figure, or a close that never gets followed up — on the one record
// that decides who receives a lakh rupees.
//
// So closing now decides it. This file is the deciding, kept pure so the rule
// can be read in one screen and tested without a database. The same function
// picks the leader shown live on a member's phone, so the name on screen during
// the auction is the name written down at the end of it.

export interface BidRow {
  memberId: string
  amount: number
  /** ISO timestamp. The tie-break, and the only one anyone would accept. */
  placedAt: string
}

export interface Winner {
  memberId: string
  amount: number
}

/**
 * The standing leader.
 *
 * Highest amount wins. On an exact tie the EARLIER bid stands — two members can
 * land the same figure in the same second, and "whoever pressed first" is the
 * only tie-break that survives being questioned afterwards.
 *
 * `alreadyWon` is excluded. A member wins the pot once; that is the shape of a
 * chit. The live rules stop them bidding at all, so a bid from such a member
 * can only be older than their win — counting it would hand the same person the
 * pot twice.
 */
export function winnerFromBids(bids: BidRow[], alreadyWon: Iterable<string> = []): Winner | null {
  const barred = new Set(alreadyWon)
  const eligible = bids.filter(b => !barred.has(b.memberId) && Number.isFinite(b.amount) && b.amount > 0)
  if (eligible.length === 0) return null

  const leader = eligible.slice().sort((a, b) =>
    b.amount - a.amount || String(a.placedAt).localeCompare(String(b.placedAt)))[0]

  return { memberId: leader.memberId, amount: leader.amount }
}

export type CloseOutcome =
  | { kind: 'recorded'; winner: Winner }
  | { kind: 'no_bids' }

/**
 * What closing this window should do.
 *
 * Separated from the writing so the decision can be tested on its own, and so
 * "closed with nobody bidding" is a stated outcome rather than a silent one —
 * the foreman needs to be told that no auction was recorded, not left to notice.
 */
export function decideClose(bids: BidRow[], alreadyWon: Iterable<string> = []): CloseOutcome {
  const winner = winnerFromBids(bids, alreadyWon)
  return winner ? { kind: 'recorded', winner } : { kind: 'no_bids' }
}
