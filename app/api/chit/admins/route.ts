// Chit admins: who may sign in to your chit module. OWNER ONLY.
//
// You create the login and hand over the password, which is what you asked for.
// It is the weaker of the two options — you know their password until they
// change it — so the account is created with `must_change_password`, and the
// app makes them set their own before it lets them do anything. That closes the
// window without adding an email provider to the picture.
//
// Creating an auth user needs the service role. It is used HERE and only here,
// after confirming the caller is the owner of their own account.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveChitAccess, CAN, forbidden, type ChitRole } from '@/lib/chit/access'

export const dynamic = 'force-dynamic'

const ROLES: ChitRole[] = ['partner', 'collector', 'viewer']

/** Weak passwords are refused here rather than at first sign-in, when the
 *  person who has to fix it is no longer the person who chose it. */
function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.'
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number.'
  if (/^(password|welcome|chit|inex)/i.test(pw)) return 'That is too easy to guess.'
  return null
}

export async function GET() {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.manageAdmins(access.role)) {
    return NextResponse.json({ error: forbidden('manage admin logins', access.role) }, { status: 403 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('chit_admins')
    .select('id, name, email, role, is_active, must_change_password, last_seen_at, created_at')
    .eq('owner_user_id', access.ownerId).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ admins: data ?? [] })
}

export async function POST(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.manageAdmins(access.role)) {
    return NextResponse.json({ error: forbidden('manage admin logins', access.role) }, { status: 403 })
  }

  const b = await req.json().catch(() => ({}))
  const email = String(b?.email ?? '').trim().toLowerCase()
  const password = String(b?.password ?? '')
  const name = String(b?.name ?? '').trim() || null
  const role = (ROLES.includes(b?.role) ? b.role : 'partner') as ChitRole

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 })
  }
  const pwProblem = passwordProblem(password)
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 })

  const admin = createAdminClient()

  // Refuse to hand someone access to their own account's data as an "admin".
  const { data: me } = await (await createClient()).auth.getUser()
  if (me?.user?.email?.toLowerCase() === email) {
    return NextResponse.json({ error: 'That is your own login.' }, { status: 400 })
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password,
    email_confirm: true,        // no inbox needed: you are handing this over in person
    user_metadata: { full_name: name, chit_admin_for: access.ownerId },
  })

  let adminUserId = created?.user?.id ?? null
  if (createErr) {
    // Already registered — grant access to the existing account rather than
    // refusing, but never reveal anything about an account you do not own.
    const { data: list } = await admin.auth.admin.listUsers()
    const hit = list?.users?.find(u => u.email?.toLowerCase() === email)
    if (!hit) return NextResponse.json({ error: createErr.message }, { status: 400 })
    adminUserId = hit.id
  }
  if (!adminUserId) return NextResponse.json({ error: 'Could not create that login.' }, { status: 500 })

  const { data, error } = await admin.from('chit_admins').upsert({
    owner_user_id: access.ownerId, admin_user_id: adminUserId,
    name, email, role, is_active: true, must_change_password: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_user_id,admin_user_id' }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ admin: data })
}

export async function PATCH(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.manageAdmins(access.role)) {
    return NextResponse.json({ error: forbidden('manage admin logins', access.role) }, { status: 403 })
  }

  const b = await req.json().catch(() => ({}))
  const id = String(b?.id ?? '')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = await createClient()
  const { data: row } = await supabase.from('chit_admins')
    .select('id, admin_user_id').eq('id', id).eq('owner_user_id', access.ownerId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Resetting a password: set a new one and require it to be changed again.
  if (typeof b?.password === 'string' && b.password.length) {
    const problem = passwordProblem(b.password)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(row.admin_user_id, { password: b.password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('chit_admins').update({ must_change_password: true }).eq('id', id)
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (ROLES.includes(b?.role)) patch.role = b.role
  if (typeof b?.is_active === 'boolean') patch.is_active = b.is_active
  if (typeof b?.name === 'string') patch.name = b.name.trim() || null

  const { data, error } = await supabase.from('chit_admins')
    .update(patch).eq('id', id).eq('owner_user_id', access.ownerId).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ admin: data })
}

export async function DELETE(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN.manageAdmins(access.role)) {
    return NextResponse.json({ error: forbidden('manage admin logins', access.role) }, { status: 403 })
  }
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // The GRANT is removed; the login itself is left alone. Deleting someone's
  // account from here would be a surprising amount of power for a button
  // labelled "remove from chit".
  const supabase = await createClient()
  const { error } = await supabase.from('chit_admins')
    .delete().eq('id', id).eq('owner_user_id', access.ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
