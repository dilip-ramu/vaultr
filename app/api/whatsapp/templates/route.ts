// Submitting a WhatsApp template to Meta, and reading back what it decided.
//
// Everything that can go wrong without the network has already been checked by
// lib/whatsapp/templateSpec.ts before this is called. What is left here is the
// call itself and the bookkeeping: Meta's id, the status it came back with,
// and the category it ASSIGNED as opposed to the one we asked for.
//
// Meta allows an approved template 10 edits in 30 days and 1 in 24 hours, so
// every submission is timestamped. Running out of edits on a template that
// also cannot be renamed for 30 days after deletion is a corner worth seeing
// before you are standing in it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  problems, createPayload, createUrl, editsLeft,
  type TemplateDraft, type TemplateCategory,
} from '@/lib/whatsapp/templateSpec'

function metaEnv() {
  const wabaId = process.env.WHATSAPP_WABA_ID
  const token = process.env.WHATSAPP_TOKEN
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
  return wabaId && token ? { wabaId, token, version } : null
}

/** POST — submit one template, new or edited. */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { kind?: string; draft?: TemplateDraft }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const kind = String(body.kind ?? '')
  const draft = body.draft
  if (!kind || !draft) return NextResponse.json({ error: 'Which template, and its wording?' }, { status: 400 })

  // The same checks the screen runs, re-run here: a screen can be stale, and
  // a wasted submission costs one of Meta's limited edits.
  const found = problems(draft)
  if (found.length > 0) {
    return NextResponse.json({ error: found[0].message, problems: found }, { status: 400 })
  }

  const env = metaEnv()

  // The row is written whether or not Meta can be reached, so the wording is
  // never lost because a token was missing.
  const { data: existing } = await supabase.from('chit_message_templates')
    .select('id, edit_times, status').eq('user_id', user.id).eq('kind', kind).maybeSingle()

  const times: string[] = Array.isArray(existing?.edit_times) ? (existing!.edit_times as string[]) : []

  if (existing?.status === 'APPROVED') {
    const left = editsLeft(times)
    if (left.in24h === 0) {
      return NextResponse.json({ error: 'Meta allows one edit a day on an approved template. Try again tomorrow.' }, { status: 429 })
    }
    if (left.in30d === 0) {
      return NextResponse.json({ error: 'Meta allows ten edits in 30 days on an approved template, and this one has used them.' }, { status: 429 })
    }
  }

  const row = {
    user_id: user.id,
    kind,
    template_name: draft.name,
    language: draft.language,
    body: draft.body,
    footer: draft.footer ?? null,
    variables: draft.variables,
    category_requested: draft.category,
    updated_at: new Date().toISOString(),
  }

  if (!env) {
    await supabase.from('chit_message_templates')
      .upsert({ ...row, status: 'DRAFT' }, { onConflict: 'user_id,kind' })
    return NextResponse.json({
      ok: true,
      status: 'DRAFT',
      note: 'Saved here. It cannot be submitted until a WhatsApp business account is connected.',
    })
  }

  const res = await fetch(createUrl(env.wabaId, env.version), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload(draft)),
  })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = (data as { error?: { message?: string; error_user_msg?: string } }).error
    const message = err?.error_user_msg || err?.message || `Meta refused it (HTTP ${res.status})`
    await supabase.from('chit_message_templates')
      .upsert({ ...row, status: 'REJECTED', rejected_reason: message }, { onConflict: 'user_id,kind' })
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const meta = data as { id?: string; status?: string; category?: string }
  await supabase.from('chit_message_templates').upsert({
    ...row,
    status: meta.status ?? 'PENDING',
    meta_template_id: meta.id ?? null,
    category_assigned: meta.category ?? null,
    rejected_reason: null,
    submitted_at: new Date().toISOString(),
    edit_times: [...times, new Date().toISOString()],
  }, { onConflict: 'user_id,kind' })

  return NextResponse.json({ ok: true, status: meta.status ?? 'PENDING', id: meta.id ?? null })
}

/** GET — ask Meta what became of them. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const env = metaEnv()
  if (!env) return NextResponse.json({ ok: true, refreshed: 0, note: 'No WhatsApp business account connected yet.' })

  const res = await fetch(
    `https://graph.facebook.com/${env.version}/${env.wabaId}/message_templates?fields=name,language,status,category,rejected_reason&limit=100`,
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
