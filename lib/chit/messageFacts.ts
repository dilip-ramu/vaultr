// The figures behind one message to one member.
//
// WHY THIS IS ITS OWN FILE
//
// Two things send chit messages: the daily run, and the 'send this to everyone
// now' button. Both have to produce the same figures from the same rows, and
// when this lived inside the daily run the button would have been a copy of it
// — which is how two screens start disagreeing about what a member owes.
//
// Pure. Rows in, facts out. No database, no network, no clock: today is passed
// in, because the day a chit lives in is a day in Tiruppur, not in UTC.

import { dueDateFor } from './reminderSchedule'
import { monthlyInstallment, numberOfMonths, monthlyCommission, bidCeiling } from './auction'
import { scheduledAuctionDate } from './messages'
import { BID_STEP } from './bidding'
import type { Facts } from './messageFields'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** 'November 2026' from an ISO date, for the month a message is about. */
export function monthLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ''))
  if (!m) return String(iso ?? '')
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/**
 * One month on from a date, landing on the group's auction day.
 *
 * The LAST fallback for 'when is the next auction'. A row in the table beats
 * it, and the calendar worked out from the chit's start date beats it — but
 * both can be missing, and a notice should not go unsent because next month's
 * auction has not been entered yet. There is always a month after this one.
 *
 * The day is clamped to the month's length, so a chit auctioned on the 31st
 * falls on the 28th in February rather than slipping into March.
 */
export function oneMonthOn(iso: string, auctionDay?: number | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])            // 1-based
  const wanted = Math.round(Number(auctionDay ?? 0)) || Number(m[3])

  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const daysInMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
  const day = Math.min(Math.max(1, wanted), daysInMonth)

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The name on the first entry of a nominee or guarantor list, if there is one. */
export function firstName(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const name = String((v[0] as { name?: unknown })?.name ?? '').trim()
  return name === '' ? null : name
}

export interface GroupRow {
  name?: string | null
  chit_value?: number | string | null
  members?: number | string | null
  commission_pct?: number | string | null
  bid_ceiling_pct?: number | string | null
  commission_model?: string | null
  auction_day?: number | string | null
  auction_time?: string | null
  start_date?: string | null
}

export interface AuctionRow {
  month_number?: number | string | null
  auction_date?: string | null
  winner_member_id?: string | null
  bid_amount?: number | string | null
  commission?: number | string | null
  net_payout?: number | string | null
  dividend_per_member?: number | string | null
}

export interface MemberRow {
  id?: string | null
  name?: string | null
  phone?: string | null
  member_code?: string | null
  address?: string | null
  aadhaar?: string | null
  pan?: string | null
  nominees?: unknown
  guarantors?: unknown
  bank_name?: string | null
  bank_account_name?: string | null
  bank_account_number?: string | null
  bank_branch?: string | null
  bank_ifsc?: string | null
}

export interface WindowRow {
  ceiling_amount?: number | string | null
  min_increment?: number | string | null
}

export interface DuesInput {
  /** What one member pays in each month. */
  installment: number
  /** Every month already run, with the dividend that month carried. */
  auctions: readonly { month_number?: number | string | null; dividend_per_member?: number | string | null }[]
  /** The months this member has paid for. */
  paidMonths: readonly number[]
  /** Count up to and including this month. */
  uptoMonth: number
}

/**
 * Everything a member still owes across the months run so far.
 *
 * Not this month's subscription — every month that has been auctioned, less
 * that month's dividend, that they have not paid for. This is the figure the
 * app's own winner message calls the pending amount, and it is what gets
 * deducted from a payout.
 */
export function pendingDues(i: DuesInput): number {
  const paid = new Set(i.paidMonths.map(m => Math.round(Number(m))))
  let total = 0
  for (const a of i.auctions) {
    const month = Math.round(num(a.month_number))
    if (month < 1 || month > Math.round(num(i.uptoMonth))) continue
    if (paid.has(month)) continue
    total += Math.max(0, num(i.installment) - num(a.dividend_per_member))
  }
  return Math.round(total * 100) / 100
}

export interface FactsInput {
  group: GroupRow
  /** The month being messaged about. Null before the first auction. */
  auction?: AuctionRow | null
  /** Who is receiving it. */
  member: MemberRow
  /** Their seat in this group, if the seats are numbered. */
  slotNumber?: number | null
  /** Their permanent passbook link, when the message asks for one. */
  portalLink?: string | null
  /** The winner's row, for a message that names them. */
  winner?: MemberRow | null
  /** The bidding window, for the rules as they were frozen when it opened. */
  window?: WindowRow | null
  nextAuctionDate?: string | null
  /** Days after the auction the subscription is owed. */
  duesDueDays?: number | null
  /** Every month already run, for working out what is still owed. */
  allAuctions?: readonly { month_number?: number | string | null; dividend_per_member?: number | string | null }[]
  /** The months this member has paid for. */
  paidMonths?: readonly number[]
  today: string
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const maybe = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * Everything a message could want to say about this member, this month.
 *
 * A fact that is not known is left null rather than zeroed. The message then
 * either does not use it, or is not sent — see renderFields.
 */
export function factsFor(i: FactsInput): Facts {
  const g = i.group
  const a = i.auction ?? null

  const terms = {
    chitValue: num(g.chit_value),
    members: Math.round(num(g.members)),
    commissionPct: num(g.commission_pct),
    bidCeilingPct: num(g.bid_ceiling_pct),
    model: (String(g.commission_model ?? 'MONTHLY') as 'MONTHLY' | 'UPFRONT'),
  }

  const installment = monthlyInstallment(terms)
  const totalMonths = numberOfMonths(terms)
  const auctionDay = maybe(g.auction_day)
  const startDate = g.start_date ?? null
  const auctionDate = a?.auction_date ? String(a.auction_date).slice(0, 10) : null

  const dividend = a ? num(a.dividend_per_member) : null

  // What this member still owes in all, and so what actually reaches them if
  // they win. Only known when the months and their payments were passed in.
  const owing = i.allAuctions
    ? pendingDues({
        installment,
        auctions: i.allAuctions,
        paidMonths: i.paidMonths ?? [],
        uptoMonth: Math.round(num(a?.month_number)),
      })
    : null
  // What this member actually owes: their subscription less their dividend.
  const amountDue = a
    ? Math.max(0, Math.round((installment - num(a.dividend_per_member)) * 100) / 100)
    : null

  return {
    memberName: String(i.member.name ?? ''),
    memberCode: i.member.member_code ?? null,
    slotNumber: i.slotNumber ?? null,
    memberPhone: i.member.phone ?? null,
    memberAddress: i.member.address ?? null,
    aadhaar: i.member.aadhaar ?? null,
    pan: i.member.pan ?? null,
    nomineeName: firstName(i.member.nominees),
    guarantorName: firstName(i.member.guarantors),
    portalLink: i.portalLink ?? null,

    bankName: i.member.bank_name ?? null,
    bankAccountName: i.member.bank_account_name ?? null,
    bankBranch: i.member.bank_branch ?? null,
    bankIfsc: i.member.bank_ifsc ?? null,
    accountNumber: i.member.bank_account_number ?? null,

    groupName: String(g.name ?? ''),
    month: auctionDate ? monthLabel(auctionDate) : monthLabel(i.today),
    monthNumber: a ? maybe(a.month_number) : null,
    membersCount: terms.members || null,
    totalMonths: totalMonths || null,
    startDate,
    endDate: startDate ? scheduledAuctionDate(startDate, auctionDay, totalMonths) : null,
    auctionDay,

    chitValue: terms.chitValue,
    installment,
    commissionPct: maybe(g.commission_pct),
    commissionAmount: monthlyCommission(terms),
    // What was frozen when bidding opened, if it ever was; otherwise the rules
    // as they stand today.
    minBid: i.window ? num(i.window.min_increment) || BID_STEP : BID_STEP,
    maxDiscount: i.window ? num(i.window.ceiling_amount) || bidCeiling(terms) : bidCeiling(terms),
    maxDiscountPct: maybe(g.bid_ceiling_pct),

    auctionDate,
    auctionTime: g.auction_time ?? null,
    nextAuctionDate: i.nextAuctionDate ?? null,
    // The month the NEXT auction falls in, for a notice about it. Worked out
    // from its date rather than by adding one to this month, so a skipped or
    // rescheduled month says the truth.
    nextMonth: i.nextAuctionDate ? monthLabel(String(i.nextAuctionDate)) : null,
    nextMonthNumber: a && maybe(a.month_number) != null
      ? Math.round(num(a.month_number)) + 1
      : null,
    winnerName: i.winner?.name ?? null,
    winnerCode: i.winner?.member_code ?? null,

    amountDue,
    dividend,
    dueDate: auctionDate ? dueDateFor(auctionDate, i.nextAuctionDate ?? null, i.duesDueDays ?? null) : null,
    bidAmount: a ? num(a.bid_amount) : null,
    // The part of the discount that reaches members, after the foreman's cut.
    discountShared: a
      ? Math.max(0, Math.round((num(a.bid_amount) - num(a.commission)) * 100) / 100)
      : null,
    netPayout: a ? num(a.net_payout) : null,
    pendingDues: owing,
    payoutAfterDues: a && owing != null
      ? Math.max(0, Math.round((num(a.net_payout) - owing) * 100) / 100)
      : null,
    today: i.today,
  }
}

/**
 * Whether the auction has actually been held and recorded.
 *
 * A row exists as soon as the auction is entered, so what is being asked is
 * whether it carries a result: somebody won, or a discount was recorded. An
 * upfront first month has neither, and nothing about a winner should be sent
 * for it.
 */
export function auctionSettled(a?: AuctionRow | null): boolean {
  if (!a) return false
  return Boolean(a.winner_member_id) || num(a.bid_amount) > 0
}
