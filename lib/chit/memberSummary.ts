// Everything one member's position adds up to. PURE — give it rows, get a
// picture. No database here, so the arithmetic can be tested directly.
//
// The question this answers is the one asked across a table in a chit office:
// "how many chits is he in, what has he taken, what does he still owe?" It has
// to be right, and it has to be consistent with the passbook the member holds,
// so every figure below comes from recorded rows — dues raised, payments
// received, auctions held — and never from a formula applied to a total.

export interface DueRow {
  group_id: string
  member_id: string
  month_number: number
  amount: number | string
  due_date?: string | null
  status?: string | null
}

export interface PaidRow {
  group_id: string
  member_id: string
  month_number: number
  amount: number | string
  paid_date?: string | null
}

export interface AuctionRow {
  group_id: string
  month_number: number
  winner_member_id?: string | null
  bid_amount?: number | string | null
  net_payout?: number | string | null
  dividend_per_member?: number | string | null
  paid_at?: string | null
}

export interface GroupRow {
  id: string
  name: string
  chit_value: number | string
  members: number | string
  status?: string | null
  start_date?: string | null
}

export interface MembershipRow {
  group_id: string
  member_id: string
  slot_number?: number | null
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface MemberGroupPosition {
  groupId: string
  groupName: string
  chitValue: number
  totalMonths: number
  slotNumber: number | null
  status: string
  /** Dues raised against this member so far. */
  billed: number
  /** What they have actually paid. */
  paid: number
  /** Still owed. Never negative — an overpayment is shown as advance. */
  owed: number
  advance: number
  /** Instalments past their due date and unpaid. */
  overdueCount: number
  /** Dividends credited to them across the months held so far. */
  dividendsEarned: number
  /** Have they taken the prize, and what did they receive. */
  hasWon: boolean
  wonMonth: number | null
  prizeReceived: number
  prizePaid: boolean
  /** Months of this chit that have actually been auctioned. */
  monthsHeld: number
}

export interface MemberSummary {
  groupCount: number
  activeGroupCount: number
  totalBilled: number
  totalPaid: number
  totalOwed: number
  totalAdvance: number
  totalOverdue: number
  totalDividends: number
  /** Prize money received across all chits. */
  totalPrize: number
  /** Prizes won but not yet paid out. */
  prizeDue: number
  chitsWon: number
  groups: MemberGroupPosition[]
}

/**
 * One member's position across every chit they are in.
 *
 * `asOf` decides what counts as overdue. It is passed in rather than read from
 * the clock so the same rows always produce the same answer in a test.
 */
export function summariseMember(params: {
  memberId: string
  memberships: MembershipRow[]
  groups: GroupRow[]
  dues: DueRow[]
  payments: PaidRow[]
  auctions: AuctionRow[]
  asOf?: Date
}): MemberSummary {
  const { memberId } = params
  const asOf = params.asOf ?? new Date()
  const today = new Date(asOf); today.setHours(0, 0, 0, 0)

  const byId = new Map(params.groups.map(g => [g.id, g]))
  const mine = params.memberships.filter(m => m.member_id === memberId)

  const groups: MemberGroupPosition[] = []

  for (const m of mine) {
    const g = byId.get(m.group_id)
    if (!g) continue

    const dues = params.dues.filter(d => d.member_id === memberId && d.group_id === m.group_id)
    const paid = params.payments.filter(p => p.member_id === memberId && p.group_id === m.group_id)
    const auctions = params.auctions.filter(a => a.group_id === m.group_id)

    const billed = round2(dues.reduce((s, d) => s + num(d.amount), 0))
    const paidTotal = round2(paid.reduce((s, p) => s + num(p.amount), 0))
    const balance = round2(billed - paidTotal)

    // An unpaid instalment past its date. Status is trusted when it says PAID,
    // because a collection may have been recorded without a matching status
    // flip, and counting it overdue would be a false accusation.
    const overdueCount = dues.filter(d =>
      String(d.status ?? '').toUpperCase() !== 'PAID'
      && d.due_date != null && new Date(d.due_date) < today,
    ).length

    // The dividend belongs to every member for every month that has actually
    // been auctioned — including the month they themselves won.
    const dividendsEarned = round2(auctions.reduce((s, a) => s + num(a.dividend_per_member), 0))

    const win = auctions.find(a => a.winner_member_id === memberId) ?? null

    groups.push({
      groupId: g.id,
      groupName: g.name,
      chitValue: num(g.chit_value),
      totalMonths: num(g.members),
      slotNumber: m.slot_number ?? null,
      status: String(g.status ?? 'active'),
      billed,
      paid: paidTotal,
      owed: balance > 0 ? balance : 0,
      advance: balance < 0 ? round2(-balance) : 0,
      overdueCount,
      dividendsEarned,
      hasWon: Boolean(win),
      wonMonth: win ? num(win.month_number) : null,
      prizeReceived: win ? num(win.net_payout) : 0,
      prizePaid: Boolean(win?.paid_at),
      monthsHeld: auctions.length,
    })
  }

  groups.sort((a, b) => a.groupName.localeCompare(b.groupName))

  const sum = (pick: (g: MemberGroupPosition) => number) =>
    round2(groups.reduce((s, g) => s + pick(g), 0))

  return {
    groupCount: groups.length,
    activeGroupCount: groups.filter(g => g.status === 'active').length,
    totalBilled: sum(g => g.billed),
    totalPaid: sum(g => g.paid),
    totalOwed: sum(g => g.owed),
    totalAdvance: sum(g => g.advance),
    totalOverdue: groups.reduce((s, g) => s + g.overdueCount, 0),
    totalDividends: sum(g => g.dividendsEarned),
    totalPrize: sum(g => (g.prizePaid ? g.prizeReceived : 0)),
    prizeDue: sum(g => (g.hasWon && !g.prizePaid ? g.prizeReceived : 0)),
    chitsWon: groups.filter(g => g.hasWon).length,
    groups,
  }
}
