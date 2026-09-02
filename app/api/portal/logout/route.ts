import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revokeSession, SESSION_COOKIE } from '@/lib/chit/portal-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  // Revoke server-side as well as clearing the cookie: a cookie the member
  // copied elsewhere must stop working too.
  if (token) await revokeSession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
