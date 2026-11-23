// The details a chit message can carry, and what each one is worth today.
//
// WHY A CATALOGUE AND NOT A FIXED LIST PER MESSAGE
//
// The six messages used to have their variables hard-coded: the notice always
// carried six figures in one order, the winner's message five in another. That
// works until you want to ask the winner to confirm their bank account, or put
// a new rule in the auction notice, and then it does not work at all.
//
// So a message no longer owns a list of variables. It is written as plain text
// with {{field}} tokens in it — {{member_name}}, {{amount_due}} — and this
// file is the only place that knows what a field means, what it is worth for a
// given member and month, and whether it can honestly be used at all.
//
// ── WHY NOT NUMBERS ────────────────────────────────────────────────────────
//
// Meta's own syntax is {{1}}, {{2}}, and it rejects a template whose numbers
// are out of order, repeated wrongly, or do not match the examples given. Half
// the rejections in lib/whatsapp/templateSpec.ts are about numbering. Writing
// with names and NUMBERING AT THE LAST MOMENT, in the order the tokens appear,
// makes every one of those mistakes impossible to make. See compile() in
// messageTemplates.ts.
//
// ── A FIELD CAN BE UNKNOWN ─────────────────────────────────────────────────
//
// 'days overdue' means nothing before the due date; a bid amount means nothing
// to a member who did not win. valueFor returns null rather than a zero or a
// dash, and the caller decides: the screen greys it out, the daily run records
// 'not enough information' instead of sending 'overdue by 0 days'.
//
// Pure. No React, no database, no clock of its own — today is passed in.

import type { Audience } from './reminderSchedule'

export type FieldId =
  | 'member_name' | 'member_code' | 'slot_number' | 'member_phone' | 'member_address'
  | 'aadhaar_ending' | 'pan_ending' | 'nominee_name' | 'guarantor_name'
  | 'bank_name' | 'bank_account_name' | 'bank_branch' | 'bank_ifsc' | 'account_ending'
  | 'group_name' | 'month' | 'month_number' | 'members_count'
  | 'total_months' | 'months_left' | 'start_date' | 'end_date' | 'auction_day'
  | 'chit_value' | 'installment'
  | 'commission_pct' | 'commission_amount'
  | 'min_bid' | 'max_discount' | 'max_discount_pct'
  | 'auction_date' | 'auction_time' | 'next_auction_date'
  | 'winner_name' | 'winner_code'
  | 'amount_due' | 'due_date' | 'dividend' | 'days_overdue'
  | 'bid_amount' | 'discount_shared' | 'net_payout'

export interface FieldSpec {
  id: FieldId
  /** What it is called on screen and in the submission to Meta. */
  label: string
  /** The example value Meta asks for. Free of # $ % and line breaks. */
  sample: string
  /** For grouping the picker. */
  group: 'member' | 'bank' | 'group' | 'terms' | 'auction' | 'money' | 'winner'
  /**
   * Some fields only exist for one audience. A bid amount is the winner's; a
   * day count is only honest in a message that goes to somebody who owes.
   */
  onlyFor?: Audience
  /** A plain sentence for the picker. */
  note?: string
}

export const FIELDS: readonly FieldSpec[] = [
  { id: 'member_name',   label: 'member name',    sample: 'Ravi',              group: 'member' },
  { id: 'member_code',   label: 'member number',  sample: 'M-014',             group: 'member',
    note: 'Their code in your register, if you have given them one.' },
  { id: 'slot_number',   label: 'their slot',     sample: '7',                 group: 'member',
    note: 'Their seat in this group, if you number the seats.' },
  { id: 'member_phone',  label: 'their phone number', sample: '98765 43210',   group: 'member',
    note: 'The number this message is going to \u2014 useful when asking them to confirm it is current.' },
  { id: 'member_address', label: 'their address', sample: '12 Kumaran Road, Tiruppur', group: 'member' },
  { id: 'aadhaar_ending', label: 'Aadhaar ending', sample: '4321',             group: 'member',
    note: 'The last four digits only. The full number never goes in a message.' },
  { id: 'pan_ending',    label: 'PAN ending',     sample: '234K',              group: 'member',
    note: 'The last four characters only.' },
  { id: 'nominee_name',  label: 'nominee name',   sample: 'Lakshmi',           group: 'member',
    note: 'The first nominee on their record.' },
  { id: 'guarantor_name', label: 'guarantor name', sample: 'Murugan',          group: 'member',
    note: 'The first guarantor on their record.' },
  { id: 'group_name',    label: 'chit name',      sample: 'Uma 5 Lakh A',      group: 'group' },
  { id: 'members_count', label: 'total members',  sample: '20',                group: 'group' },
  { id: 'chit_value',    label: 'chit value',     sample: '5,00,000',          group: 'group' },
  { id: 'total_months',  label: 'total months',   sample: '20',                group: 'group',
    note: 'How many monthly auctions the chit runs for.' },
  { id: 'months_left',   label: 'months left',    sample: '13',                group: 'group' },
  { id: 'start_date',    label: 'chit start date', sample: '5 April 2026',     group: 'group' },
  { id: 'end_date',      label: 'chit end date',  sample: '5 November 2027',   group: 'group',
    note: 'The month the last auction falls in.' },
  { id: 'auction_day',   label: 'auction day',    sample: '5th',               group: 'group',
    note: 'The day of the month, as in "the 5th of every month".' },
  { id: 'installment',   label: 'monthly subscription', sample: '25,000',      group: 'money' },
  { id: 'month',         label: 'month',          sample: 'November 2026',     group: 'group' },
  { id: 'commission_pct', label: 'commission percent', sample: '5',            group: 'terms',
    note: 'Just the number — write a % sign after it if you want one.' },
  { id: 'commission_amount', label: 'commission amount', sample: '25,000',     group: 'terms' },
  { id: 'min_bid',       label: 'minimum bid',    sample: '100',               group: 'terms',
    note: 'The smallest bid that will be accepted when bidding opens.' },
  { id: 'max_discount',  label: 'maximum discount', sample: '1,50,000',        group: 'terms',
    note: 'The most a bid may discount the pot. The auction is capped there.' },
  { id: 'max_discount_pct', label: 'maximum discount percent', sample: '30',   group: 'terms' },
  { id: 'month_number',  label: 'month number',   sample: '7',                 group: 'group',
    note: 'The 7th of 20 months.' },
  { id: 'auction_date',  label: 'auction date',   sample: '5 November 2026',   group: 'auction' },
  { id: 'auction_time',  label: 'auction time',   sample: '6:30 PM',           group: 'auction' },
  { id: 'next_auction_date', label: 'next auction date', sample: '5 December 2026', group: 'auction' },
  { id: 'winner_name',   label: 'who won',        sample: 'Ravi',              group: 'auction',
    note: 'The member who took the chit this month.' },
  { id: 'winner_code',   label: 'winner\u2019s number', sample: 'M-014',        group: 'auction',
    note: 'Their number in your register \u2014 not their phone number, which no message carries.' },
  { id: 'bid_amount',    label: 'winning bid',    sample: '60,000',            group: 'auction',
    note: 'The discount the chit was taken at \u2014 what the group screen calls the winning discount. The same figure for everybody, so any message may use it.' },
  { id: 'discount_shared', label: 'discount shared', sample: '35,000',          group: 'auction',
    note: 'The winning bid less the commission \u2014 the part divided among the members as dividend.' },
  { id: 'amount_due',    label: 'amount due',     sample: '23,750',            group: 'money',
    note: 'This month’s subscription after their dividend.' },
  { id: 'dividend',      label: 'dividend',       sample: '1,250',             group: 'money' },
  { id: 'due_date',      label: 'due date',       sample: '5 December 2026',   group: 'money' },
  { id: 'days_overdue',  label: 'days overdue',   sample: '12',                group: 'money', onlyFor: 'unpaid',
    note: 'Only in a message to members who still owe, and only after the due date.' },

  { id: 'net_payout',    label: 'amount payable to them', sample: '4,25,000',  group: 'winner', onlyFor: 'winner' },
  { id: 'bank_name',     label: 'their bank',     sample: 'HDFC Bank',         group: 'bank' },
  { id: 'bank_account_name', label: 'account name', sample: 'R Ravi',           group: 'bank',
    note: 'The name on the account, for them to confirm before you transfer.' },
  { id: 'bank_branch',   label: 'bank branch',    sample: 'Tiruppur Main',     group: 'bank' },
  { id: 'bank_ifsc',     label: 'IFSC code',      sample: 'HDFC0001234',       group: 'bank' },
  { id: 'account_ending', label: 'account ending', sample: '4321',             group: 'bank',
    note: 'The last four digits only. The full number never goes in a message \u2014 four digits are enough to confirm it is the right account.' },
]

export const GROUP_LABEL: Record<FieldSpec['group'], string> = {
  member: 'The member',
  bank: 'Their bank',
  group: 'The chit',
  terms: 'The rules',
  auction: 'The auction',
  money: 'Money and dates',
  winner: 'The winner only',
}

const BY_ID = new Map<string, FieldSpec>(FIELDS.map(f => [f.id, f]))

/** The field with this id, or undefined for a token nobody recognises. */
export function field(id: string): FieldSpec | undefined {
  return BY_ID.get(String(id).trim())
}

/** Rupees as they read in a sentence: 5,000 — no symbol, the wording carries it. */
export function money(n: number): string {
  const v = Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0
  return v.toLocaleString('en-IN')
}

/** '5th', '21st' — for 'the 5th of every month'. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = Math.abs(Math.round(n)) % 100
  return `${Math.round(n)}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/**
 * A percentage as a person writes it: 5, not 5.00, and 2.5 kept.
 *
 * Without the % sign, because the wording carries it — '{{commission_pct}}%'
 * reads correctly and 'a commission of {{commission_pct}} percent' also does.
 */
export function trimPct(n: number): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return String(Math.round(v * 100) / 100)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-11-05' becomes '5 November 2026'. Anything else is left alone. */
export function dateWords(iso: string | null | undefined): string | null {
  const s = String(iso ?? '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return s.trim() === '' ? null : s
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return s
  return `${Number(m[3])} ${month} ${m[1]}`
}

/**
 * Anything going into a variable, made safe for Meta.
 *
 * Line breaks and tabs are flattened because Meta rejects them outright. Empty
 * is NOT turned into a dash here: an empty value means the fact is unknown,
 * and the caller needs to see that rather than send a dash to a member.
 */
export function safeVar(v: string | number | null | undefined): string {
  return String(v ?? '').replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 1024)
}

/** How many days past the due date, or 0 when it has not passed. */
export function daysOverdue(dueDate: string | undefined | null, today: string): number {
  const d = String(dueDate ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0
  const a = Date.parse(`${d}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.round((b - a) / 86400000)
}

/** Everything a message might want to say, as far as it is known. */
export interface Facts {
  memberName?: string
  memberCode?: string | null
  /** Their seat in this group. */
  slotNumber?: number | null
  memberPhone?: string | null
  memberAddress?: string | null
  /** Whole numbers, never messaged whole — only the last few characters are. */
  aadhaar?: string | null
  pan?: string | null
  nomineeName?: string | null
  guarantorName?: string | null
  bankName?: string | null
  bankAccountName?: string | null
  bankBranch?: string | null
  bankIfsc?: string | null
  /** The last four digits. Never the whole number. */
  accountEnding?: string | null
  groupName?: string
  /** 'November 2026' — whatever the group calls this month. */
  month?: string
  monthNumber?: number | null
  membersCount?: number | null
  /** How many monthly auctions in all — not always the member count. */
  totalMonths?: number | null
  startDate?: string | null
  /** The month the last auction falls in. */
  endDate?: string | null
  /** The day of the month the auction is held, 1 to 31. */
  auctionDay?: number | null
  chitValue?: number | null
  installment?: number | null
  commissionPct?: number | null
  commissionAmount?: number | null
  /** The smallest bid that will be accepted when bidding opens. */
  minBid?: number | null
  /** The most a bid may discount the pot, in rupees and as a percent. */
  maxDiscount?: number | null
  maxDiscountPct?: number | null
  auctionDate?: string | null
  auctionTime?: string | null
  /** Who took the chit this month. Nobody, in an upfront month 1. */
  winnerName?: string | null
  /** The winner's number in the register. */
  winnerCode?: string | null
  nextAuctionDate?: string | null
  amountDue?: number | null
  dividend?: number | null
  dueDate?: string | null
  bidAmount?: number | null
  /** The winning bid less the commission — what is divided among members. */
  discountShared?: number | null
  netPayout?: number | null
  /** The day being planned for, so a reminder can count the days it is late. */
  today?: string
}

const has = (n: number | null | undefined) => n != null && Number.isFinite(Number(n))

/**
 * What a field is worth for these facts, or null when it is not known.
 *
 * Zero is a real value — a dividend of 0 in the first month is the truth — so
 * only a missing fact gives null, never a zero.
 */
export function valueFor(id: FieldId, f: Facts): string | null {
  const text = (v: string | null | undefined) => {
    const s = safeVar(v)
    return s === '' ? null : s
  }
  switch (id) {
    case 'member_name':   return text(f.memberName)
    case 'member_code':   return text(f.memberCode)
    case 'slot_number':   return has(f.slotNumber) ? String(Math.round(Number(f.slotNumber))) : null
    case 'member_phone':  return text(f.memberPhone)
    case 'member_address': return text(f.memberAddress)
    // Only the tail of an identity number is ever sent. A WhatsApp message is
    // forwarded, screenshotted and read over shoulders, and four characters
    // are enough for somebody to confirm it is the right record.
    case 'aadhaar_ending': {
      const digits = String(f.aadhaar ?? '').replace(/\D/g, '')
      return digits.length >= 4 ? digits.slice(-4) : null
    }
    case 'pan_ending': {
      const pan = String(f.pan ?? '').replace(/\s+/g, '').toUpperCase()
      return pan.length >= 4 ? pan.slice(-4) : null
    }
    case 'nominee_name':  return text(f.nomineeName)
    case 'guarantor_name': return text(f.guarantorName)
    case 'bank_name':     return text(f.bankName)
    case 'bank_account_name': return text(f.bankAccountName)
    case 'bank_branch':   return text(f.bankBranch)
    case 'bank_ifsc':     return text(f.bankIfsc)
    case 'account_ending': {
      const digits = String(f.accountEnding ?? '').replace(/\D/g, '')
      return digits.length >= 4 ? digits.slice(-4) : null
    }
    case 'group_name':    return text(f.groupName)
    case 'month':         return text(f.month)
    case 'month_number':  return has(f.monthNumber) ? String(Math.round(Number(f.monthNumber))) : null
    case 'members_count': return has(f.membersCount) ? String(Math.round(Number(f.membersCount))) : null
    case 'total_months':  return has(f.totalMonths) ? String(Math.round(Number(f.totalMonths))) : null
    case 'months_left': {
      if (!has(f.totalMonths) || !has(f.monthNumber)) return null
      const left = Math.round(Number(f.totalMonths)) - Math.round(Number(f.monthNumber))
      return left >= 0 ? String(left) : null
    }
    case 'start_date':    return dateWords(f.startDate)
    case 'end_date':      return dateWords(f.endDate)
    case 'auction_day':   return has(f.auctionDay) ? ordinal(Math.round(Number(f.auctionDay))) : null
    case 'commission_pct': return has(f.commissionPct) ? trimPct(Number(f.commissionPct)) : null
    case 'commission_amount': return has(f.commissionAmount) ? money(Number(f.commissionAmount)) : null
    case 'min_bid':       return has(f.minBid) ? money(Number(f.minBid)) : null
    case 'max_discount':  return has(f.maxDiscount) ? money(Number(f.maxDiscount)) : null
    case 'max_discount_pct': return has(f.maxDiscountPct) ? trimPct(Number(f.maxDiscountPct)) : null
    case 'chit_value':    return has(f.chitValue) ? money(Number(f.chitValue)) : null
    case 'installment':   return has(f.installment) ? money(Number(f.installment)) : null
    case 'auction_date':  return dateWords(f.auctionDate)
    case 'auction_time':  return text(f.auctionTime)
    case 'next_auction_date': return dateWords(f.nextAuctionDate)
    case 'winner_name':   return text(f.winnerName)
    case 'winner_code':   return text(f.winnerCode)
    case 'amount_due':    return has(f.amountDue) ? money(Number(f.amountDue)) : null
    case 'dividend':      return has(f.dividend) ? money(Number(f.dividend)) : null
    case 'due_date':      return dateWords(f.dueDate)
    case 'days_overdue': {
      const n = daysOverdue(f.dueDate, String(f.today ?? ''))
      // 'overdue by 0 days' is worse than not sending. Unknown, not zero.
      return n > 0 ? String(n) : null
    }
    case 'bid_amount':    return has(f.bidAmount) ? money(Number(f.bidAmount)) : null
    case 'discount_shared': return has(f.discountShared) ? money(Number(f.discountShared)) : null
    case 'net_payout':    return has(f.netPayout) ? money(Number(f.netPayout)) : null
  }
}

/**
 * The values for a list of fields, or which ones are not known.
 *
 * All-or-nothing on purpose: a message half filled in is not worth sending,
 * and Meta rejects an empty variable anyway.
 */
export function renderFields(ids: readonly FieldId[], f: Facts):
  { values: string[]; missing: FieldId[] } {
  const values: string[] = []
  const missing: FieldId[] = []
  for (const id of ids) {
    const v = valueFor(id, f)
    if (v === null) missing.push(id)
    else values.push(v)
  }
  return { values, missing }
}

/** 'bid amount, their bank' — for saying what is missing in a sentence. */
export function fieldWords(ids: readonly FieldId[]): string {
  const labels = ids.map(id => field(id)?.label ?? id)
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/** A field used where it cannot be honest, said plainly. Null when it is fine. */
export function fieldProblem(id: FieldId, audience: Audience): string | null {
  const spec = field(id)
  if (!spec) return `There is no detail called ${id}.`
  if (!spec.onlyFor || spec.onlyFor === audience) return null
  if (spec.onlyFor === 'winner') {
    return `"${spec.label}" only exists for the auction winner, and this message goes to ${audience === 'unpaid' ? 'everybody who owes' : 'everybody'}.`
  }
  return `"${spec.label}" only makes sense in a message to members who still owe.`
}

/**
 * The field behind a label, including the labels earlier versions used.
 *
 * The first templates were stored as {{1}}, {{2}} with a separate list of what
 * each number meant. Those words are how such a message is read back into the
 * named form — see fromNumbered() in messageTemplates.ts.
 */
const ALIASES: Record<string, FieldId> = {
  'bid amount': 'bid_amount',
  'discount': 'bid_amount',
  'discount amount': 'bid_amount',
  'winning discount': 'bid_amount',
  'winner': 'winner_name',
  'amount payable to you': 'net_payout',
  'amount payable': 'net_payout',
  'amount outstanding': 'amount_due',
  'outstanding': 'amount_due',
  'subscription': 'installment',
  'monthly installment': 'installment',
  'name': 'member_name',
  'chit name': 'group_name',
  'group name': 'group_name',
  'their bank': 'bank_name',
  'bank': 'bank_name',
  'ifsc': 'bank_ifsc',
  'account holder': 'bank_account_name',
  'account holder name': 'bank_account_name',
  'branch': 'bank_branch',
  'address': 'member_address',
  'phone': 'member_phone',
  'phone number': 'member_phone',
  'aadhaar': 'aadhaar_ending',
  'pan': 'pan_ending',
  'nominee': 'nominee_name',
  'guarantor': 'guarantor_name',
  'slot': 'slot_number',
  'account ending': 'account_ending',
}

export function labelToField(label: string): FieldSpec | undefined {
  const want = String(label ?? '').trim().toLowerCase()
  if (!want) return undefined
  const exact = FIELDS.find(f => f.label.toLowerCase() === want)
  if (exact) return exact
  const alias = ALIASES[want]
  return alias ? field(alias) : field(want.replace(/\s+/g, '_'))
}

/** The fields that can be used in a message for this audience. */
export function fieldsFor(audience: Audience): readonly FieldSpec[] {
  return FIELDS.filter(f => !f.onlyFor || f.onlyFor === audience)
}
