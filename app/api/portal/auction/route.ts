// Polled by the member's phone every few seconds while an auction is open.
//
// Polling, not a live database subscription: a subscription would mean handing
// the member a database key, and no member of this app holds one. A short poll
// against a route that already knows who they are is cheaper to reason about
// and cannot leak anything the page could not already see.

import { NextRequest, NextResponse } from 'next/server'
import { currentPortalSession } from '@/lib/chit/portal-session'
import { getLiveAuction } from '@/lib/chit/portal-data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await currentPortalSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const groupId = req.nextUrl.searchParams.get('groupId') ?? ''
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  // memberId is from the cookie; groupId is from the URL and is therefore
  // untrusted — getLiveAuction checks it against this member's own memberships.
  const auction = await getLiveAuction(session.memberId, groupId)
  return NextResponse.json({ auction })
}
