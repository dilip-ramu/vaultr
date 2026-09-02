// The WhatsApp link lands here.
//
// A GET that changes state is normally a mistake, but this is the one case
// where it is correct: the whole point is that tapping a link in WhatsApp signs
// you in. It is safe because the token is single-use and dies on first touch —
// a prefetch or a link preview burns it, which is the failing-safe direction.

import { NextRequest, NextResponse } from 'next/server'
import { redeemInvite, SESSION_COOKIE, SESSION_TTL_DAYS } from '@/lib/chit/portal-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  if (!token) return NextResponse.redirect(new URL('/m/closed', req.url))

  const result = await redeemInvite(token, {
    userAgent: req.headers.get('user-agent'),
    // Vercel sets this. Recorded as evidence for a disputed action later.
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  })

  if ('error' in result) {
    const url = new URL('/m/closed', req.url)
    url.searchParams.set('why', result.error)
    return NextResponse.redirect(url)
  }

  // A member who has not set a PIN is sent to set one now, while they are
  // onboarding, rather than in the middle of an auction later.
  const res = NextResponse.redirect(new URL(result.hasPin ? '/m' : '/m/pin', req.url))
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,                 // page scripts cannot read it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  })
  return res
}
