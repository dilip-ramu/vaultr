// Owner-only control of member portal access.
//
// Three actions, all requiring the FOREMAN's own app session:
//   enable / disable — turn portal access on or off for one member
//   invite           — mint a one-time login link and return a wa.me URL
//   revoke           — sign out every phone that member is signed in on
//
// The member id always arrives with `.eq('user_id', user.id)` attached, so one
// account can never reach into another account's chit.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mintInvite, revokeAllSessions, INVITE_TTL_MINUTES } from '@/lib/chit/portal-auth'
import { buildWhatsAppUrl } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

/** The site's own origin, so the link works in preview and production alike. */
function siteOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || req.nextUrl.origin
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const memberId = String(body?.memberId ?? '')
  if (!memberId) return NextResponse.json({ error: 'memberId is required' }, { status: 400 })

  const { data: rows } = await supabase.from('chit_members')
    .select('id, name, phone, portal_enabled')
    .eq('id', memberId).eq('user_id', user.id).limit(1)
  const member = rows?.[0]
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable'
    const { error } = await supabase.from('chit_members')
      .update({ portal_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', memberId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Switching access off must take effect NOW, not whenever a session expires.
    if (!enabled) await revokeAllSessions(user.id, memberId)
    return NextResponse.json({ ok: true, portal_enabled: enabled })
  }

  if (action === 'revoke') {
    const count = await revokeAllSessions(user.id, memberId)
    return NextResponse.json({ ok: true, revoked: count })
  }

  if (action === 'invite') {
    const result = await mintInvite(user.id, memberId)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const url = `${siteOrigin(req)}/m/enter?t=${result.token}`
    const firstName = String(member.name ?? '').trim().split(/\s+/)[0] || 'there'
    const message =
      `Hi ${firstName}, here is your private link to view your chit account — `
      + `your dues, payments and each month's auction result.\n\n${url}\n\n`
      + `This link works once and expires in ${INVITE_TTL_MINUTES} minutes, so please open it now. `
      + `Do not forward it to anyone.`

    return NextResponse.json({
      ok: true,
      url,
      whatsappUrl: buildWhatsAppUrl(member.phone, message),
      expiresAt: result.expiresAt,
      // Returned so the UI can warn when a member has no number on file.
      hasPhone: Boolean(member.phone),
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
