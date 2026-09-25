// Owner-only control of member portal access.
//
// Three actions, all requiring the FOREMAN's own app session:
//   enable / disable — turn portal access on or off for one member
//   invite           — mint a one-time login link and return a wa.me URL
//   revoke           — sign out every phone that member is signed in on
//
// The member id always arrives with `.eq('user_id', owner)` attached, so one
// account can never reach into another account's chit.

import { NextRequest, NextResponse } from 'next/server'
import { resolveSiteOrigin, originSource } from '@/lib/siteOrigin'
import { memberInviteMessage, durationWords } from '@/lib/chit/handover'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, ledgerClient, CAN, forbidden } from '@/lib/chit/access'
import { mintInvite, revokeAllSessions, INVITE_TTL_MINUTES } from '@/lib/chit/portal-auth'
import { buildWhatsAppUrl } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

/**
 * The address to put in the member's link.
 *
 * This matters more than it looks. `req.nextUrl.origin` is the obvious choice
 * and it is WRONG behind a proxy: on Vercel the internal request often carries
 * a localhost origin, which produces a link that works on the machine that
 * generated it and nowhere else. The forwarded headers are what the browser
 * actually asked for, so they come first after an explicit setting.
 */
const siteOrigin = (req: NextRequest) => resolveSiteOrigin(req.headers, req.nextUrl.origin)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  // Whose chit books are we in? The owner, or a staff member they granted
  // chit-only access to. Everything below filters on access.ownerId, never on
  // the signed-in user — they are the same person only when the owner works.
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const owner = access.ownerId
  if (!CAN.manageMembers(access.role)) {
    return NextResponse.json({ error: forbidden('manage member portal access', access.role) }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const memberId = String(body?.memberId ?? '')
  if (!memberId) return NextResponse.json({ error: 'memberId is required' }, { status: 400 })

  const { data: rows } = await supabase.from('chit_members')
    .select('id, name, phone, portal_enabled')
    .eq('id', memberId).eq('user_id', owner).limit(1)
  const member = rows?.[0]
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable'
    const { error } = await supabase.from('chit_members')
      .update({ portal_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', memberId).eq('user_id', owner)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Switching access off must take effect NOW, not whenever a session expires.
    if (!enabled) await revokeAllSessions(owner, memberId)
    return NextResponse.json({ ok: true, portal_enabled: enabled })
  }

  if (action === 'revoke') {
    const count = await revokeAllSessions(owner, memberId)
    return NextResponse.json({ ok: true, revoked: count })
  }

  if (action === 'invite') {
    const result = await mintInvite(owner, memberId)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const url = `${siteOrigin(req)}/m/enter?t=${result.token}`
    const message = memberInviteMessage({
      name: member.name ?? null,
      url,
      expiresInWords: durationWords(INVITE_TTL_MINUTES),
    })

    return NextResponse.json({
      ok: true,
      url,
      whatsappUrl: buildWhatsAppUrl(member.phone, message),
      expiresAt: result.expiresAt,
      // Returned so the UI can warn when a member has no number on file.
      hasPhone: Boolean(member.phone),
      memberName: member.name,
      // Shown in the UI so the address in the link is never a mystery. If it
      // says localhost, or a preview deployment, that is visible immediately
      // instead of after a member reports that the link did not work.
      origin: siteOrigin(req),
      originSource: originSource(),
      message,
      expiresInWords: durationWords(INVITE_TTL_MINUTES),
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
