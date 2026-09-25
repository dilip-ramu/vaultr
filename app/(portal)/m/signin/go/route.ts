// Checking a phone number and a PIN.
//
// Four digits is a weak secret. Three things make it acceptable here: checkPin
// locks the member out after a handful of wrong tries, the portal is read-only
// so nothing here can move money, and a member sees only their own rows because
// portal-data takes the member id from the session and never from the request.

import { NextRequest, NextResponse } from 'next/server'
import { signInWithPin, SESSION_COOKIE, SESSION_TTL_DAYS } from '@/lib/chit/portal-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const phone = String(form?.get('phone') ?? '').trim()
  const pin = String(form?.get('pin') ?? '').trim()

  if (!phone || !pin) return back(req, 'Enter your phone number and your PIN.')

  const result = await signInWithPin(phone, pin, {
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  })
  if ('error' in result) return back(req, result.error)

  const res = NextResponse.redirect(new URL(result.hasPin ? '/m' : '/m/pin', req.url), 303)
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  })
  return res
}

/** Back to the form with the reason showing. 303 so the browser GETs it. */
function back(req: NextRequest, message: string): NextResponse {
  const url = new URL('/m/signin', req.url)
  url.searchParams.set('e', message)
  return NextResponse.redirect(url, 303)
}
