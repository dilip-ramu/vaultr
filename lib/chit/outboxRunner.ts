// Sending what the outbox is holding.
//
// WHY IT IS NOT ONLY A CRON
//
// A welcome message that arrives the next morning is not a welcome. The queue
// exists so that a send can be scheduled, survive a failure and never go
// twice — not so that everything waits for a cron. So this is a function, and
// the screen that adds a member runs it the moment the member is added, while
// the daily job still sweeps up anything queued for a date.
//
// ── IT CANNOT SEND THE SAME ROW TWICE ───────────────────────────────────────
//
// A row is CLAIMED before any work: status moves 'queued' -> 'sending', and
// only from 'queued'. Two callers racing — the cron and an add in the same
// second — cannot both claim it, because the second one's update matches no
// rows. The log's unique index would refuse the duplicate even then.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { fromRow, templateById } from './messageTemplates'
import { type MissingPolicy } from './messageFields'
import { cloudConfig } from '@/lib/whatsapp/cloud'
import { broadcast, broadcastWords } from './sendBroadcast'
import { dueFirst, type SendScope } from './outbox'

export interface DrainResult {
  considered: number
  ran: number
  notes: string[]
}

export async function drainOutbox(
  sb: SupabaseClient,
  opts: { userId?: string; limit?: number; now?: Date } = {},
): Promise<DrainResult> {
  const now = opts.now ?? new Date()
  const config = cloudConfig()

  // Anything due, oldest first, so a backlog from a day the trigger did not
  // fire goes out in the order it was meant to.
  let q = sb.from('chit_scheduled_sends')
    .select('id, user_id, template_id, scope, group_id, member_id, send_at, status')
    .eq('status', 'queued')
    .lte('send_at', now.toISOString())
    .order('send_at', { ascending: true })
    .limit(opts.limit ?? 50)
  // An add by one person should not drag another account's queue with it.
  if (opts.userId) q = q.eq('user_id', opts.userId)

  const { data: queued } = await q

  const rows = ((queued ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    userId: String(r.user_id),
    templateId: String(r.template_id),
    scope: String(r.scope) as SendScope,
    groupId: (r.group_id as string | null) ?? null,
    memberId: (r.member_id as string | null) ?? null,
    sendAt: String(r.send_at),
    status: 'queued' as const,
  }))

  let ran = 0
  const notes: string[] = []

  for (const row of dueFirst(rows, now)) {
    // Claim it. If this updates nothing, another run has it.
    const { data: claimed } = await sb.from('chit_scheduled_sends')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'queued')
      .select('id').maybeSingle()
    if (!claimed) continue

    try {
      const [{ data: templateRows }, { data: settings }] = await Promise.all([
        sb.from('chit_message_templates').select('*').eq('user_id', row.userId),
        sb.from('chit_settings').select('dues_due_days, missing_policy').eq('user_id', row.userId).maybeSingle(),
      ])

      const template = templateById(
        ((templateRows ?? []) as Record<string, unknown>[]).map(fromRow), row.templateId)

      if (!template) {
        await sb.from('chit_scheduled_sends').update({
          status: 'failed', result: 'That message is no longer in the library.',
          sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        continue
      }

      // The day in Tiruppur, since the figures belong to a local day.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

      const result = await broadcast({
        sb, uid: row.userId, template,
        scope: row.scope, groupId: row.groupId, memberId: row.memberId,
        // The queued row's own id, so this send can never collide with a
        // manual one or with another queued row.
        stepKey: `queued:${row.id}`,
        today,
        duesDueDays: (settings?.dues_due_days as number | null) ?? null,
        missingPolicy: (settings?.missing_policy ?? {}) as MissingPolicy,
        config,
      })

      const words = broadcastWords(result, Boolean(config))
      await sb.from('chit_scheduled_sends').update({
        status: 'sent',
        result: [words, ...result.notes.slice(0, 5)].join(' · ').slice(0, 2000),
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)

      ran++
      notes.push(`${row.id}: ${words}`)
    } catch (e) {
      // Left as failed rather than put back: a row that throws will throw
      // again, and a queue that retries for ever is how sixty people get the
      // same message sixty times.
      await sb.from('chit_scheduled_sends').update({
        status: 'failed',
        result: e instanceof Error ? e.message : 'Unknown error',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
    }
  }

  return { considered: rows.length, ran, notes }
}

/** Drain this one account's queue now, and never let it break the thing that
 *  called it. Used by the screens that add a member: the welcome is already
 *  queued by the database trigger, and this is what makes it leave at once
 *  instead of waiting for tomorrow's cron. Wrap it in Next's `after()` so the
 *  person sees "member added" immediately and the sending happens behind it.
 *
 *  Every failure is swallowed on purpose. A WhatsApp number that is not set
 *  up, a template Meta has not approved, a missing service key — none of that
 *  should turn "member added" into an error, because the member WAS added.
 *  The row stays in the outbox either way, so the daily run picks it up. */
export async function sendQueuedNow(userId: string): Promise<void> {
  try {
    // A minute of slack. The database stamped the welcome with ITS clock and
    // this code reads the server's; a few seconds of difference between them
    // must not leave the row sitting until tomorrow. A send genuinely booked
    // for the next minute leaving a minute early harms nobody.
    await drainOutbox(createAdminClient(), {
      userId, limit: 40, now: new Date(Date.now() + 60_000),
    })
  } catch {
    // Left for the daily run.
  }
}
