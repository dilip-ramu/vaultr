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
import Conversations from '@/components/chit/Conversations'
import type { InboxRow, OutRow } from '@/lib/chit/conversations'
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
    { data: groups }, { data: outgoing }, { data: queued },
  ] = await Promise.all([
    supabase.from('chit_message_templates').select('*').eq('user_id', uid)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('chit_settings')
      .select('reminder_steps, dues_due_days, missing_policy, welcome_template_id, joined_template_id')
      .eq('user_id', uid).maybeSingle(),
    supabase.from('chit_members').select('id, name, phone, reminder_steps')
      .eq('user_id', uid).eq('is_active', true).order('name'),
    // What members have written back. There is no other place to see it: a
    // Cloud API number has no app.
    supabase.from('chit_message_inbox')
      .select('id, member_id, body, from_phone, media_id, media_kind, looks_paid, looks_stop, handled, received_at, member:chit_members(name, member_code)')
      .eq('user_id', uid).order('received_at', { ascending: false }).limit(300),
    supabase.from('chit_groups').select('id, name')
      .eq('user_id', uid).eq('status', 'active').order('name'),
    // What was sent to each member, for the other side of the conversation.
    supabase.from('chit_message_log')
      .select('id, member_id, body, kind, status, error, sent_at, member:chit_members(name, member_code)')
      .eq('user_id', uid).not('member_id', 'is', null)
      .order('sent_at', { ascending: false }).limit(400),
    // What is waiting to go out, and what recently did.
    supabase.from('chit_scheduled_sends')
      .select('id, send_at, scope, status, result, template:chit_message_templates(label), group:chit_groups(name), member:chit_members(name)')
      .eq('user_id', uid).order('send_at', { ascending: true }).limit(30),
  ])

  const templates = ((templateRows ?? []) as Record<string, unknown>[]).map(fromRow)

  // Which chits each member sits in. Needed twice: to say who a reply came
  // from, and because a member in two chits has two sets of figures, so one
  // of them has to be named before a message can be sent to them.
  const { data: links } = await supabase.from('chit_group_members')
    .select('member_id, group_id, group:chit_groups(name, status)')
  const memberGroups: Record<string, { id: string; name: string }[]> = {}
  for (const l of (links ?? []) as Record<string, unknown>[]) {
    const g = l.group as { name?: unknown; status?: unknown } | null
    const name = String(g?.name ?? '').trim()
    // A finished chit has no figures worth messaging about.
    if (!name || String(g?.status ?? 'active') !== 'active') continue
    const key = String(l.member_id)
    memberGroups[key] = [...(memberGroups[key] ?? []), { id: String(l.group_id), name }]
  }
  const groupNamesByMember: Record<string, string[]> = Object.fromEntries(
    Object.entries(memberGroups).map(([k, v]) => [k, v.map(g => g.name)]))
  const connected = Boolean(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_TOKEN)
  const live = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN)

  // Which settings are missing, by name.
  //
  // Sending and submitting a template need DIFFERENT settings, so 'it says
  // not connected here but it sent there' is a real and confusing state. The
  // names are not secrets — the values are — and naming them turns half an
  // hour of guessing into one line.
  const missingEnv = ([
    ['WHATSAPP_PHONE_NUMBER_ID', 'to send messages'],
    ['WHATSAPP_WABA_ID', 'to submit wording to Meta'],
    ['WHATSAPP_TOKEN', 'for both'],
    ['WHATSAPP_VERIFY_TOKEN', 'to receive replies'],
    ['WHATSAPP_APP_SECRET', 'to prove replies came from Meta'],
  ] as const).filter(([name]) => !process.env[name])

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

      {missingEnv.length > 0 && (
        <div className="rounded-2xl p-4"
          style={{ border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--expense) 7%, transparent)' }}>
          <p className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>
            {missingEnv.length === 1 ? 'One setting is missing' : `${missingEnv.length} settings are missing`} in Vercel
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {missingEnv.map(([name, why]) => (
              <li key={name} className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                · <b>{name}</b> — {why}
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
            Add them under Settings &rarr; Environment Variables for Production, then redeploy —
            a new build is the only thing that picks them up.
          </p>
        </div>
      )}

      <Conversations
        inbox={(replies ?? []) as unknown as InboxRow[]}
        sent={(outgoing ?? []) as unknown as OutRow[]}
        groupsByMember={groupNamesByMember}
      />

      <SendNow
        templates={templates}
        connected={connected}
        groups={((groups ?? []) as Record<string, unknown>[])
          .map(g => ({ id: String(g.id), name: String(g.name ?? '') }))}
        members={((members ?? []) as Record<string, unknown>[])
          .map(m => ({ id: String(m.id), name: String(m.name ?? '') }))}
        groupsByMember={memberGroups}
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
        welcomeTemplateId={(settings?.welcome_template_id as string | null) ?? null}
        joinedTemplateId={(settings?.joined_template_id as string | null) ?? null}
      />

      <MessageLibrary
        saved={templates}
        connected={connected}
        welcomeTemplateId={(settings?.welcome_template_id as string | null) ?? null}
        joinedTemplateId={(settings?.joined_template_id as string | null) ?? null}
      />

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
