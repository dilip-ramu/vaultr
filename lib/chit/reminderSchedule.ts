// When each chit message goes out, and to whom.
//
// WHY THIS EXISTS
//
// Six messages hang off one event, the auction: the notice before it, the dues
// and the winner's particulars on the day, and three payment reminders after.
// Sending them by hand means remembering six dates per group per month and
// working out each time who has already paid — which is how a group of sixty
// gets chased in the wrong order, or not at all.
//
// ── TWO RULES THAT MATTER MORE THAN THE SCHEDULE ────────────────────────────
//
// A REMINDER GOES ONLY TO SOMEBODY WHO OWES. Chasing a member who paid on the
// first day, three times a month, is how a chit operator's number gets
// reported. On WhatsApp that costs delivery for every member, not just the one
// who complained.
//
// NOTHING IS SENT TWICE. Every send has a key of auction + member + step, and
// a key already in the log is skipped. A reminder run must be safe to repeat,
// because the one thing worse than forgetting to remind somebody is reminding
// them four times.
//
// A member can carry their own schedule, which REPLACES the group's rather
// than merging with it. Two schedules layered on each other cannot be reasoned
// about when a message goes out at the wrong hour, and somebody always has to.
//
// Pure. No React, no database, no clock of its own — today is passed in.

export type StepKind = 'notice' | 'dues' | 'winner' | 'reminder'
/**
 * Who a message is for.
 *
 * 'except_winner' exists because the winner gets their own message. Sending
 * them the dues announcement as well, on the same day, reads as not knowing
 * who won.
 */
export type Audience = 'all' | 'winner' | 'except_winner' | 'unpaid'
/**
 * What a step's date is counted from.
 *
 * 'settled' is the day the auction was RECORDED, not the day it was held. The
 * result messages hang off that: the dues and the winner's particulars cannot
 * be written before the figures are entered, and a chit auction is often
 * entered a day or two after it happens. Counting those from the auction date
 * would mean a message going out with no result in it, or — once the date had
 * passed — never going out at all.
 */
export type Anchor = 'auction' | 'next_auction' | 'settled'

export interface Step {
  /** Stable across edits: a send is logged against it and never repeated. */
  key: string
  kind: StepKind
  audience: Audience
  anchor: Anchor
  /** Negative is before the anchor, positive after, 0 on the day. */
  offsetDays: number
  enabled: boolean
  /**
   * Which message it sends, from the one library shared by every group. Empty
   * on the steps the app ships with: they are matched to the starter messages
   * the first time the schedule is saved.
   */
  templateId?: string | null
  /** Your own name for this step, when the message's name is not enough. */
  label?: string | null
}

/** His six, as the app ships them. */
export const DEFAULT_STEPS: readonly Step[] = [
  { key: 'notice',     kind: 'notice',   audience: 'all',    anchor: 'auction',      offsetDays: -3, enabled: true },
  // The result messages go out when the auction is recorded, not when it was
  // held — see the note on Anchor.
  { key: 'dues',       kind: 'dues',     audience: 'except_winner', anchor: 'settled', offsetDays: 0, enabled: true },
  { key: 'winner',     kind: 'winner',   audience: 'winner', anchor: 'settled',      offsetDays: 0,  enabled: true },
  { key: 'remind-1',   kind: 'reminder', audience: 'unpaid', anchor: 'auction',      offsetDays: 5,  enabled: true },
  { key: 'remind-2',   kind: 'reminder', audience: 'unpaid', anchor: 'auction',      offsetDays: 15, enabled: true },
  { key: 'remind-3',   kind: 'reminder', audience: 'unpaid', anchor: 'next_auction', offsetDays: -1, enabled: true },
]

export const STEP_LABEL: Record<StepKind, string> = {
  notice: 'Auction notice',
  dues: 'Due amount',
  winner: 'Winning particulars',
  reminder: 'Payment reminder',
}

/**
 * Ready-made schedules for a member who needs a different amount of pushing.
 * 'group' is not here: that is the absence of an override.
 */
export const PRESETS: Record<'gentle' | 'persistent', readonly Step[]> = {
  // Told what is happening and what is owed, then left alone.
  gentle: DEFAULT_STEPS.filter(s => s.kind !== 'reminder'),
  // Everything, plus a nudge the day after the auction and one a week later.
  persistent: [
    ...DEFAULT_STEPS,
    { key: 'remind-0', kind: 'reminder', audience: 'unpaid', anchor: 'auction', offsetDays: 1, enabled: true },
    { key: 'remind-4', kind: 'reminder', audience: 'unpaid', anchor: 'auction', offsetDays: 22, enabled: true },
  ],
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO date plus n days, worked out in UTC so no timezone can shift it. */
export function addDays(iso: string, n: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + n)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export interface Anchors {
  /** This month's auction. */
  auctionDate: string
  /** The next one, when it is known. Steps anchored to it wait until it is. */
  nextAuctionDate?: string | null
  /**
   * The day the auction was recorded, with its winner and its figures. Null
   * until then, so every step anchored to it waits rather than going out
   * half-filled.
   */
  settledDate?: string | null
}

/** The day a step falls on, or null when its anchor is not known yet. */
export function stepDate(step: Step, a: Anchors): string | null {
  const base = step.anchor === 'auction' ? a.auctionDate
    : step.anchor === 'next_auction' ? a.nextAuctionDate
    : a.settledDate
  if (!base) return null
  return addDays(base, step.offsetDays)
}

/** 'on auction day', '3 days before the auction', 'as soon as the auction is recorded'. */
export function stepWords(step: Step): string {
  const n = Math.abs(step.offsetDays)
  const day = n === 1 ? 'day' : 'days'
  if (step.anchor === 'settled') {
    if (step.offsetDays === 0) return 'as soon as the auction is recorded'
    return step.offsetDays < 0
      ? `${n} ${day} before the auction is recorded`
      : `${n} ${day} after the auction is recorded`
  }
  const anchor = step.anchor === 'auction' ? 'the auction' : 'the next auction'
  if (step.offsetDays === 0) return step.anchor === 'auction' ? 'on auction day' : 'on the next auction day'
  return step.offsetDays < 0 ? `${n} ${day} before ${anchor}` : `${n} ${day} after ${anchor}`
}

/** A step that cannot be saved, and why. */
export function stepProblem(step: Step): string | null {
  if (!Number.isInteger(step.offsetDays)) return 'Use whole days.'
  // Counting backwards from the moment something is recorded means a date in
  // the past, which never arrives again.
  if (step.anchor === 'settled' && step.offsetDays < 0) {
    return 'Nothing can go out before the auction is recorded.'
  }
  // A reminder 90 days out lands after the next two auctions and reads as a
  // mistake rather than a reminder.
  if (step.offsetDays < -60 || step.offsetDays > 60) return 'Keep it within 60 days of the auction.'
  return null
}

/** A step's own name, or the sensible default for its kind. */
export function stepLabel(step: Step): string {
  const own = String(step.label ?? '').trim()
  return own || STEP_LABEL[step.kind]
}

/**
 * A key nothing else in the schedule is using.
 *
 * Keys are what the log is written against, so reusing one would make an old
 * send look like today's and stop the new step going out.
 */
export function uniqueStepKey(existing: readonly Step[], base = 'step'): string {
  const taken = new Set(existing.map(s => s.key))
  for (let n = 1; n < 500; n++) {
    const key = `${base}-${n}`
    if (!taken.has(key)) return key
  }
  return `${base}-${Date.now()}`
}

/** Another step, added to the end of a schedule. */
export function newStep(existing: readonly Step[], patch: Partial<Step> = {}): Step {
  return {
    key: uniqueStepKey(existing),
    kind: 'reminder',
    audience: 'unpaid',
    anchor: 'auction',
    offsetDays: 10,
    enabled: true,
    templateId: null,
    label: null,
    ...patch,
  }
}

/**
 * The day this month's subscription falls due.
 *
 * A chit's dues are owed within a few days of the auction, not on the day of
 * the next one — which matters, because 'overdue by 12 days' is counted from
 * this date. When nothing is set, the next auction is used, which is the
 * latest it could possibly be owed.
 */
export function dueDateFor(
  auctionDate: string,
  nextAuctionDate?: string | null,
  duesDueDays?: number | null,
): string | null {
  if (duesDueDays != null && Number.isFinite(Number(duesDueDays))) {
    return addDays(auctionDate, Math.round(Number(duesDueDays)))
  }
  return nextAuctionDate ?? null
}

/**
 * The steps that apply to one member: their own if they have any, otherwise
 * the group's. REPLACES, never merges — see the note at the top.
 */
export function resolveSteps(groupSteps: readonly Step[], memberSteps?: readonly Step[] | null): readonly Step[] {
  return memberSteps && memberSteps.length > 0 ? memberSteps : groupSteps
}

export interface MemberLike {
  id: string
  name: string
  /** No phone, nothing to send to. */
  phone?: string | null
  /** Their own schedule, when they need different handling. */
  steps?: readonly Step[] | null
}

export interface PlanInput {
  /** Identifies the month, so a send can be logged against it. */
  auctionId: string
  anchors: Anchors
  groupSteps: readonly Step[]
  members: readonly MemberLike[]
  /** Who has paid this month — reminders skip them. */
  paidMemberIds?: readonly string[]
  /** Who won this month's auction, if it has been held. */
  winnerMemberId?: string | null
  /** Keys already sent. A repeat run must not message anybody twice. */
  sentKeys?: readonly string[]
  /** The day being planned for. */
  today: string
}

export interface Send {
  key: string
  memberId: string
  memberName: string
  stepKey: string
  kind: StepKind
  /** Which message to send, from the library. Null when none was chosen. */
  templateId: string | null
  /** The day it is due. Equal to `today` for everything in `due`. */
  date: string
}

export interface Skip {
  memberId: string
  stepKey: string
  reason: 'paid' | 'no_phone' | 'not_winner' | 'is_winner' | 'already_sent' | 'anchor_unknown' | 'disabled'
}

export interface Plan {
  /** Due today, and not yet sent. */
  due: Send[]
  /** Everything else, with the reason, so the screen can explain itself. */
  skipped: Skip[]
}

/**
 * Whether a logged attempt counts as finished business.
 *
 * Only 'sent' and 'failed' do. A message WAITING — for a registered WhatsApp
 * number, for Meta to approve the wording, for a detail nobody has filled in
 * — keeps its row and must be planned again tomorrow, or everything recorded
 * before the number went live would be counted as done and never actually go
 * out. 'failed' is final on purpose: a member with no usable phone number
 * should not be retried every morning for a month.
 */
export function isSettledSend(status: string): boolean {
  const s = String(status ?? '').toLowerCase()
  return s !== 'held' && s !== 'pending'
}

/** auction + member + step. The same message can never be logged twice. */
export function sendKey(auctionId: string, memberId: string, stepKey: string): string {
  return `${auctionId}:${memberId}:${stepKey}`
}

/**
 * Who should be messaged today, and who should not, with the reason.
 *
 * The skipped list is not debug output: it is what lets the screen say "11 of
 * 60 — the rest have paid" instead of showing a number nobody can check.
 */
export function plan(i: PlanInput): Plan {
  const paid = new Set(i.paidMemberIds ?? [])
  const sent = new Set(i.sentKeys ?? [])
  const due: Send[] = []
  const skipped: Skip[] = []

  for (const m of i.members) {
    for (const step of resolveSteps(i.groupSteps, m.steps)) {
      const add = (reason: Skip['reason']) => skipped.push({ memberId: m.id, stepKey: step.key, reason })

      if (!step.enabled) { add('disabled'); continue }

      const date = stepDate(step, i.anchors)
      if (!date) { add('anchor_unknown'); continue }
      if (date !== i.today) continue   // not today's business at all

      if (step.audience === 'winner' && m.id !== (i.winnerMemberId ?? '')) { add('not_winner'); continue }
      // The winner has their own message for this month; two on one day reads
      // as not knowing who won.
      if (step.audience === 'except_winner' && i.winnerMemberId && m.id === i.winnerMemberId) {
        add('is_winner'); continue
      }
      if (step.audience === 'unpaid' && paid.has(m.id)) { add('paid'); continue }
      if (!m.phone || !String(m.phone).trim()) { add('no_phone'); continue }

      const key = sendKey(i.auctionId, m.id, step.key)
      if (sent.has(key)) { add('already_sent'); continue }

      due.push({
        key, memberId: m.id, memberName: m.name, stepKey: step.key, kind: step.kind,
        templateId: step.templateId ?? null, date,
      })
    }
  }

  return { due, skipped }
}

/** Every step's date for a month, for a 'what is coming' view. Earliest first. */
export function timetable(groupSteps: readonly Step[], a: Anchors): { step: Step; date: string | null }[] {
  return groupSteps
    .map(step => ({ step, date: stepDate(step, a) }))
    .sort((x, y) => String(x.date ?? '9999').localeCompare(String(y.date ?? '9999')))
}

/** 'Nobody to message today', or '11 to message · 43 have paid'. */
export function planWords(p: Plan): string {
  if (p.due.length === 0) {
    const paid = p.skipped.filter(s => s.reason === 'paid').length
    if (paid > 0) return `Nothing to send today — ${paid} ${paid === 1 ? 'member has' : 'members have'} paid.`
    return 'Nothing to send today.'
  }
  const bits = [`${p.due.length} to message`]
  const paid = p.skipped.filter(s => s.reason === 'paid').length
  const noPhone = p.skipped.filter(s => s.reason === 'no_phone').length
  if (paid > 0) bits.push(`${paid} ${paid === 1 ? 'has' : 'have'} paid`)
  if (noPhone > 0) bits.push(`${noPhone} with no phone number`)
  return bits.join(' · ')
}
