// Everyone's position in one group, in one pass.
//
// The collection screen, the member page, the statement and the dashboard all
// need the same answer — what does each member owe right now, after anything
// they overpaid earlier. Working it out four times in four files is how four
// screens come to disagree about money, so it is worked out here once and they
// all read it.
//
// Pure. Give it rows, get a picture.

import { memberLedger, type MemberLedger, type DueMonth } from './memberLedger'
import { monthlyDue } from './auction'

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface AuctionRow {
  group_id?: string
  month_number: number | string
  dividend_per_member?: number | string | null
  auction_date?: string | null
}

export interface CollectionRow {
  group_id?: string
  member_id: string
  month_number: number | string
  amount: number | string
}

export interface CreditMoveRow {
  member_id: string
  from_group_id: string
  to_group_id: string
  to_month: number | string
  amount: number | string
}

export interface GroupLedgerInput {
  groupId: string
  /** The full monthly instalment, before any dividend. */
  installment: number
  memberIds: string[]
  /** Every auction in this group. Only those already held raise a due. */
  auctions: AuctionRow[]
  collections: CollectionRow[]
  creditMoves?: CreditMoveRow[]
  /** Only auctions on or before this date have happened. Omit to count them all. */
  asOf?: string
}

export interface GroupLedger {
  /** member id → where they stand. */
  byMember: Map<string, MemberLedger>
  /** The months that have been auctioned, with the due each raises. */
  dues: DueMonth[]
  /** Everything still owed across the group. */
  outstanding: number
  /** How many member-months are short. The number worth putting on a tab. */
  pendingCount: number
  /** Credit members in this group are holding. */
  creditHeld: number
}

export function groupLedger(input: GroupLedgerInput): GroupLedger {
  const inGroup = (r: { group_id?: string }) =>
    r.group_id === undefined || r.group_id === input.groupId

  // A month raises a due only once its auction has actually been held — the
  // dividend that sets the figure does not exist before that, so counting it
  // would invent a debt.
  const dues: DueMonth[] = input.auctions
    .filter(inGroup)
    .filter(a => !input.asOf || !a.auction_date || String(a.auction_date) <= input.asOf)
    .map(a => ({
      month: num(a.month_number),
      due: monthlyDue(input.installment, num(a.dividend_per_member)),
    }))
    .sort((a, b) => a.month - b.month)

  const byMember = new Map<string, MemberLedger>()
  let outstanding = 0
  let pendingCount = 0
  let creditHeld = 0

  for (const memberId of input.memberIds) {
    const payments = input.collections
      .filter(c => inGroup(c) && c.member_id === memberId)
      .map(c => ({ month: num(c.month_number), amount: num(c.amount) }))

    const moves = input.creditMoves ?? []
    const creditIn = moves
      .filter(m => m.member_id === memberId && m.to_group_id === input.groupId)
      .map(m => ({ month: num(m.to_month), amount: num(m.amount) }))
    const creditOut = moves
      .filter(m => m.member_id === memberId && m.from_group_id === input.groupId)
      .reduce((t, m) => t + num(m.amount), 0)

    const ledger = memberLedger(dues, payments, { creditIn, creditOut })
    byMember.set(memberId, ledger)

    outstanding = round2(outstanding + ledger.arrears)
    creditHeld = round2(creditHeld + ledger.credit)
    pendingCount += ledger.months.filter(m => m.outstanding > 0).length
  }

  return { byMember, dues, outstanding, pendingCount, creditHeld }
}

/** An empty position, so a screen never has to handle `undefined`. */
export const NO_LEDGER: MemberLedger = {
  owedToDate: 0, paidToDate: 0, balance: 0, credit: 0, arrears: 0, months: [],
}

export function ledgerFor(g: GroupLedger, memberId: string): MemberLedger {
  return g.byMember.get(memberId) ?? NO_LEDGER
}
