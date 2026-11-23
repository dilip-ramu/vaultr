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
    name: 'chit_payment_reminder',
    language: 'en',
    variables: ['member name', 'month', 'amount outstanding', 'due date'],
  },
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
    case 'reminder':
      return `Hi ${name}, a gentle reminder that ₹${money(f.amountDue ?? 0)} for ${f.month} is still outstanding (due ${f.dueDate}). Please ignore this if you have just paid.`
  }
}

/** What to tell Meta when submitting. Shown in the app so it can be copied. */
export function submissionGuide(kind: StepKind): string {
  const t = TEMPLATES[kind]
  return `${t.name} (${t.language}) — ${t.variables.map((v, i) => `{{${i + 1}}} ${v}`).join(', ')}`
}
