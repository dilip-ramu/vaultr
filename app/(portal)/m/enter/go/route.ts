// Opening the portal from a permanent link. POST only.
//
// A GET here could be fired by a link preview, a prefetch, a virus scanner or a
// mail gateway. None of them POST, so none of them can start a session.

import { NextRequest, NextResponse } from 'next/server'
import { openWithToken, SESSION_COOKIE, SESSION_TTL_DAYS } from '@/lib/chit/portal-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const token = String(form?.get('t') ?? '')
  const pin = String(form?.get('pin') ?? '').trim() || null
  if (!token) return seeOther(req, '/m/closed')

  const result = await openWithToken(token, pin, {
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  })

  if ('error' in result) {
    // A wrong PIN sends them back to their own link, not to a dead end — the
    // link is still good, only the four digits were wrong.
    if (result.needsPin) {
      const url = new URL('/m/enter', req.url)
      url.searchParams.set('t', token)
      url.searchParams.set('e', result.error)
      return NextResponse.redirect(url, 303)
    }
    return seeOther(req, `/m/closed?why=${encodeURIComponent(result.error)}`)
  }

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

/** 303, not the default 307: a 307 would make the browser re-POST the page it
 *  lands on. 303 says "now go and GET this instead". */
function seeOther(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), 303)
}
