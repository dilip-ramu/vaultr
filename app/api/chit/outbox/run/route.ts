// "Send the waiting ones now."
//
// WHY THIS EXISTS
//
// The outbox is drained by a cron, and on Vercel's free plan a cron runs
// once a day. So a message queued for 6:30pm sits there until the morning
// run, which to anybody watching the screen looks like the app is broken.
//
// This is the button for that. You are already in the app, looking at the
// queue, so the drain runs in your own request and the rows go out in
// seconds. The daily cron stays as the sweep for when nobody is here.
//
// It only ever touches YOUR queue, and only rows that are already due — it
// cannot be used to fire something booked for next Tuesday.

import { NextResponse } from 'next/server'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainOutbox } from '@/lib/chit/outboxRunner'

export const maxDuration = 60

export async function POST() {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Messaging every member is not something a collector or a viewer does.
  if (!CAN.manageGroups(access.role)) {
    return NextResponse.json({ error: 'You do not have permission to message members.' }, { status: 403 })
  }

  const result = await drainOutbox(createAdminClient(), {
    userId: access.ownerId,
    // Enough to clear a chit's worth of welcomes in one press, few enough
    // that the request finishes inside the platform's minute. Anything left
    // over is still queued, so a second press carries on.
    limit: 40,
  })

  const note = result.considered === 0
    ? 'Nothing was waiting.'
    : result.ran === result.considered
      ? `Sent ${result.ran} of them.`
      : `Sent ${result.ran} of ${result.considered}. Press again for the rest.`

  return NextResponse.json({
    ok: true, considered: result.considered, ran: result.ran, note,
    notes: result.notes.slice(0, 20),
  })
}
