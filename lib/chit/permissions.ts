// What each chit role may do. PURE — no database, no request, no Next imports.
//
// Split out of access.ts on purpose. Resolving WHO you are needs the request and
// the database; deciding WHAT that person may do is arithmetic on a role, and
// arithmetic should be testable without standing up a server. A role check that
// is wrong in one direction is an annoyance; wrong in the other, it is a
// stranger in the ledger. So it is stated once, here, and tested exhaustively.

export type ChitRole = 'owner' | 'partner' | 'collector' | 'viewer'

export const CAN = {
  /** Everyone granted access can read the chit books — that is the grant. */
  read:             (_r: ChitRole) => true,
  recordCollection: (r: ChitRole) => r === 'owner' || r === 'partner' || r === 'collector',
  manageMembers:    (r: ChitRole) => r === 'owner' || r === 'partner',
  runAuction:       (r: ChitRole) => r === 'owner' || r === 'partner',
  manageGroups:     (r: ChitRole) => r === 'owner' || r === 'partner',
  /** Deleting a group takes its auctions and collections with it. Owner only,
   *  and a restrictive database policy says so independently (v120). */
  deleteGroup:      (r: ChitRole) => r === 'owner',
  /** Changing the pot or the member count after money has moved rewrites what
   *  every past month meant. Owner only. */
  changeChitTerms:  (r: ChitRole) => r === 'owner',
  /** Otherwise a partner could promote themselves, and the grant would stop
   *  being the owner's decision. */
  manageAdmins:     (r: ChitRole) => r === 'owner',
  /**
   * The partner statement — the bank balance, and every movement in the
   * account including the ones that are not chit money.
   *
   * Partners are shareholders in the business, and the statement is the
   * document written FOR them; withholding it from the people it is addressed
   * to would be an odd kind of transparency. A collector records payments and a
   * viewer reads the chit: neither needs the balance of a bank account, so
   * neither gets it.
   */
  viewStatement:    (r: ChitRole) => r === 'owner' || r === 'partner',
} satisfies Record<string, (r: ChitRole) => boolean>

/** Refusal, in words a person can act on. */
export function forbidden(what: string, role: ChitRole): string {
  if (role === 'owner') return `You cannot ${what}.`
  return `Your access covers the chit module, but not ${what}. Ask the account owner.`
}
