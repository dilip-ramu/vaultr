// The outbox: messages queued for a time, sent when that time arrives.
//
// WHO CALLS THIS
//
// Anything with the secret. The daily Vercel cron calls it, which on a Hobby
// plan is once a day and within an hour of its slot — so with nothing else,
// a queued message leaves on the right DAY. Point a free scheduler
// (cron-job.org, UptimeRobot) at this url every ten minutes with the same
// Authorization header and it leaves within ten minutes.
//
// ── IT CANNOT SEND THE SAME ROW TWICE ───────────────────────────────────────
//
// A row is CLAIMED before any work: status moves 'queued' -> 'sending', and
// only from 'queued'. Two overlapping runs cannot both claim it, because the
// second one's update matches no rows. On top of that, the log's unique index
// on auction + member + step would refuse the duplicate anyway.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fromRow, templateById } from '@/lib/chit/messageTemplates'
import { type MissingPolicy } from '@/lib/chit/messageFields'
import { cloudConfig } from '@/lib/whatsapp/cloud'
import { broadcast, broadcastWords } from '@/lib/chit/sendBroadcast'
import { dueFirst, type SendScope } from '@/lib/chit/outbox'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = adminClient()
  const config = cloudConfig()
  const now = new Date()

  // A generous window: anything due, oldest first, so a backlog from a day
  // the trigger did not fire goes out in the order it was meant to.
  const { data: queued } = await sb.from('chit_scheduled_sends')
    .select('id, user_id, template_id, scope, group_id, member_id, send_at, status')
    .eq('status', 'queued')
    .lte('send_at', now.toISOString())
    .order('send_at', { ascending: true })
    .limit(50)

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

  return NextResponse.json({ ok: true, considered: rows.length, ran, notes: notes.slice(0, 20) })
}
