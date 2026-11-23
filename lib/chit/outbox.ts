// A message queued to go out later, to a chosen group or member.
//
// WHY THIS EXISTS
//
// Two things were missing from 'send one now'. It went to every active group,
// so there was no way to test on one group or to message only the group whose
// auction moved. And it went immediately, so a notice known on Monday could
// not be written on Monday to leave on Wednesday evening.
//
// ── WHAT THE TIMING ACTUALLY PROMISES ───────────────────────────────────────
//
// The queue is read by whatever trigger the deployment has. A Vercel Hobby
// cron may only run once a day and within an hour of its slot, so without an
// outside trigger a queued message leaves on the right DAY, not at the right
// minute. With a free pinger every ten minutes it leaves within ten minutes.
// The screen says which, rather than implying a precision that is not there.
//
// Pure. No database, no network, no clock of its own — now is passed in.

export type SendScope = 'all' | 'group' | 'member'

export interface ScheduledSend {
  id: string
  templateId: string
  scope: SendScope
  groupId?: string | null
  memberId?: string | null
  /** When it should leave, as an instant. */
  sendAt: string
  status: 'queued' | 'sent' | 'failed' | 'cancelled'
  result?: string | null
}

export interface ScheduleDraft {
  templateId: string
  scope: SendScope
  groupId?: string | null
  memberId?: string | null
  /** Empty means 'now'. */
  sendAt?: string | null
}

/** What stops this being queued, in words. Null when it is fine. */
export function scheduleProblem(d: ScheduleDraft, now: Date = new Date()): string | null {
  if (!d.templateId) return 'Choose which message to send.'
  if (d.scope === 'group' && !d.groupId) return 'Choose which group.'
  if (d.scope === 'member' && !d.memberId) return 'Choose which member.'

  if (d.sendAt) {
    const t = Date.parse(d.sendAt)
    if (!Number.isFinite(t)) return 'That date and time cannot be read.'
    // A minute's grace, so pressing send on the time you just picked works.
    if (t < now.getTime() - 60_000) return 'That time has passed. Pick a later one.'
    // A year out is a typo, not a plan.
    if (t > now.getTime() + 365 * 24 * 3600_000) return 'That is more than a year away.'
  }
  return null
}

/** Whether this row should go out now. */
export function isDue(s: Pick<ScheduledSend, 'status' | 'sendAt'>, now: Date = new Date()): boolean {
  if (s.status !== 'queued') return false
  const t = Date.parse(String(s.sendAt))
  return Number.isFinite(t) && t <= now.getTime()
}

/** The queued rows that are due, oldest first, so a backlog goes out in order. */
export function dueFirst<T extends Pick<ScheduledSend, 'status' | 'sendAt'>>(
  rows: readonly T[],
  now: Date = new Date(),
): T[] {
  return rows.filter(r => isDue(r, now))
    .sort((a, b) => String(a.sendAt).localeCompare(String(b.sendAt)))
}

/** 'in 20 minutes', 'in 3 hours', 'in 2 days', 'now'. */
export function whenWords(sendAt: string, now: Date = new Date()): string {
  const t = Date.parse(String(sendAt))
  if (!Number.isFinite(t)) return 'at an unreadable time'
  const mins = Math.round((t - now.getTime()) / 60000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}

/**
 * How close to the chosen minute this deployment can actually be.
 *
 * Said out loud on the screen, because a queue that only drains once a day
 * looks broken to somebody who picked 6:30pm and saw nothing at 6:31.
 */
export function precisionWords(frequentTrigger: boolean): string {
  return frequentTrigger
    ? 'Queued messages are checked every few minutes, so this leaves close to the minute you choose.'
    : 'Queued messages are checked once a day with the morning run, so this leaves on the day you choose rather than at the minute. Point a free scheduler at the outbox to make it exact.'
}

/** 'to every active group', 'to Uma 5 Lakh A', 'to Ravi'. */
export function scopeWords(scope: SendScope, name?: string | null): string {
  if (scope === 'member') return `to ${name ?? 'one member'}`
  if (scope === 'group') return `to ${name ?? 'one group'}`
  return 'to every active group'
}
