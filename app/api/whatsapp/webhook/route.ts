// Where WhatsApp delivers replies and delivery reports.
//
// This endpoint is PUBLIC — Meta calls it, so there is no session and no
// cookie. Every POST is therefore checked against the app secret before a
// single byte is believed. A forged 'read', or a forged reply saying 'paid',
// would be worse than having no webhook at all.
//
// It must answer 200 quickly and always. Meta retries anything else and then
// disables the subscription, so an unrecognised payload is ignored rather than
// argued with, and a database failure for one event does not abandon the rest.
//
// Nothing here parses anything by hand: lib/whatsapp/webhook.ts does that and
// is tested.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  verifyChallenge, signatureOk, parseEvents, betterStatus,
  matchMemberByPhone, looksLikePaid, looksLikeStop,
} from '@/lib/whatsapp/webhook'

// Service role: there is no signed-in user on a webhook, and the rows belong
// to whichever account the message was sent from.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** GET — Meta's one-time subscription handshake. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const challenge = verifyChallenge({
    mode: q.get('hub.mode'),
    token: q.get('hub.verify_token'),
    challenge: q.get('hub.challenge'),
  }, process.env.WHATSAPP_VERIFY_TOKEN)

  if (challenge === null) return new NextResponse('Forbidden', { status: 403 })
  // Plain text, exactly the challenge: Meta compares the body byte for byte.
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

/** POST — delivery reports and replies. */
export async function POST(req: NextRequest) {
  // The signature is over the RAW body. Parsing first and re-serialising
  // produces a different string and the check fails.
  const raw = await req.text()
  const ok = signatureOk(raw, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)
  if (!ok) return new NextResponse('Forbidden', { status: 403 })

  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const { statuses, messages } = parseEvents(payload)
  if (statuses.length === 0 && messages.length === 0) return NextResponse.json({ ok: true })

  const sb = adminClient()
  let updated = 0, stored = 0

  // ── Delivery reports ──────────────────────────────────────────────────────
  for (const s of statuses) {
    try {
      const { data: row } = await sb.from('chit_message_log')
        .select('id, status').eq('provider_message_id', s.messageId).maybeSingle()
      if (!row) continue

      const next = betterStatus(String(row.status), s.status)
      if (next === row.status && !s.error) continue

      await sb.from('chit_message_log').update({
        status: next,
        // Meta's own words, kept only when there are any.
        ...(s.error ? { error: s.error } : {}),
      }).eq('id', row.id)
      updated++
    } catch {
      // One bad event must not cost the rest of the batch.
    }
  }

  // ── Replies ───────────────────────────────────────────────────────────────
  for (const m of messages) {
    try {
      // Whose number is it? A webhook carries no user id, only a phone number,
      // so the member is found by the last ten digits of it.
      const tail = m.from.replace(/\D/g, '').slice(-10)
      const { data: people } = await sb.from('chit_members')
        .select('id, user_id, phone').ilike('phone', `%${tail}`)

      const candidates = ((people ?? []) as { id: string; user_id: string; phone: string | null }[])
      const match = matchMemberByPhone(m.from, candidates)

      // With no match there is no account to file it under, so the only
      // honest thing is to drop it rather than guess an owner.
      if (!match) continue

      const paid = looksLikePaid(m.body)
      const stop = looksLikeStop(m.body)

      await sb.from('chit_message_inbox').upsert({
        user_id: match.user_id,
        member_id: match.id,
        from_phone: m.from,
        wa_message_id: m.messageId,
        body: m.body,
        looks_paid: paid,
        looks_stop: stop,
        received_at: m.at ?? new Date().toISOString(),
      }, { onConflict: 'wa_message_id' })
      stored++

      // Honouring this is not optional: members marking messages as spam
      // costs delivery for every member, not just the one who complained.
      if (stop) {
        await sb.from('chit_members').update({ messaging_opted_out: true }).eq('id', match.id)
      }
    } catch {
      // Same: never fail the whole batch for one row.
    }
  }

  return NextResponse.json({ ok: true, updated, stored })
}
