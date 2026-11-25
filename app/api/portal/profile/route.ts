// A member correcting their own record.
//
// The member is identified by their COOKIE, never by anything in the body: a
// member id in a request would be an invitation to edit somebody else's
// details. The same rule as the PIN route next door.
//
// What may be changed, and why the rest may not, is in
// lib/chit/memberProfile.ts. Every real change is recorded with what it was
// before — a bank account changed days before a payout is the thing that must
// not be quiet.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { currentPortalSession } from '@/lib/chit/portal-session'
import {
  profileProblems, normalizePatch, changedFields, changeWords, EDITABLE_FIELDS,
  type ProfilePatch,
} from '@/lib/chit/memberProfile'

export const dynamic = 'force-dynamic'

// Members hold no database key of their own, so the portal reads and writes
// through the service role — scoped here, to this member's row, and nowhere
// else. Same model as the rest of the portal (v115).
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const session = await currentPortalSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patch: ProfilePatch = {}
  for (const field of EDITABLE_FIELDS) {
    if (typeof body?.[field] === 'string') patch[field] = body[field]
  }

  const problems = profileProblems(patch)
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0].message, problems }, { status: 400 })
  }

  const db = admin()
  const { data: before } = await db.from('chit_members')
    .select('id, address, aadhaar, pan, bank_name, bank_account_name, bank_account_number, bank_ifsc, bank_branch')
    .eq('id', session.memberId).eq('user_id', session.userId).maybeSingle()

  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const changes = changedFields(before as Record<string, unknown>, patch)
  if (changes.length === 0) return NextResponse.json({ ok: true, note: 'Nothing changed.' })

  const { error } = await db.from('chit_members')
    .update({ ...normalizePatch(patch), updated_at: new Date().toISOString() })
    .eq('id', session.memberId).eq('user_id', session.userId)
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })

  // The record, written after the change succeeded so it never claims
  // something that did not happen.
  await db.from('chit_member_changes').insert(changes.map(c => ({
    user_id: session.userId,
    member_id: session.memberId,
    field: c.field,
    old_value: c.from || null,
    new_value: c.to || null,
    sensitive: c.sensitive,
    changed_by: 'member',
  })))

  return NextResponse.json({ ok: true, note: changeWords(changes), changed: changes.length })
}
