import { NextRequest, NextResponse } from 'next/server'
import { currentPortalSession } from '@/lib/chit/portal-session'
import { setPin } from '@/lib/chit/portal-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // The member is identified by their cookie. A member id in the body would be
  // an invitation to set somebody else's PIN, so the body carries only the PIN.
  const session = await currentPortalSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const pin = String(body?.pin ?? '')
  const result = await setPin(session.userId, session.memberId, pin)
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })
  return NextResponse.json({ ok: true })
}
