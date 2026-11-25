// The outbox on a timer.
//
// The sending itself is lib/chit/outboxRunner.ts, shared with the screens
// that add a member — a welcome that waits for a cron is not a welcome. This
// route is the sweep: anything queued for a date, and anything an add failed
// to send because the app was closed before it finished.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { drainOutbox } from '@/lib/chit/outboxRunner'

// Sending fifty messages one after another takes longer than the ten seconds
// a function gets by default. An outside pinger (cron-job.org) also hangs up
// at thirty seconds — the run carries on here regardless, and any row it did
// not reach is still queued for the next knock.
export const maxDuration = 60

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET

  // Two ways in, because outside schedulers differ and the header is the
  // part people get wrong (a missing space after "Bearer" and it is a 401):
  //
  //   Authorization: Bearer <secret>     - what Vercel's own cron sends
  //   ...?key=<secret>                   - for a scheduler set up in a hurry
  //
  // The key in the address is a little more exposed than a header, since it
  // sits in the scheduler's logs. It opens nothing but this: sending what
  // you already queued. It cannot read a member, write a row or queue a new
  // message.
  const auth = req.headers.get('authorization')
  const key = req.nextUrl.searchParams.get('key')
  const allowed = Boolean(secret) && (auth === `Bearer ${secret}` || key === secret)
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await drainOutbox(adminClient())
  return NextResponse.json({
    ok: true,
    considered: result.considered,
    ran: result.ran,
    notes: result.notes.slice(0, 20),
  })
}
