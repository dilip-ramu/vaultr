// A staff member setting their own password for the first time.
//
// Supabase's updateUser changes the password of whoever is signed in, so the
// session is the authority here — there is no user id in the body to get wrong.
// Clearing must_change_password needs the service role, because a staff member
// cannot write their own grant row (by design: otherwise they could promote
// themselves).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveChitAccess } from '@/lib/chit/access'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { password } = await req.json().catch(() => ({ password: '' }))
  const pw = String(password ?? '')
  if (pw.length < 10) return NextResponse.json({ error: 'Use at least 10 characters.' }, { status: 400 })
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) {
    return NextResponse.json({ error: 'Use letters and at least one number.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: pw })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (!access.isOwner) {
    await createAdminClient().from('chit_staff')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('staff_user_id', access.actorId).eq('owner_user_id', access.ownerId)
  }
  return NextResponse.json({ ok: true })
}
