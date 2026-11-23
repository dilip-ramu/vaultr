// The message library: saving one, submitting it to Meta, reading back what
// Meta decided, and putting one away.
//
// WHAT IS DELIBERATE HERE
//
// SAVING AND SUBMITTING ARE SEPARATE. A message can be written over several
// sittings and only sent to Meta when it is right. Meta allows an approved
// template one edit a day and ten a month, so an accidental submission is
// expensive in a way an accidental save is not.
//
// NOTHING IS DELETED. Meta will not let a deleted template's name be reused
// for 30 days, and a template may be referenced by a group's schedule and by
// every message already logged against it. So it is archived instead.
//
// Everything that can be checked without the network has already been checked
// by lib/chit/messageTemplates.ts — and is checked AGAIN here, because a screen
// can be stale and a wasted submission costs one of Meta's edits.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { templateProblems, toDraft, type MessageTemplate } from '@/lib/chit/messageTemplates'
import { createPayload, createUrl, editsLeft, type TemplateCategory } from '@/lib/whatsapp/templateSpec'

function metaEnv() {
  const wabaId = process.env.WHATSAPP_WABA_ID
  const token = process.env.WHATSAPP_TOKEN
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
  return wabaId && token ? { wabaId, token, version } : null
}

/** The row shape, from the template as the screen holds it. */
function rowFrom(t: MessageTemplate, userId: string) {
  const draft = toDraft(t)
  return {
    user_id: userId,
    // 'kind' predates the library. It is now simply the Meta name, kept
    // because the message log records it against each send.
    kind: t.name,
    label: t.label,
    audience: t.audience,
    template_name: t.name,
    language: t.language,
    body: t.body,
    footer: t.footer ?? null,
    // The compiled variables, in Meta's order — a record of what was submitted.
    variables: draft.variables,
    category_requested: t.category,
    sort_order: t.sortOrder ?? 0,
    archived: Boolean(t.archived),
    updated_at: new Date().toISOString(),
  }
}

/** POST — save one message, and submit it to Meta when asked to. */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { template?: MessageTemplate; submit?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const t = body.template
  if (!t) return NextResponse.json({ error: 'Which message?' }, { status: 400 })

  const found = templateProblems(t)
  if (found.length > 0) {
    return NextResponse.json({ error: found[0].message, problems: found }, { status: 400 })
  }

  // Two messages under one Meta name is a send going to the wrong wording.
  const { data: clash } = await supabase.from('chit_message_templates')
    .select('id').eq('user_id', user.id).eq('template_name', t.name).neq('id', t.id || '00000000-0000-0000-0000-000000000000')
  if ((clash ?? []).length > 0) {
    return NextResponse.json({ error: `Another message is already called ${t.name}. Change the name.` }, { status: 400 })
  }

  const row = rowFrom(t, user.id)

  // What is already stored, for the edit allowance and the status.
  const { data: existing } = t.id
    ? await supabase.from('chit_message_templates')
        .select('id, edit_times, status, meta_template_id').eq('user_id', user.id).eq('id', t.id).maybeSingle()
    : { data: null }

  const times: string[] = Array.isArray(existing?.edit_times) ? (existing!.edit_times as string[]) : []

  async function save(extra: Record<string, unknown>) {
    if (existing?.id) {
      const { data, error } = await supabase.from('chit_message_templates')
        .update({ ...row, ...extra }).eq('id', existing.id).eq('user_id', user!.id).select('id').maybeSingle()
      return { id: data?.id ?? existing.id, error }
    }
    const { data, error } = await supabase.from('chit_message_templates')
      .insert({ ...row, ...extra }).select('id').maybeSingle()
    return { id: data?.id ?? null, error }
  }

  // ── Save only ─────────────────────────────────────────────────────────────
  if (!body.submit) {
    // An approved template's wording at Meta is unchanged by a save here, so
    // the status would be a lie. It goes back to being a draft of a change.
    const status = existing?.status === 'APPROVED' ? 'APPROVED' : 'DRAFT'
    const { id, error } = await save({ status })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true, id, status,
      note: existing?.status === 'APPROVED'
        ? 'Saved here. Submit it to Meta for members to receive the new wording.'
        : 'Saved.',
    })
  }

  // ── Submit to Meta ────────────────────────────────────────────────────────
  if (existing?.status === 'APPROVED') {
    const left = editsLeft(times)
    if (left.in24h === 0) {
      return NextResponse.json({ error: 'Meta allows one edit a day on an approved message. Try again tomorrow.' }, { status: 429 })
    }
    if (left.in30d === 0) {
      return NextResponse.json({ error: 'Meta allows ten edits in 30 days on an approved message, and this one has used them.' }, { status: 429 })
    }
  }

  const env = metaEnv()
  if (!env) {
    const { id, error } = await save({ status: 'DRAFT' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true, id, status: 'DRAFT',
      note: 'Saved here. It cannot be submitted until a WhatsApp business account is connected.',
    })
  }

  const draft = toDraft(t)
  const res = await fetch(createUrl(env.wabaId, env.version), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload({ ...draft, category: t.category as TemplateCategory })),
  })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = (data as { error?: { message?: string; error_user_msg?: string } }).error
    const message = err?.error_user_msg || err?.message || `Meta refused it (HTTP ${res.status})`
    await save({ status: 'REJECTED', rejected_reason: message })
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const meta = data as { id?: string; status?: string; category?: string }
  const { id, error } = await save({
    status: meta.status ?? 'PENDING',
    meta_template_id: meta.id ?? null,
    category_assigned: meta.category ?? null,
    rejected_reason: null,
    submitted_at: new Date().toISOString(),
    edit_times: [...times, new Date().toISOString()],
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, status: meta.status ?? 'PENDING' })
}

/** DELETE — put one away. Archived, never destroyed: see the note at the top. */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which message?' }, { status: 400 })

  const restore = req.nextUrl.searchParams.get('restore') === '1'
  const { error } = await supabase.from('chit_message_templates')
    .update({ archived: !restore, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, archived: !restore })
}

/** GET — ask Meta what became of them. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const env = metaEnv()
  if (!env) return NextResponse.json({ ok: true, refreshed: 0, note: 'No WhatsApp business account connected yet.' })

  const res = await fetch(
    `https://graph.facebook.com/${env.version}/${env.wabaId}/message_templates?fields=name,language,status,category,rejected_reason&limit=200`,
    { headers: { Authorization: `Bearer ${env.token}` } },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error
    return NextResponse.json({ error: err?.message ?? `HTTP ${res.status}` }, { status: 400 })
  }

  const live = ((data as { data?: Record<string, unknown>[] }).data ?? [])
  const { data: mine } = await supabase.from('chit_message_templates')
    .select('id, template_name, language').eq('user_id', user.id)

  let refreshed = 0
  for (const row of (mine ?? []) as { id: string; template_name: string; language: string }[]) {
    const match = live.find(t => String(t.name) === row.template_name && String(t.language) === row.language)
    if (!match) continue
    await supabase.from('chit_message_templates').update({
      status: String(match.status ?? 'PENDING'),
      category_assigned: match.category ? String(match.category) : null,
      rejected_reason: match.rejected_reason ? String(match.rejected_reason) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('user_id', user.id)
    refreshed++
  }

  return NextResponse.json({ ok: true, refreshed })
}
