// The four approved templates behind the six messages.
//
// SIX STEPS, FOUR TEMPLATES. The three payment reminders differ only in when
// they go out, not in what they say, so they share one template. Meta approves
// templates, not schedules — four submissions instead of six, and one place to
// fix the wording.
//
// ── WHY THE WORDING MATTERS MORE THAN THE SCHEDULE ──────────────────────────
//
// Meta assigns the CATEGORY, not us. A message that reads like an
// announcement — "attend the auction without fail", payment instructions, a
// wall of emoji — comes back classified as marketing, which costs about 7.5×
// more per message and brings opt-in and frequency rules with it. A message
// addressed to one member about their own month, their own amount and their
// own due date reads as utility, which is what these are.
//
// So each template addresses the member by name and states their figures. The
// variables here are the contract: submit the template to Meta with exactly
// these placeholders in this order, or the send fails at Meta with a variable
// count mismatch.
//
// A variable may not be empty and may not contain a line break — Meta rejects
// both — so every builder here falls back to a dash rather than an empty
// string, and nothing multi-line is ever passed.
//
// Pure. No React, no database, no network.

import type { StepKind } from './reminderSchedule'

export interface TemplateSpec {
  /** The name as submitted to Meta. */
  name: string
  /** Its approved language. */
  language: string
  /** What each {{n}} means, in order — for the submission and for the UI. */
  variables: readonly string[]
}

export const TEMPLATES: Record<StepKind, TemplateSpec> = {
  notice: {
    name: 'chit_auction_notice',
    language: 'en',
    variables: ['member name', 'month', 'chit value', 'monthly subscription', 'auction date', 'auction time'],
  },
  dues: {
    name: 'chit_dues',
    language: 'en',
    variables: ['member name', 'month', 'amount due', 'due date'],
  },
  winner: {
    name: 'chit_winner',
    language: 'en',
    variables: ['member name', 'month', 'bid amount', 'amount payable to you', 'auction date'],
  },
  reminder: {
    name: 'chit_payment_due',
    language: 'en',
    variables: ['member name', 'month', 'amount outstanding', 'due date'],
  },
}

/**
 * The overdue version of the reminder.
 *
 * One template cannot say both 'due on 5 December' and 'overdue by 12 days':
 * the wording is fixed at approval and only the variables change. So the
 * reminder is two templates, and which one is used is decided by the date.
 */
export const OVERDUE_TEMPLATE: TemplateSpec = {
  name: 'chit_payment_overdue',
  language: 'en',
  variables: ['member name', 'month', 'amount outstanding', 'days overdue'],
}

/** How many days past the due date, or 0 when it has not passed. */
export function daysOverdue(dueDate: string | undefined, today: string): number {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0
  const a = Date.parse(`${dueDate}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.round((b - a) / 86400000)
}

/**
 * Which template a step actually uses.
 *
 * Only the reminder has a choice to make: past the due date it becomes the
 * overdue one, which counts the days instead of naming a date.
 */
export function templateFor(kind: StepKind, f: Facts, today: string): TemplateSpec {
  if (kind === 'reminder' && daysOverdue(f.dueDate, today) > 0) return OVERDUE_TEMPLATE
  return TEMPLATES[kind]
}

/** Rupees as they read in a sentence: 5,000 — no symbol, templates carry it. */
export function money(n: number): string {
  const v = Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0
  return v.toLocaleString('en-IN')
}

/**
 * Anything going into a variable, made safe for Meta.
 *
 * Empty becomes a dash because Meta rejects a blank variable outright, and a
 * rejected send is worse than a dash. Line breaks and tabs are flattened for
 * the same reason.
 */
export function safeVar(v: string | number | null | undefined): string {
  const s = String(v ?? '').replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return s === '' ? '-' : s.slice(0, 1024)
}

export interface Facts {
  memberName: string
  /** 'November 2026' or '7th month' — whatever the group calls it. */
  month: string
  chitValue?: number
  installment?: number
  auctionDate?: string
  auctionTime?: string | null
  /** What this member owes this month, after their dividend. */
  amountDue?: number
  dueDate?: string
  /** The winner's figures. */
  bidAmount?: number
  netPayout?: number
  /** Today, so a reminder can count the days it is late. */
  today?: string
}

/**
 * The variables for one step, in the order the template declares them.
 *
 * Returns null for a step whose facts are missing — a winner message with no
 * payout figure is not worth sending as a dash.
 */
export function variablesFor(kind: StepKind, f: Facts): string[] | null {
  switch (kind) {
    case 'notice':
      if (!f.auctionDate) return null
      return [
        safeVar(f.memberName), safeVar(f.month), safeVar(money(f.chitValue ?? 0)),
        safeVar(money(f.installment ?? 0)), safeVar(f.auctionDate), safeVar(f.auctionTime ?? 'as announced'),
      ]
    case 'dues':
      if (f.amountDue == null || !f.dueDate) return null
      return [safeVar(f.memberName), safeVar(f.month), safeVar(money(f.amountDue)), safeVar(f.dueDate)]
    case 'winner':
      if (f.netPayout == null) return null
      return [
        safeVar(f.memberName), safeVar(f.month), safeVar(money(f.bidAmount ?? 0)),
        safeVar(money(f.netPayout)), safeVar(f.auctionDate ?? '-'),
      ]
    case 'reminder':
      if (f.amountDue == null || !f.dueDate) return null
      return [safeVar(f.memberName), safeVar(f.month), safeVar(money(f.amountDue)), safeVar(f.dueDate)]
  }
}

/**
 * Variables for a step, choosing the overdue wording once the date has passed.
 *
 * The fourth variable changes meaning with the template: a due date before,
 * a number of days after. That is the whole reason there are two templates.
 */
export function variablesForToday(kind: StepKind, f: Facts, today: string): string[] | null {
  const overdue = kind === 'reminder' ? daysOverdue(f.dueDate, today) : 0
  if (overdue > 0) {
    if (f.amountDue == null) return null
    return [safeVar(f.memberName), safeVar(f.month), safeVar(money(f.amountDue)), safeVar(String(overdue))]
  }
  return variablesFor(kind, f)
}

/**
 * The same facts as plain text, for the click-to-chat link.
 *
 * Not a copy of the template's wording — the template is Meta's, approved and
 * fixed. This is what a person reads when the message is sent by hand, and it
 * may be as long and as formatted as it likes.
 */
export function linkText(kind: StepKind, f: Facts): string {
  const name = f.memberName.trim().split(/\s+/)[0] || 'there'
  switch (kind) {
    case 'notice':
      return `Hi ${name}, the ${f.month} chit auction is on ${f.auctionDate}${f.auctionTime ? ` at ${f.auctionTime}` : ''}. Monthly subscription ₹${money(f.installment ?? 0)}. Please join us.`
    case 'dues':
      return `Hi ${name}, your ${f.month} subscription after this month's dividend is ₹${money(f.amountDue ?? 0)}, due on ${f.dueDate}. Thank you.`
    case 'winner':
      return `Hi ${name}, congratulations — you have taken the ${f.month} chit. Bid ₹${money(f.bidAmount ?? 0)}, amount payable to you ₹${money(f.netPayout ?? 0)}. We will transfer it to your registered account.`
    case 'reminder': {
      const late = daysOverdue(f.dueDate, f.today ?? '')
      return late > 0
        ? `Hi ${name}, ₹${money(f.amountDue ?? 0)} for ${f.month} is now overdue by ${late} day${late === 1 ? '' : 's'}. Please arrange payment. Ignore this if you have just paid.`
        : `Hi ${name}, a gentle reminder that ₹${money(f.amountDue ?? 0)} for ${f.month} is still outstanding (due ${f.dueDate}). Please ignore this if you have just paid.`
    }
  }
}

/** What to tell Meta when submitting. Shown in the app so it can be copied. */
export function submissionGuide(kind: StepKind): string {
  const t = TEMPLATES[kind]
  return `${t.name} (${t.language}) — ${t.variables.map((v, i) => `{{${i + 1}}} ${v}`).join(', ')}`
}

/**
 * The wording each template starts with, ready to submit.
 *
 * Written to read as UTILITY: addressed to one member, about their own month,
 * their own amount, their own date. No "attend without fail", no payment
 * instructions, no rows of emoji — those read as marketing to Meta's
 * classifier, and marketing costs roughly 7.5x utility.
 *
 * None of them starts or ends with a variable, because Meta rejects that.
 */
export const DEFAULT_DRAFTS: Record<string, {
  label: string
  name: string
  language: string
  category: 'UTILITY'
  body: string
  footer?: string
  variables: { label: string; sample: string }[]
}> = {
  notice: {
    label: 'Auction notice',
    name: 'chit_auction_notice',
    language: 'en',
    category: 'UTILITY',
    body: 'Hello {{1}}, the {{2}} auction for your Rs {{3}} chit is coming up. Your monthly subscription is Rs {{4}}. The auction is on {{5}} at {{6}}, and you are welcome to join.',
    variables: [
      { label: 'member name', sample: 'Ravi' },
      { label: 'month', sample: 'November 2026' },
      { label: 'chit value', sample: '5,00,000' },
      { label: 'monthly subscription', sample: '25,000' },
      { label: 'auction date', sample: '5 November' },
      { label: 'auction time', sample: '6:30 PM' },
    ],
  },
  dues: {
    label: 'Due amount after the auction',
    name: 'chit_dues',
    language: 'en',
    category: 'UTILITY',
    body: 'Hello {{1}}, after this month\u2019s dividend your subscription for {{2}} is Rs {{3}}, payable by {{4}}. Thank you.',
    variables: [
      { label: 'member name', sample: 'Ravi' },
      { label: 'month', sample: 'November 2026' },
      { label: 'amount due', sample: '23,750' },
      { label: 'due date', sample: '5 December' },
    ],
  },
  winner: {
    label: 'Winning particulars (winner only)',
    name: 'chit_winner',
    language: 'en',
    category: 'UTILITY',
    body: 'Hello {{1}}, you have taken the {{2}} chit. Your bid was Rs {{3}} and the amount payable to you is Rs {{4}}, as settled on {{5}}. It will be transferred to your registered account.',
    variables: [
      { label: 'member name', sample: 'Ravi' },
      { label: 'month', sample: 'November 2026' },
      { label: 'bid amount', sample: '60,000' },
      { label: 'amount payable to you', sample: '4,25,000' },
      { label: 'auction date', sample: '5 November' },
    ],
  },
  reminder: {
    label: 'Payment reminder (before the due date)',
    name: 'chit_payment_due',
    language: 'en',
    category: 'UTILITY',
    body: 'Hello {{1}}, your chit subscription for {{2}} of Rs {{3}} is due on {{4}}. Please ignore this message if you have already paid.',
    variables: [
      { label: 'member name', sample: 'Ravi' },
      { label: 'month', sample: 'November 2026' },
      { label: 'amount outstanding', sample: '23,750' },
      { label: 'due date', sample: '5 December' },
    ],
  },
  reminder_overdue: {
    label: 'Payment reminder (overdue)',
    name: 'chit_payment_overdue',
    language: 'en',
    category: 'UTILITY',
    body: 'Hello {{1}}, your chit subscription for {{2}} of Rs {{3}} is now overdue by {{4}} days. Please arrange payment, and ignore this message if you have already paid.',
    variables: [
      { label: 'member name', sample: 'Ravi' },
      { label: 'month', sample: 'November 2026' },
      { label: 'amount outstanding', sample: '23,750' },
      { label: 'days overdue', sample: '12' },
    ],
  },
}
