// A message you wrote, and how it becomes something Meta will accept.
//
// ── ONE LIBRARY, EVERY GROUP ───────────────────────────────────────────────
//
// These are not per group. A chit operator running four groups writes the
// auction notice once; editing it four times is how three of them end up
// saying something different. Each group's schedule then chooses WHICH of
// these messages goes out and WHEN — see reminderSchedule.ts.
//
// ── WRITE WITH NAMES, SUBMIT WITH NUMBERS ──────────────────────────────────
//
// You write:   Hello {{member_name}}, your subscription of Rs {{amount_due}} …
// Meta gets:   Hello {{1}}, your subscription of Rs {{2}} …
//
// The numbering happens here, in the order the names appear, at the moment of
// submission. That is the whole trick: Meta rejects templates whose numbers
// are out of order, skip a number, or do not match the examples supplied, and
// numbering last makes all three impossible. Move a sentence and the numbers
// follow it.
//
// ── AS MANY AS YOU LIKE ────────────────────────────────────────────────────
//
// Nothing here is limited to six messages or four templates. A template is a
// row with a name, an audience and some words; a group's schedule can point
// three different reminders at three different messages, or all three at one.
//
// Pure. No React, no database, no network.

import {
  field, fieldProblem, labelToField, renderFields, safeVar,
  type FieldId, type FieldSpec, type Facts,
} from './messageFields'
import type { Audience } from './reminderSchedule'
import {
  problems as specProblems, preview as specPreview,
  type TemplateDraft, type TemplateCategory, type TemplateStatus, type Problem,
} from '@/lib/whatsapp/templateSpec'

export interface MessageTemplate {
  /** The row's id. A template not yet saved has ''. */
  id: string
  /** What you call it: 'Auction notice', 'Second reminder'. */
  label: string
  /** What Meta knows it as: lowercase, digits, underscores. */
  name: string
  language: string
  category: TemplateCategory
  /** Who it is written for. Decides which details it may use. */
  audience: Audience
  /** The words, with {{field_name}} where a detail goes. */
  body: string
  /** One optional line underneath. No fields allowed in it — Meta's rule. */
  footer?: string | null
  status: TemplateStatus
  /** What Meta classified it as, which is not always what was asked for. */
  categoryAssigned?: string | null
  rejectedReason?: string | null
  /** When each edit was submitted, for Meta's 1-a-day and 10-a-month limits. */
  editTimes: string[]
  /** Kept but out of the way. Archived messages cannot be scheduled. */
  archived?: boolean
  /** Order in the list. */
  sortOrder?: number
}

/** A {{token}}: letters, digits, underscores or spaces between the braces. */
const TOKEN_RE = /\{\{([^{}]*)\}\}/g

/** 'Member Name' and 'member name' both mean member_name. */
export function normalizeToken(raw: string): string {
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_')
}

export interface Compiled {
  /** The body as Meta wants it: {{1}}, {{2}}… in order of appearance. */
  text: string
  /** The field behind each number, in the same order. */
  fields: FieldSpec[]
  /** Tokens that match no known detail, as written. */
  unknown: string[]
}

/**
 * Turn a body written with names into the numbered form Meta approves.
 *
 * The same field may appear twice; it simply gets two numbers and the same
 * value twice. Unknown tokens are left exactly as they were, so the editor can
 * point at them instead of silently dropping a sentence.
 */
export function compile(body: string): Compiled {
  const fields: FieldSpec[] = []
  const unknown: string[] = []
  const text = String(body ?? '').replace(TOKEN_RE, (whole, raw) => {
    const spec = field(normalizeToken(raw))
    if (!spec) { unknown.push(String(raw).trim()); return whole }
    fields.push(spec)
    return `{{${fields.length}}}`
  })
  return { text, fields, unknown }
}

/** The ids of the details a body uses, in order. */
export function fieldsUsed(body: string): FieldId[] {
  return compile(body).fields.map(f => f.id)
}

/** Insert a {{field}} at a cursor position in the body. */
export function insertToken(body: string, at: number, id: FieldId): string {
  const s = String(body ?? '')
  const pos = Math.max(0, Math.min(s.length, Math.round(at)))
  return `${s.slice(0, pos)}{{${id}}}${s.slice(pos)}`
}

/**
 * A body stored the old way — {{1}}, {{2}} with a separate list of labels —
 * read back into the named form.
 *
 * The first version of this screen stored numbers. Rather than leaving those
 * messages broken on screen, they are converted on the way in. A number with
 * no label behind it is left alone, so nothing is silently lost.
 */
export function fromNumbered(body: string, labels: readonly string[]): string {
  return String(body ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n) => {
    const spec = labelToField(String(labels[Number(n) - 1] ?? ''))
    return spec ? `{{${spec.id}}}` : whole
  })
}

/**
 * One stored row as the app holds it.
 *
 * Here rather than in the page so the screens, the daily run and the preview
 * all read a row the same way — including the conversion of a body stored the
 * old way, which would otherwise only happen on whichever screen remembered.
 */
export function fromRow(r: Record<string, unknown>): MessageTemplate {
  const labels = Array.isArray(r.variables)
    ? (r.variables as { label?: string }[]).map(v => String(v?.label ?? ''))
    : []
  const name = String(r.template_name ?? r.kind ?? 'chit_message')
  return {
    id: String(r.id ?? ''),
    label: String(r.label ?? '').trim() || name,
    name,
    language: String(r.language ?? 'en'),
    category: (String(r.category_requested ?? 'UTILITY') as TemplateCategory),
    audience: (String(r.audience ?? 'all') as Audience),
    body: fromNumbered(String(r.body ?? ''), labels),
    footer: (r.footer as string | null) ?? null,
    status: (String(r.status ?? 'DRAFT') as TemplateStatus),
    categoryAssigned: (r.category_assigned as string | null) ?? null,
    rejectedReason: (r.rejected_reason as string | null) ?? null,
    editTimes: Array.isArray(r.edit_times) ? (r.edit_times as string[]) : [],
    archived: Boolean(r.archived),
    sortOrder: Number(r.sort_order) || 0,
  }
}

/** What goes to Meta: numbered wording, plus an example for each number. */
export function toDraft(t: MessageTemplate): TemplateDraft {
  const c = compile(t.body)
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    body: c.text,
    footer: t.footer ?? undefined,
    variables: c.fields.map(f => ({ label: f.label, sample: f.sample })),
  }
}

/** The message as a member will read it, with the example values filled in. */
export function previewOf(t: MessageTemplate): string {
  return specPreview(toDraft(t))
}

/**
 * Everything wrong with it, as a list.
 *
 * Meta's own rules come from templateSpec. What is added here is whether the
 * details used can honestly be filled in for the audience chosen — asking for
 * a bid amount in a message to all sixty members is not a Meta problem, it is
 * a message that will never send.
 */
export function templateProblems(t: MessageTemplate): Problem[] {
  const out: Problem[] = []
  if (!String(t.label ?? '').trim()) {
    out.push({ field: 'name', message: 'Give it a name you will recognise in the schedule.' })
  }

  const c = compile(t.body)
  for (const raw of c.unknown) {
    out.push({
      field: 'body',
      message: /^\d+$/.test(raw)
        ? `Write {{member_name}} rather than {{${raw}}} — the numbering is done for you.`
        : `There is no detail called "${raw}". Pick one from the list.`,
    })
  }
  for (const f of c.fields) {
    const p = fieldProblem(f.id, t.audience)
    if (p) out.push({ field: 'body', message: p })
  }
  // The footer is a fixed line at Meta, so a field in it would never be filled.
  if (t.footer && compile(t.footer).fields.length > 0) {
    out.push({ field: 'footer', message: 'A footer is the same for everybody, so it cannot carry a detail.' })
  }

  return [...out, ...specProblems(toDraft(t))]
}

export function canSubmit(t: MessageTemplate): boolean {
  return templateProblems(t).length === 0
}

/** The values for one member and month, or which details are not known. */
export function renderVariables(t: MessageTemplate, f: Facts): { values: string[]; missing: FieldId[] } {
  return renderFields(fieldsUsed(t.body), f)
}

/** 'chit_auction_notice' from 'Auction notice'. */
export function slugFromLabel(label: string, prefix = 'chit'): string {
  const base = safeVar(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const name = base ? `${prefix}_${base}` : prefix
  return name.slice(0, 60)
}

/** A name nothing else in the library is using. */
export function uniqueName(label: string, taken: readonly string[]): string {
  const base = slugFromLabel(label)
  if (!taken.includes(base)) return base
  for (let n = 2; n < 100; n++) {
    const tryName = `${base}_${n}`
    if (!taken.includes(tryName)) return tryName
  }
  return `${base}_${Date.now()}`
}

/** A new, empty message, ready to be written. */
export function blankTemplate(taken: readonly string[] = [], label = 'New message'): MessageTemplate {
  return {
    id: '',
    label,
    name: uniqueName(label, taken),
    language: 'en',
    category: 'UTILITY',
    audience: 'all',
    body: '',
    footer: null,
    status: 'DRAFT',
    categoryAssigned: null,
    rejectedReason: null,
    editTimes: [],
    archived: false,
    sortOrder: 0,
  }
}

/** A copy, under its own name, as a draft. A quick way to a variant. */
export function duplicateOf(t: MessageTemplate, taken: readonly string[]): MessageTemplate {
  const label = `${t.label} (copy)`
  return {
    ...t,
    id: '',
    label,
    name: uniqueName(label, taken),
    status: 'DRAFT',
    categoryAssigned: null,
    rejectedReason: null,
    editTimes: [],
    archived: false,
  }
}

/** The one a schedule step points at, if it is still usable. */
export function templateById(templates: readonly MessageTemplate[], id?: string | null): MessageTemplate | undefined {
  if (!id) return undefined
  return templates.find(t => t.id === id && !t.archived)
}

/**
 * Point the steps that have no message yet at a sensible one.
 *
 * The six steps the app ships with predate the library, so an existing
 * schedule names no message at all. Rather than show six empty pickers, each
 * step is matched to the message written for its job — by name first, because
 * the starter names say what they are for, then by audience.
 *
 * Only ever fills a blank. A choice already made is never overwritten.
 */
export function matchStepsToLibrary<T extends { kind: string; audience: Audience; templateId?: string | null }>(
  steps: readonly T[],
  templates: readonly MessageTemplate[],
): T[] {
  const live = templates.filter(t => !t.archived && t.id)
  const byName = (want: string) => live.find(t => t.name.includes(want))
  const byAudience = (a: Audience) => live.find(t => t.audience === a)

  return steps.map(s => {
    if (s.templateId) return s
    const guess =
      s.kind === 'notice' ? byName('notice')
      : s.kind === 'dues' ? byName('dues')
      : s.kind === 'winner' ? (byName('winner') ?? byAudience('winner'))
      : (byName('payment_due') ?? byAudience('unpaid'))
    return guess ? { ...s, templateId: guess.id } : s
  })
}

/**
 * Why a step cannot send, in words, before the day arrives.
 *
 * The screen shows this while the schedule is being set up, which is the only
 * time it is cheap to fix. 'days overdue' in a message that goes out before
 * anything is overdue is the mistake this exists for.
 */
export function stepWarning(
  step: { audience: Audience; templateId?: string | null; offsetDays: number; anchor: string },
  t?: MessageTemplate,
  duesDueDays?: number | null,
): string | null {
  if (!t) return 'Choose which message this step sends.'
  if (t.archived) return 'That message is archived. Choose another.'
  if (t.audience !== step.audience) {
    return `"${t.label}" is written for ${t.audience === 'winner' ? 'the winner' : t.audience === 'unpaid' ? 'members who owe' : 'everybody'}, which does not match this step.`
  }
  const used = fieldsUsed(t.body)
  if (used.includes('days_overdue')) {
    // Overdue means past the due date. On or before it, the count is zero and
    // the message would read 'overdue by 0 days', so it is not sent at all.
    const dueOffset = duesDueDays == null ? null : Number(duesDueDays)
    if (step.anchor === 'auction' && dueOffset != null && step.offsetDays <= dueOffset) {
      return `This goes out ${step.offsetDays} day${step.offsetDays === 1 ? '' : 's'} after the auction, but the subscription is only overdue after ${dueOffset} days — so nothing would be sent.`
    }
    if (dueOffset == null) {
      return 'This message counts the days overdue, so set when the subscription falls due.'
    }
  }
  return null
}

/**
 * The five messages the app starts with.
 *
 * Written to read as UTILITY to Meta's classifier: addressed to one member,
 * about their own month, their own amount, their own date. No 'attend without
 * fail', no payment instructions, no rows of emoji — those come back
 * classified as marketing, which costs roughly 7.5x more per message.
 *
 * They are a starting point, not a fixed set. Edit them, add to them, archive
 * the ones you do not use.
 */
export const STARTER_LIBRARY: readonly MessageTemplate[] = [
  {
    id: '', label: 'Auction notice', name: 'chit_auction_notice', language: 'en',
    category: 'UTILITY', audience: 'all',
    body: 'Hello {{member_name}}, the {{month}} auction for {{group_name}} is on {{auction_date}} at {{auction_time}}. Your monthly subscription is Rs {{installment}}. You are welcome to join us.',
    footer: null, status: 'DRAFT', editTimes: [], sortOrder: 1,
  },
  {
    id: '', label: 'Due amount after the auction', name: 'chit_dues', language: 'en',
    category: 'UTILITY', audience: 'all',
    body: 'Hello {{member_name}}, after this month’s dividend your subscription for {{month}} is Rs {{amount_due}}, payable by {{due_date}}. Thank you.',
    footer: null, status: 'DRAFT', editTimes: [], sortOrder: 2,
  },
  {
    id: '', label: 'Winning particulars', name: 'chit_winner', language: 'en',
    category: 'UTILITY', audience: 'winner',
    body: 'Hello {{member_name}}, you have taken the {{month}} chit. Your bid was Rs {{bid_amount}} and the amount payable to you is Rs {{net_payout}}. Please confirm your account with {{bank_name}} ending {{account_ending}} is still correct, and we will transfer it.',
    footer: null, status: 'DRAFT', editTimes: [], sortOrder: 3,
  },
  {
    id: '', label: 'Payment reminder', name: 'chit_payment_due', language: 'en',
    category: 'UTILITY', audience: 'unpaid',
    body: 'Hello {{member_name}}, your chit subscription for {{month}} of Rs {{amount_due}} is due on {{due_date}}. Please ignore this message if you have already paid.',
    footer: null, status: 'DRAFT', editTimes: [], sortOrder: 4,
  },
  {
    id: '', label: 'Payment reminder (overdue)', name: 'chit_payment_overdue', language: 'en',
    category: 'UTILITY', audience: 'unpaid',
    body: 'Hello {{member_name}}, your chit subscription for {{month}} of Rs {{amount_due}} is now overdue by {{days_overdue}} days. Please arrange payment, and ignore this message if you have already paid.',
    footer: null, status: 'DRAFT', editTimes: [], sortOrder: 5,
  },
]
