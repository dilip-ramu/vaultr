// Messages: what members receive, when it goes out, and who is handled
// differently. One of each, for the whole chit business.
//
// This is a page of its own rather than a panel inside a group, because none
// of it belongs to a group. Four groups share the wording (v137) and now the
// schedule too (v138); what stays per member is the override at the bottom.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import { fromRow } from '@/lib/chit/messageTemplates'
import type { Step } from '@/lib/chit/reminderSchedule'
import MessageLibrary from '@/components/chit/MessageLibrary'
import ReminderRules from '@/components/chit/ReminderRules'
import MemberRules, { type MemberRow } from '@/components/chit/MemberRules'
import MissingPolicy from '@/components/chit/MissingPolicy'
import Replies, { type ReplyRow } from '@/components/chit/Replies'
import SendNow, { type QueuedRow } from '@/components/chit/SendNow'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit messages — Inex' }

export default async function ChitMessagesPage() {
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  // The wording and the timing that reach every member are group-management.
  if (!CAN.manageGroups(access.role)) redirect('/chit')

  const supabase = await createClient()
  const uid = access.ownerId

  const [
    { data: templateRows }, { data: settings }, { data: members }, { data: replies },
    { data: groups }, { data: queued },
  ] = await Promise.all([
    supabase.from('chit_message_templates').select('*').eq('user_id', uid)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('chit_settings').select('reminder_steps, dues_due_days, missing_policy')
      .eq('user_id', uid).maybeSingle(),
    supabase.from('chit_members').select('id, name, phone, reminder_steps')
      .eq('user_id', uid).eq('is_active', true).order('name'),
    // What members have written back. There is no other place to see it: a
    // Cloud API number has no app.
    supabase.from('chit_message_inbox')
      .select('id, member_id, body, from_phone, looks_paid, looks_stop, handled, received_at, member:chit_members(name)')
      .eq('user_id', uid).order('received_at', { ascending: false }).limit(100),
    supabase.from('chit_groups').select('id, name')
      .eq('user_id', uid).eq('status', 'active').order('name'),
    // What is waiting to go out, and what recently did.
    supabase.from('chit_scheduled_sends')
      .select('id, send_at, scope, status, result, template:chit_message_templates(label), group:chit_groups(name), member:chit_members(name)')
      .eq('user_id', uid).order('send_at', { ascending: true }).limit(30),
  ])

  const templates = ((templateRows ?? []) as Record<string, unknown>[]).map(fromRow)
  const connected = Boolean(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_TOKEN)
  const live = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN)

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
          Chit messages
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          What members receive and when — written once, used by every group.
        </p>
      </div>

      <Replies rows={(replies ?? []) as unknown as ReplyRow[]} />

      <SendNow
        templates={templates}
        connected={connected}
        groups={((groups ?? []) as Record<string, unknown>[])
          .map(g => ({ id: String(g.id), name: String(g.name ?? '') }))}
        members={((members ?? []) as Record<string, unknown>[])
          .map(m => ({ id: String(m.id), name: String(m.name ?? '') }))}
        queued={(queued ?? []) as unknown as QueuedRow[]}
        // Set CHIT_OUTBOX_PINGED once an outside scheduler checks the outbox
        // more often than Vercel's once-a-day cron, so the screen stops
        // promising less than it delivers.
        frequentTrigger={Boolean(process.env.CHIT_OUTBOX_PINGED)}
      />

      <ReminderRules
        userId={uid}
        savedSteps={(settings?.reminder_steps as Step[] | null) ?? null}
        duesDueDays={(settings?.dues_due_days as number | null) ?? null}
        templates={templates}
        whatsappLive={live}
      />

      <MessageLibrary saved={templates} connected={connected} />

      <MissingPolicy
        userId={uid}
        policy={(settings?.missing_policy ?? {}) as Record<string, 'fill' | 'hold'>}
      />

      <MemberRules
        members={((members ?? []) as Record<string, unknown>[]).map(m => ({
          id: String(m.id),
          name: String(m.name ?? ''),
          phone: (m.phone as string | null) ?? null,
          reminder_steps: (m.reminder_steps as Step[] | null) ?? null,
        })) as MemberRow[]}
        templates={templates}
      />
    </div>
  )
}
