// Send one message — now, or at a time you choose — to everybody, one group,
// or one member.
//
// WHAT IS DELIBERATE HERE
//
// IT WILL NOT SEND THE SAME THING TWICE IN A DAY. The send is keyed auction +
// member + 'manual:<message>:<scope>:<date>', and chit_message_log has a
// unique index on those three, so a second press — or a double click, or a
// reloaded tab — writes nothing. Tomorrow is a different key, so a deliberate
// repeat still works.
//
// A TIME IN THE FUTURE IS QUEUED, NOT SENT. The row goes into
// chit_scheduled_sends and app/api/cron/chit-outbox sends it when it is due.
// How close to the chosen minute that is depends on how often the outbox is
// checked — see lib/chit/outbox.ts, which says so on the screen rather than
// implying a precision that is not there.
//
// The sending itself is lib/chit/sendBroadcast.ts, shared with the queue so
// the two cannot disagree about who a message is for.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import { fromRow, templateById } from '@/lib/chit/messageTemplates'
import { type MissingPolicy } from '@/lib/chit/messageFields'
import { cloudConfig } from '@/lib/whatsapp/cloud'
import { broadcast, broadcastWords } from '@/lib/chit/sendBroadcast'
import { scheduleProblem, type SendScope } from '@/lib/chit/outbox'

export async function POST(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Messaging every member is not something a collector or a viewer does.
  if (!CAN.manageGroups(access.role)) {
    return NextResponse.json({ error: 'You do not have permission to message members.' }, { status: 403 })
  }

  let body: {
    templateId?: string
    scope?: SendScope
    groupId?: string | null
    memberId?: string | null
    sendAt?: string | null
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const templateId = String(body.templateId ?? '')
  const scope: SendScope = body.scope === 'group' || body.scope === 'member' ? body.scope : 'all'
  const draft = {
    templateId, scope,
    groupId: body.groupId ?? null,
    memberId: body.memberId ?? null,
    sendAt: body.sendAt ?? null,
  }

  const problem = scheduleProblem(draft)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const sb = await createClient()
  const uid = access.ownerId
  const config = cloudConfig()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const { data: templateRows } = await sb.from('chit_message_templates').select('*').eq('user_id', uid)
  const template = templateById(((templateRows ?? []) as Record<string, unknown>[]).map(fromRow), templateId)
  if (!template) return NextResponse.json({ error: 'That message is not in the library.' }, { status: 404 })

  if (config && template.status !== 'APPROVED') {
    return NextResponse.json({
      error: `"${template.label}" has not been approved by Meta yet, so WhatsApp will refuse it.`,
    }, { status: 400 })
  }

  // ── Later ─────────────────────────────────────────────────────────────────
  if (draft.sendAt) {
    const { data, error } = await sb.from('chit_scheduled_sends').insert({
      user_id: uid,
      template_id: template.id,
      scope,
      group_id: draft.groupId,
      member_id: draft.memberId,
      send_at: draft.sendAt,
    }).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, queued: true, id: data?.id ?? null })
  }

  // ── Now ───────────────────────────────────────────────────────────────────
  const { data: settings } = await sb.from('chit_settings')
    .select('dues_due_days, missing_policy').eq('user_id', uid).maybeSingle()

  const result = await broadcast({
    sb, uid, template, scope,
    groupId: draft.groupId,
    memberId: draft.memberId,
    // The scope is in the key, so a test to one group does not block the real
    // send to everybody later the same day.
    stepKey: `manual:${template.id}:${scope}${draft.groupId ?? draft.memberId ? `:${draft.groupId ?? draft.memberId}` : ''}:${today}`,
    today,
    duesDueDays: (settings?.dues_due_days as number | null) ?? null,
    missingPolicy: (settings?.missing_policy ?? {}) as MissingPolicy,
    config,
  })

  return NextResponse.json({
    ok: true,
    ...result,
    note: broadcastWords(result, Boolean(config)),
    notes: result.notes.slice(0, 30),
  })
}

/** DELETE — call off something queued. */
export async function DELETE(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.manageGroups(access.role)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  }
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 })

  const sb = await createClient()
  // Only something still waiting can be called off. One already sending is
  // past the point of changing your mind.
  const { data, error } = await sb.from('chit_scheduled_sends')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', access.ownerId).eq('status', 'queued')
    .select('id').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Too late — it has already gone out.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
