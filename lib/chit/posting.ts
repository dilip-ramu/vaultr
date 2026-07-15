// Turning a chit event into real money.
//
// This is the entire reason chit lives inside Vaultr instead of a separate app.
// A collection isn't a number in a side ledger — it's ₹5,000 arriving in a bank
// account. A payout isn't a status flag — it's ₹85,000 leaving one. So both post
// an actual transaction, and from that moment the money is in your net worth,
// your Books, your per-company view, like any other rupee.
//
// The rules that keep it honest live here, in one place, so no screen can post a
// chit transaction a slightly different way:
//
//   • A COLLECTION is INCOME into the chosen account.
//   • A PAYOUT is an EXPENSE out of the chosen account.
//   • Each links back to the chit row (income_transaction_id / payout_transaction_id)
//     so it's posted at most ONCE. Re-marking a paid collection does nothing.
//   • The account MUST belong to the group's company (or be explicitly chosen),
//     because "which company got paid" is the question you asked for.

export interface PostArgs {
  userId: string
  accountId: string
  amount: number
  date: string
  /** For the transaction name and category. */
  groupName: string
  memberName?: string
  monthNumber: number
}

/** The transaction row for a collection coming IN. */
export function collectionTransaction(a: PostArgs) {
  return {
    user_id: a.userId,
    account_id: a.accountId,
    type: 'income' as const,
    amount: round2(a.amount),
    date: a.date,
    name: a.memberName
      ? `Chit collection — ${a.memberName} (${a.groupName} M${a.monthNumber})`
      : `Chit collection — ${a.groupName} M${a.monthNumber}`,
    // A stable, human category so chit money is filterable in the ledger and the
    // per-company view without hunting.
    notes: `Chit: ${a.groupName}, month ${a.monthNumber}`,
  }
}

/** The transaction row for a payout going OUT. */
export function payoutTransaction(a: PostArgs) {
  return {
    user_id: a.userId,
    account_id: a.accountId,
    type: 'expense' as const,
    amount: round2(a.amount),
    date: a.date,
    name: a.memberName
      ? `Chit payout — ${a.memberName} (${a.groupName} M${a.monthNumber})`
      : `Chit payout — ${a.groupName} M${a.monthNumber}`,
    notes: `Chit: ${a.groupName}, month ${a.monthNumber} winner payout`,
  }
}

/** The category name chit transactions are filed under, created if absent. */
export const CHIT_INCOME_CATEGORY = 'Chit Collections'
export const CHIT_EXPENSE_CATEGORY = 'Chit Payouts'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Guard: has this chit row already been posted?
 *
 * Returns true when a transaction id is already recorded, so callers can refuse
 * to post a second time. Marking a paid collection paid again, or clicking the
 * payout button twice, must NOT create a duplicate — that's real money doubled.
 */
export const alreadyPosted = (transactionId: string | null | undefined): boolean =>
  !!transactionId
