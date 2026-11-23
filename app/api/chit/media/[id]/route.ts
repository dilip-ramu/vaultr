// Opening a picture or a file a member sent.
//
// WhatsApp hands the webhook an id, not a file, and fetching it needs the
// same token that sends messages. So the picture cannot be a plain link in
// the page — it comes through here, where the token stays on the server and
// the row is checked against the signed-in account first.
//
// Meta's own copy does not last for ever (a few weeks), so this is for
// looking at a reply now. Saving a payment proof permanently is a separate
// job, deliberately not done behind the user's back.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess } from '@/lib/chit/access'
import { cloudConfig } from '@/lib/whatsapp/cloud'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await resolveChitAccess()
  if (!access) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const sb = await createClient()

  // The row, and that it belongs to this account. The media id itself is
  // never accepted from the browser: only a row id we can check.
  const { data: row } = await sb.from('chit_message_inbox')
    .select('media_id, media_mime').eq('user_id', access.ownerId).eq('id', id).maybeSingle()

  if (!row?.media_id) return new NextResponse('Not found', { status: 404 })

  const config = cloudConfig()
  if (!config) return new NextResponse('WhatsApp is not connected', { status: 400 })

  // Two steps at Meta: the id gives a URL, and the URL needs the token too.
  const lookup = await fetch(
    `https://graph.facebook.com/${config.version}/${String(row.media_id)}`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  )
  if (!lookup.ok) return new NextResponse('WhatsApp no longer has this file', { status: 404 })

  const meta = await lookup.json().catch(() => ({})) as { url?: string; mime_type?: string }
  if (!meta.url) return new NextResponse('WhatsApp no longer has this file', { status: 404 })

  const file = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.token}` } })
  if (!file.ok || !file.body) return new NextResponse('Could not fetch the file', { status: 502 })

  return new NextResponse(file.body, {
    status: 200,
    headers: {
      'Content-Type': meta.mime_type || String(row.media_mime ?? 'application/octet-stream'),
      // Private: it is one member's message, and a cache shared with anybody
      // else is the one thing this must not be.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
