// Spending the invite. POST only.
//
// A GET could be fired by a link preview, a prefetch, an antivirus scanner or a
// corporate mail gateway, and each of those would burn a single-use token on
// behalf of a member who never saw it. None of them POST. So this is the only
// door, and the button on the landing page is the only thing that knocks.

import { NextRequest, NextResponse } from 'next/server'
import { redeemInvite, SESSION_COOKIE, SESSION_TTL_DAYS } from '@/lib/chit/portal-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const token = String(form?.get('t') ?? '')
  if (!token) return seeOther(req, '/m/closed')

  const result = await redeemInvite(token, {
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  })

  if ('error' in result) {
    return seeOther(req, `/m/closed?why=${encodeURIComponent(result.error)}`)
  }

  // A member with no PIN sets one now, while they are here and onboarding,
  // rather than in the middle of an auction later.
  const res = seeOther(req, result.hasPin ? '/m' : '/m/pin')
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  })
  return res
}

/**
 * 303, not the default 307.
 *
 * A 307 preserves the method, so the browser would POST again to the page it
 * lands on and get a 405. 303 is the redirect that says "now go and GET this
 * instead", which is exactly what a form submission needs.
 */
function seeOther(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), 303)
}
