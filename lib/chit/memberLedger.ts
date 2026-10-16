// What one member actually owes, month by month, across every chit they are in.
//
// THE MODEL THIS REPLACES
//
// Dues used to be a yes/no question per slot: "has this member paid month 4?"
// A row existed, or it did not. Fine while everybody pays the exact figure on
// the day, and wrong the moment anybody does not — someone handing over
// ₹20,000 against an ₹18,600 due was marked paid and the extra ₹1,400 sat in
// the bank with nothing pointing at it. Someone paying ₹10,000 could not be
// recorded at all without claiming they had paid in full.
//
// So the question changes. Not "paid or not", but "paid how much against owed
// how much". Everything below follows from comparing two running totals:
//
//   after any month, a member is ahead or behind by
//   (everything paid so far) − (everything that has fallen due so far)
//
// Ahead is credit. Behind is arrears. Neither is a stored figure, which
// matters: a credit kept as its own number is a thing that can drift from the
// payments it came from, and then nobody knows which to believe.
//
// CREDIT BELONGS TO THE MEMBER, NOT TO THE GROUP
//
// One person can be in several chits. If they overpay in one, the extra is
// theirs, and it should be usable against whichever chit suits — once, and not
// automatically against whichever happens to be listed first.
//
// So credit never moves on its own. The owner applies it, and the application
// is recorded: ₹1,400 of this member's credit, out of group A, into group B
// month 5. The group it left shows it gone; the group it arrived in counts it
// as money received. Because the move is one row, it cannot be spent twice.
//
// ONLY MONTHS WHOSE AUCTION HAS RUN COUNT AS DUE. A month that has not been
// auctioned owes nothing — the dividend that sets the figure does not exist
// yet, and counting it would invent a debt.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** A month that has been auctioned, and what one member owes for it. */
export interface DueMonth {
  month: number
  /** Installment less that month's dividend. */
  due: number
}

/** A payment, tagged to the month it was collected against. */
export interface PaidRow {
  month: number
  amount: number
}

/** Credit moved into this group from the member's credit elsewhere. */
export interface CreditIn {
  month: number
  amount: number
}

export type MonthStatus = 'paid' | 'part' | 'unpaid' | 'covered'

export interface LedgerMonth {
  month: number
  /** The headline figure for the month, before anything carried in. */
  due: number
  /** Credit carried in from earlier months of THIS group. */
  broughtForward: number
  /** Credit moved in from another group and applied to this month. */
  creditApplied: number
  /** What this member is actually asked for. */
  payable: number
  /** Money recorded against this month in this group. */
  paid: number
  /** Still owed once everything up to here is counted. */
  outstanding: number
  status: MonthStatus
  /** Credit left over after this month. */
  carriedForward: number
}

export interface MemberLedger {
  owedToDate: number
  /** Collections, plus credit applied in, less credit moved out. */
  paidToDate: number
  /** paid − owed. Positive is paid in advance, negative is still owing. */
  balance: number
  /** Paid in advance, as a positive number. What can be moved elsewhere. */
  credit: number
  /** Still owing, as a positive number. */
  arrears: number
  months: LedgerMonth[]
}

export interface LedgerExtras {
  /** Credit brought in from the member's other chits, by month applied. */
  creditIn?: CreditIn[]
  /** Credit taken out of this group and used in another. */
  creditOut?: number
}

/**
 * One member's position in ONE group.
 *
 * `dues` are the months whose auction has run; `payments` may arrive in any
 * order and may hold several rows for one month, because a member can pay
 * twice.
 */
export function memberLedger(
  dues: DueMonth[],
  payments: PaidRow[],
  extras: LedgerExtras = {},
): MemberLedger {
  const paidByMonth = sumByMonth(payments)
  const creditByMonth = sumByMonth(extras.creditIn ?? [])

  const ordered = dues.slice().sort((a, b) => a.month - b.month)

  const months: LedgerMonth[] = []
  let cumDue = 0
  // Credit that has LEFT this chit is taken off before the months are walked,
  // not after. Taking it off at the end leaves every month in between still
  // showing the reduced figure, so a member whose credit was moved to another
  // chit would appear to get the discount in both. It is money that is gone;
  // it has to be gone from the first month onwards.
  let cumPaid = -Math.max(0, round2(num(extras.creditOut)))

  for (const d of ordered) {
    const month = num(d.month)
    const due = Math.max(0, round2(num(d.due)))
    const paid = round2(paidByMonth.get(month) ?? 0)
    const creditApplied = round2(creditByMonth.get(month) ?? 0)

    // Where they stood before this month. Positive means they were ahead.
    const broughtForward = Math.max(0, round2(cumPaid - cumDue))

    cumDue = round2(cumDue + due)
    // Credit moved in is money as far as this group is concerned — it was
    // handed over, just against a different chit.
    cumPaid = round2(cumPaid + paid + creditApplied)

    const after = round2(cumPaid - cumDue)

    months.push({
      month,
      due,
      broughtForward,
      creditApplied,
      payable: Math.max(0, round2(due - broughtForward - creditApplied)),
      paid,
      outstanding: Math.max(0, round2(-after)),
      carriedForward: Math.max(0, after),
      status: monthStatus(due, paid, creditApplied, broughtForward, Math.max(0, round2(-after))),
    })
  }

  // Money tagged to months that have not been auctioned yet is still money
  // this member handed over. Ignoring it would show somebody who paid ahead as
  // owing.
  for (const [month, amount] of paidByMonth) {
    if (!ordered.some(d => d.month === month)) cumPaid = round2(cumPaid + amount)
  }
  for (const [month, amount] of creditByMonth) {
    if (!ordered.some(d => d.month === month)) cumPaid = round2(cumPaid + amount)
  }

  const balance = round2(cumPaid - cumDue)
  return {
    owedToDate: cumDue,
    paidToDate: cumPaid,
    balance,
    credit: Math.max(0, balance),
    arrears: Math.max(0, round2(-balance)),
    months,
  }
}

function sumByMonth(rows: { month: number; amount: number }[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of rows) {
    const m = num(r.month)
    out.set(m, round2((out.get(m) ?? 0) + num(r.amount)))
  }
  return out
}

function monthStatus(
  due: number, paid: number, creditApplied: number,
  broughtForward: number, outstanding: number,
): MonthStatus {
  // Nothing was handed over, and nothing needed to be, because earlier money
  // already covered it. Worth its own word: "paid" would be a lie and "unpaid"
  // would send somebody out to collect it.
  if (paid === 0 && creditApplied === 0 && broughtForward >= due && due > 0) return 'covered'
  if (outstanding === 0) return 'paid'
  if (paid > 0 || creditApplied > 0 || broughtForward > 0) return 'part'
  return 'unpaid'
}

/**
 * What to ask this member for, for one month.
 *
 * This is the number that goes on a collection screen, and it is the whole
 * point of the exercise: a member who overpaid last month is asked for less
 * this month, and only that member.
 */
export function payable(ledger: MemberLedger, month: number): number {
  const row = ledger.months.find(m => m.month === month)
  // A month whose auction has not run has no due of its own yet.
  return row ? row.payable : 0
}

/* ── The member's credit across every chit they are in ────────────────────── */

export interface GroupPosition {
  groupId: string
  groupName: string
  /** This member's balance in that group: positive is credit. */
  balance: number
}

export interface CreditPool {
  /** Total credit this member is holding, across all their chits. */
  available: number
  /** Total they are behind by, across all their chits. */
  owing: number
  /** Where the credit is sitting, so the owner can choose what to move. */
  from: { groupId: string; groupName: string; amount: number }[]
}

/**
 * What this member has spare, and which chit it is sitting in.
 *
 * Credits and arrears are NOT netted off against each other. Being ₹1,400
 * ahead in one chit and ₹18,600 behind in another is two facts, and showing
 * only the difference would hide both. The owner decides whether to move the
 * credit across; the app does not do it quietly.
 */
export function creditPool(positions: GroupPosition[]): CreditPool {
  const from = positions
    .filter(p => p.balance > 0)
    .map(p => ({ groupId: p.groupId, groupName: p.groupName, amount: round2(p.balance) }))
    .sort((a, b) => b.amount - a.amount)

  return {
    available: round2(from.reduce((t, f) => t + f.amount, 0)),
    owing: round2(positions.filter(p => p.balance < 0).reduce((t, p) => t - p.balance, 0)),
    from,
  }
}

/** Whether a proposed move of credit is allowed, and why not when it is not. */
export function checkCreditMove(
  pool: CreditPool,
  fromGroupId: string,
  toGroupId: string,
  amount: number,
): { ok: true } | { ok: false; reason: string } {
  const a = round2(num(amount))
  if (!(a > 0)) return { ok: false, reason: 'Enter an amount to move.' }
  if (fromGroupId === toGroupId) return { ok: false, reason: 'That is the same chit.' }

  const source = pool.from.find(f => f.groupId === fromGroupId)
  if (!source) return { ok: false, reason: 'That chit has no credit to move.' }
  if (a > source.amount) {
    return {
      ok: false,
      reason: `Only ${inr(source.amount)} is available in ${source.groupName}.`,
    }
  }
  return { ok: true }
}

/** One line for a screen: "₹1,400 in credit" / "₹18,600 owing" / "settled". */
export function balanceWords(ledger: { credit: number; arrears: number }): string {
  if (ledger.credit > 0) return `${inr(ledger.credit)} in credit`
  if (ledger.arrears > 0) return `${inr(ledger.arrears)} owing`
  return 'Settled'
}

function inr(v: number): string {
  return '₹' + Math.round(v).toLocaleString('en-IN')
}
