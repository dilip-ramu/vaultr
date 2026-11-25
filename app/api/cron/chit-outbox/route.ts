// The outbox on a timer.
//
// The sending itself is lib/chit/outboxRunner.ts, shared with the screens
// that add a member — a welcome that waits for a cron is not a welcome. This
// route is the sweep: anything queued for a date, and anything an add failed
// to send because the app was closed before it finished.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { drainOutbox } from '@/lib/chit/outboxRunner'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
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
