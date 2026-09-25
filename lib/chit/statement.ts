// THE MONTHLY PARTNER STATEMENT.
//
// Ten partners share this business and only one of them owns the app. That is
// an uncomfortable position to be in when a question comes up about money two
// years from now, so once a month every partner gets the same document, built
// from the ledger rather than from anybody's summary of it.
//
// Two rules shaped this file.
//
// FIRST: nothing here is a claim. Every figure is a sum of transaction rows
// that exist in the Unyra Capital account, and the statement shows the
// arithmetic — opening, plus in, minus out, equals closing — so a partner with
// the bank's own statement beside them can tick every line. A number a reader
// cannot check is worse than no number.
//
// SECOND: the awkward rows are the point. A statement that only lists chit
// collections and payouts would hide exactly the movements a partner most
// wants explained: the transfer out, the fee, the cash withdrawal. So every
// transaction in the account is listed, and anything that is not a chit
// collection or a chit payout is marked "Other" and counted separately. If
// there are none, the statement says so in words.
//
// Pure. No database, no request, no rendering. All of it is tested, because a
// statement that is quietly wrong is worse than no statement at all — it buys
// a trust the numbers have not earned.

import { monthlyInstallment } from './auction'

const round2 = (n: number) => Math.round(n * 100) / 100

/* ── What goes in ─────────────────────────────────────────────────────────── */

export interface StatementTxn {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  date: string                 // YYYY-MM-DD
  name: string | null
  account_id: string
  to_account_id: string | null
  category_name?: string | null
}

export interface StatementCollection {
  group_id: string
  member_id: string
  month_number: number
  amount: number
  paid_date: string
  income_transaction_id: string | null
}

export interface StatementAuction {
  group_id: string
  month_number: number
  auction_date: string
  winner_member_id: string | null
  bid_amount: number
  commission: number
  net_payout: number
  dividend_per_member: number
  payout_transaction_id: string | null
}

export interface StatementGroup {
  id: string
  name: string
  chit_value: number
  members: number
  status: string
}

export interface StatementInput {
  accountId: string
  accountName: string
  /** Where the account started, before any transaction. */
  initialBalance: number
  /** What Inex itself holds as the account's balance today, for cross-checking. */
  recordedBalance: number | null
  periodStart: string          // YYYY-MM-DD, inclusive
  periodEnd: string            // YYYY-MM-DD, inclusive
  /** EVERY transaction touching this account, any date. Order does not matter. */
  txns: StatementTxn[]
  collections: StatementCollection[]
  auctions: StatementAuction[]
  groups: StatementGroup[]
  /** member id → what to print. */
  memberNames: Record<string, { name: string; code: string | null }>
  /** member id → group ids they are on the roster for. */
  rosterByGroup: Record<string, string[]>
}

/* ── What comes out ───────────────────────────────────────────────────────── */

export type LineKind = 'collection' | 'payout' | 'other'

export interface StatementLine {
  id: string
  date: string
  description: string
  kind: LineKind
  /** Signed effect on this account. Positive is money in. */
  effect: number
  /** Balance after this line. */
  running: number
}

export interface GroupBlock {
  id: string
  name: string
  chitValue: number
  membersPlanned: number
  membersOnRoster: number
  installment: number
  /** The auction held inside the period, if any. */
  auction: {
    monthNumber: number
    date: string
    winner: string
    bid: number
    commission: number
    dividendPerMember: number
    netPayout: number
    paid: boolean
  } | null
  collectionCount: number
  collectionTotal: number
  payoutTotal: number
  /** Unpaid installments for auction months that have already run, at period end. */
  outstanding: number
  outstandingCount: number
}

export interface ChitStatement {
  accountName: string
  periodStart: string
  periodEnd: string
  periodLabel: string

  opening: number
  moneyIn: number
  moneyOut: number
  closing: number

  /** What Inex holds for the account, and whether it agrees. Only meaningful
   *  when the period runs up to today; otherwise null. */
  recordedBalance: number | null
  difference: number | null

  collectionsIn: number
  payoutsOut: number
  otherIn: number
  otherOut: number

  lines: StatementLine[]
  groups: GroupBlock[]

  /** Plain sentences a reader should not have to work out for themselves. */
  notes: string[]
}

/* ── Periods ──────────────────────────────────────────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** Last day of a month, 1-indexed month. Leap years included. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export interface Period { start: string; end: string; label: string; key: string }

/** A whole calendar month, from its key: "2026-08". */
export function monthPeriod(key: string): Period {
  const [y, m] = key.split('-').map(Number)
  const last = lastDayOfMonth(y, m)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${y}-${pad(m)}-01`,
    end: `${y}-${pad(m)}-${pad(last)}`,
    label: `${MONTHS[m - 1]} ${y}`,
    key: `${y}-${pad(m)}`,
  }
}

/** The month before the one `today` falls in — what you send on the 1st. */
export function lastCompletedMonth(today: string): Period {
  const [y, m] = today.split('-').map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return monthPeriod(`${py}-${String(pm).padStart(2, '0')}`)
}

/** The months a statement can be drawn for: this month back through `count`. */
export function selectableMonths(today: string, count = 13): Period[] {
  const [y, m] = today.split('-').map(Number)
  const out: Period[] = []
  for (let i = 0; i < count; i++) {
    const total = y * 12 + (m - 1) - i
    const yy = Math.floor(total / 12)
    const mm = (total % 12) + 1
    out.push(monthPeriod(`${yy}-${String(mm).padStart(2, '0')}`))
  }
  return out
}

/* ── The signed effect of a transaction on one account ────────────────────── */
// Mirrors lib/reconcile.ts and the account_balances SQL view. Restated here
// rather than imported so this module stays free of the ledger's own types,
// and so a change there cannot silently change what partners are shown.
export function effectOn(t: StatementTxn, accountId: string): number {
  if (t.type === 'income' && t.account_id === accountId) return t.amount
  if (t.type === 'expense' && t.account_id === accountId) return -t.amount
  if (t.type === 'transfer' && t.account_id === accountId) return -t.amount
  if (t.type === 'transfer' && t.to_account_id === accountId) return t.amount
  return 0
}

/* ── Building the statement ───────────────────────────────────────────────── */

export function buildStatement(input: StatementInput): ChitStatement {
  const {
    accountId, accountName, initialBalance, recordedBalance,
    periodStart, periodEnd, txns, collections, auctions, groups,
    memberNames, rosterByGroup,
  } = input

  const period = { start: periodStart, end: periodEnd }
  const label = periodLabelFor(periodStart, periodEnd)

  // Which transactions are chit money, and which are not. A collection or a
  // payout is only "chit" because a chit row points at it — not because of
  // what its description happens to say. A renamed transaction cannot slip
  // out of the count.
  const collectionTxnIds = new Set(
    collections.map(c => c.income_transaction_id).filter((x): x is string => !!x))
  const payoutTxnIds = new Set(
    auctions.map(a => a.payout_transaction_id).filter((x): x is string => !!x))

  const mine = txns
    .filter(t => t.account_id === accountId || t.to_account_id === accountId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  // Opening: everything that happened strictly before the period.
  let running = round2(initialBalance)
  let opening = running
  for (const t of mine) {
    if (t.date >= period.start) break
    running = round2(running + effectOn(t, accountId))
    opening = running
  }

  const lines: StatementLine[] = []
  let moneyIn = 0, moneyOut = 0
  let collectionsIn = 0, payoutsOut = 0, otherIn = 0, otherOut = 0

  for (const t of mine) {
    if (t.date < period.start || t.date > period.end) continue
    const effect = round2(effectOn(t, accountId))
    if (effect === 0) continue
    running = round2(running + effect)

    const kind: LineKind = collectionTxnIds.has(t.id) ? 'collection'
      : payoutTxnIds.has(t.id) ? 'payout'
      : 'other'

    if (effect > 0) moneyIn = round2(moneyIn + effect)
    else moneyOut = round2(moneyOut - effect)

    if (kind === 'collection') collectionsIn = round2(collectionsIn + effect)
    else if (kind === 'payout') payoutsOut = round2(payoutsOut - effect)
    else if (effect > 0) otherIn = round2(otherIn + effect)
    else otherOut = round2(otherOut - effect)

    lines.push({
      id: t.id,
      date: t.date,
      description: t.name?.trim() || t.category_name?.trim() || 'Unnamed transaction',
      kind,
      effect,
      running,
    })
  }

  const closing = running

  // Did the account keep moving after the period? Then Inex's own balance is
  // for today, not for the period end, and comparing the two proves nothing.
  const movedAfter = mine.some(t => t.date > period.end && effectOn(t, accountId) !== 0)
  const comparable = recordedBalance != null && !movedAfter
  const difference = comparable ? round2(recordedBalance! - closing) : null

  /* ── Per group ──────────────────────────────────────────────────────────── */

  const groupBlocks: GroupBlock[] = groups.map(g => {
    const installment = monthlyInstallment({ chitValue: g.chit_value, members: g.members })
    const roster = rosterByGroup[g.id] ?? []

    const inPeriod = collections.filter(c =>
      c.group_id === g.id && c.paid_date >= period.start && c.paid_date <= period.end)
    const auctionsInPeriod = auctions.filter(a =>
      a.group_id === g.id && a.auction_date >= period.start && a.auction_date <= period.end)
    const a = auctionsInPeriod.sort((x, y) => y.month_number - x.month_number)[0] ?? null

    // What is owed, measured only against auctions that have actually run by
    // the period end. A month whose auction has not happened owes nothing —
    // counting it would invent a debt.
    const runByEnd = auctions.filter(x => x.group_id === g.id && x.auction_date <= period.end)
    const paidSlots = new Set(collections
      .filter(c => c.group_id === g.id && c.paid_date <= period.end)
      .map(c => `${c.member_id}:${c.month_number}`))

    let outstanding = 0, outstandingCount = 0
    for (const month of runByEnd) {
      const due = Math.max(0, round2(installment - Number(month.dividend_per_member || 0)))
      for (const memberId of roster) {
        if (!paidSlots.has(`${memberId}:${month.month_number}`)) {
          outstanding = round2(outstanding + due)
          outstandingCount++
        }
      }
    }

    return {
      id: g.id,
      name: g.name,
      chitValue: g.chit_value,
      membersPlanned: g.members,
      membersOnRoster: roster.length,
      installment,
      auction: a ? {
        monthNumber: a.month_number,
        date: a.auction_date,
        winner: a.winner_member_id
          ? nameOf(memberNames, a.winner_member_id)
          : 'No winner recorded',
        bid: Number(a.bid_amount) || 0,
        commission: Number(a.commission) || 0,
        dividendPerMember: Number(a.dividend_per_member) || 0,
        netPayout: Number(a.net_payout) || 0,
        paid: !!a.payout_transaction_id,
      } : null,
      collectionCount: inPeriod.length,
      collectionTotal: round2(inPeriod.reduce((s, c) => s + Number(c.amount), 0)),
      payoutTotal: round2(auctionsInPeriod
        .filter(x => x.payout_transaction_id)
        .reduce((s, x) => s + Number(x.net_payout), 0)),
      outstanding,
      outstandingCount,
    }
  })

  /* ── Notes: what a reader should not have to work out ───────────────────── */

  const notes: string[] = []

  if (lines.length === 0) {
    notes.push(`No money moved through ${accountName} in this period. The balance is unchanged.`)
  }

  const otherLines = lines.filter(l => l.kind === 'other')
  if (otherLines.length === 0 && lines.length > 0) {
    notes.push('Every transaction in this period is a chit collection or a chit payout. Nothing else moved through the account.')
  } else if (otherLines.length > 0) {
    notes.push(
      `${otherLines.length} transaction${otherLines.length === 1 ? '' : 's'} `
      + `${otherLines.length === 1 ? 'was' : 'were'} not a chit collection or payout, `
      + `totalling ${signed(otherIn - otherOut)}. They are marked "Other" in the list and are `
      + 'shown so they can be questioned, not because anything is wrong with them.')
  }

  // Collections and payouts recorded in the chit books but never posted to the
  // account. These are the discrepancies that matter, so they are named.
  const unpostedCollections = collections.filter(c =>
    c.paid_date >= period.start && c.paid_date <= period.end && !c.income_transaction_id)
  if (unpostedCollections.length > 0) {
    const total = round2(unpostedCollections.reduce((s, c) => s + Number(c.amount), 0))
    notes.push(
      `${unpostedCollections.length} collection${unpostedCollections.length === 1 ? '' : 's'} `
      + `totalling ${money(total)} ${unpostedCollections.length === 1 ? 'is' : 'are'} recorded in the chit `
      + 'books but has no matching transaction in this account, so it is not in the balance above.')
  }

  const unpaidAuctions = auctions.filter(a =>
    a.auction_date >= period.start && a.auction_date <= period.end
    && !a.payout_transaction_id && Number(a.net_payout) > 0)
  if (unpaidAuctions.length > 0) {
    const total = round2(unpaidAuctions.reduce((s, a) => s + Number(a.net_payout), 0))
    notes.push(
      `${unpaidAuctions.length} auction${unpaidAuctions.length === 1 ? '' : 's'} `
      + `worth ${money(total)} ${unpaidAuctions.length === 1 ? 'has' : 'have'} been held but not yet paid out. `
      + 'That money is still in the account.')
  }

  if (difference != null && difference !== 0) {
    notes.push(
      `The balance Inex holds for this account differs from the total above by ${money(Math.abs(difference))}. `
      + 'This needs explaining before the statement is relied on.')
  }

  if (movedAfter && recordedBalance != null) {
    notes.push(
      'The account has moved since this period ended, so the closing balance above is the balance '
      + 'on the last day of the period, not today.')
  }

  return {
    accountName,
    periodStart: period.start,
    periodEnd: period.end,
    periodLabel: label,
    opening, moneyIn, moneyOut, closing,
    recordedBalance: comparable ? recordedBalance : null,
    difference,
    collectionsIn, payoutsOut, otherIn, otherOut,
    lines,
    groups: groupBlocks,
    notes,
  }
}

/* ── Small helpers, exported so the view and the tests agree ──────────────── */

export function nameOf(
  names: Record<string, { name: string; code: string | null }>,
  id: string,
): string {
  const m = names[id]
  if (!m) return 'Unknown member'
  return m.code ? `${m.name} (${m.code})` : m.name
}

export function money(n: number): string {
  return '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN')
}

export function signed(n: number): string {
  if (n === 0) return '₹0'
  return (n < 0 ? '−' : '+') + money(n)
}

/** "August 2026" for a whole month, otherwise the two dates. */
export function periodLabelFor(start: string, end: string): string {
  const [ys, ms, ds] = start.split('-').map(Number)
  const [ye, me, de] = end.split('-').map(Number)
  if (ys === ye && ms === me && ds === 1 && de === lastDayOfMonth(ye, me)) {
    return `${MONTHS[ms - 1]} ${ys}`
  }
  return `${dmy(start)} to ${dmy(end)}`
}

export function dmy(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]?.slice(0, 3) ?? '?'} ${y}`
}

/** The arithmetic the statement claims, restated so a test can assert it. */
export function balanceChecks(s: ChitStatement): { label: string; ok: boolean }[] {
  return [
    {
      label: 'opening + in − out = closing',
      ok: round2(s.opening + s.moneyIn - s.moneyOut) === s.closing,
    },
    {
      label: 'money in = collections + other in',
      ok: round2(s.collectionsIn + s.otherIn) === s.moneyIn,
    },
    {
      label: 'money out = payouts + other out',
      ok: round2(s.payoutsOut + s.otherOut) === s.moneyOut,
    },
  ]
}
