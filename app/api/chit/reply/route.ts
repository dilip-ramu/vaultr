// Replying to a member in your own words.
//
// WHY THIS EXISTS
//
// A Cloud API number has no app, so this is the only place a reply can be
// typed. WhatsApp allows free wording for 24 hours after a member writes to
// you; outside that window only an approved template may be sent, and Meta
// refuses anything else.
//
// The window is checked HERE as well as on the screen. A tab left open all
// night would otherwise offer a text box that cannot work, and the error Meta
// returns for it reads like a configuration fault rather than 'they have to
// write first'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import { cloudConfig, sendText, windowLeftMinutes } from '@/lib/whatsapp/cloud'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.manageGroups(access.role)) {
    return NextResponse.json({ error: 'You do not have permission to message members.' }, { status: 403 })
  }

  let body: { memberId?: string; text?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const memberId = String(body.memberId ?? '')
  const text = String(body.text ?? '')
  if (!memberId || !text.trim()) return NextResponse.json({ error: 'Who, and what?' }, { status: 400 })

  const sb = await createClient()
  const uid = access.ownerId

  const { data: member } = await sb.from('chit_members')
    .select('id, name, phone, dial_code').eq('user_id', uid).eq('id', memberId).maybeSingle()
  if (!member) return NextResponse.json({ error: 'No such member.' }, { status: 404 })

  // The window runs from the last thing THEY sent.
  const { data: last } = await sb.from('chit_message_inbox')
    .select('received_at').eq('user_id', uid).eq('member_id', memberId)
    .order('received_at', { ascending: false }).limit(1).maybeSingle()

  const left = windowLeftMinutes(last?.received_at as string | undefined)
  if (left <= 0) {
    return NextResponse.json({
      error: `WhatsApp only allows a reply in your own words within 24 hours of ${String(member.name)} writing to you. Send one of your approved messages instead, or wait for them to write.`,
    }, { status: 400 })
  }

  const config = cloudConfig()
  if (!config) return NextResponse.json({ error: 'No WhatsApp number is registered yet.' }, { status: 400 })

  const to = normalizeWhatsAppNumber(
    `${String(member.dial_code ?? '91')}${String(member.phone ?? '')}`.replace(/\D/g, ''),
  )
  if (!to) return NextResponse.json({ error: 'That member has no usable phone number.' }, { status: 400 })

  const res = await sendText({ to, body: text }, config)

  // Logged like any other message, so the history in a group's Reminders tab
  // is the whole conversation rather than only what the app sent by itself.
  await sb.from('chit_message_log').insert({
    user_id: uid,
    member_id: memberId,
    // A reply belongs to no group and no auction: it is a conversation.
    group_id: null,
    auction_id: null,
    step_key: `reply:${Date.now()}`,
    kind: 'reply',
    channel: 'whatsapp',
    status: res.ok ? 'sent' : 'failed',
    provider_message_id: res.ok ? res.messageId : null,
    body: text.trim(),
    error: res.ok ? null : res.error,
  })

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, minutesLeft: left })
}
