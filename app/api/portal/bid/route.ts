// The only write a member can make.

import { NextRequest, NextResponse } from 'next/server'
import { currentPortalSession } from '@/lib/chit/portal-session'
import { placeBid } from '@/lib/chit/portal-bids'
import { getLiveAuction } from '@/lib/chit/portal-data'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await currentPortalSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const groupId = String(body?.groupId ?? '')
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const result = await placeBid({
    // Never from the body. The member is whoever the cookie says.
    memberId: session.memberId,
    sessionId: session.sessionId,
    groupId,
    amount: body?.amount,
    pin: String(body?.pin ?? ''),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.message, reason: result.reason }, { status: 400 })
  }

  // Hand back the fresh state so the phone updates without waiting for its
  // next poll — in an open auction a second of staleness is a second of
  // someone thinking they are still leading when they are not.
  const auction = await getLiveAuction(session.memberId, groupId)
  return NextResponse.json({ ok: true, amount: result.amount, youAreLeading: result.youAreLeading, auction })
}
