import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/chit/types'
import { checkMemberCode, nextMemberCode, normalizeMemberCode } from '@/lib/chit/memberCode'

/** Every code already in use, so a clash is refused with a useful message
 *  rather than a database error nobody can act on. */
async function codeIndex(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string,
): Promise<{ taken: Map<string, string>; all: (string | null)[] }> {
  const { data } = await supabase.from('chit_members')
    .select('id, member_code').eq('user_id', userId)
  const taken = new Map<string, string>()
  const all: (string | null)[] = []
  for (const r of (data ?? []) as { id: string; member_code: string | null }[]) {
    all.push(r.member_code)
    const c = normalizeMemberCode(r.member_code)
    if (c) taken.set(c, r.id)
  }
  return { taken, all }
}

const PROFILE_FIELDS = [
  'bank_name', 'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_branch',
] as const

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s : null
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('chit_members')
    .select('*').eq('user_id', user.id).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const phone = normalizePhone(body.phone as string) || null

  // Same person, entered twice, is one person — phone is the natural key. Warn,
  // don't silently merge: the caller decides whether it's really a duplicate.
  if (phone) {
    const { data: dupe } = await supabase.from('chit_members')
      .select('id, name').eq('user_id', user.id).eq('phone', phone).maybeSingle()
    if (dupe && body.force !== true) {
      return NextResponse.json({ error: `A member with this phone already exists: ${dupe.name}`, duplicate: dupe }, { status: 409 })
    }
  }

  const { taken, all } = await codeIndex(supabase, user.id)
  // A typed code is checked; a blank one is issued from the sequence, so every
  // member has a number without anyone having to remember the next one.
  const codeCheck = checkMemberCode(body.member_code as string, taken)
  if (!codeCheck.ok) return NextResponse.json({ error: codeCheck.reason }, { status: 400 })
  const memberCode = codeCheck.code ?? nextMemberCode(all)

  const row = {
    user_id: user.id,
    member_code: memberCode,
    name,
    phone,
    dial_code: (body.dial_code as string)?.replace(/\D/g, '') || '91',
    address: (body.address as string)?.trim() || null,
    aadhaar: (body.aadhaar as string)?.trim() || null,
    pan: (body.pan as string)?.trim() || null,
    nominees: body.nominees ?? [],
    reference_contacts: body.reference_contacts ?? [],
    guarantors: body.guarantors ?? [],
    securities: body.securities ?? [],
    notes: (body.notes as string)?.trim() || null,
    referred_by_member_id: text(body.referred_by_member_id),
    ...Object.fromEntries(PROFILE_FIELDS.map(f => [f, text(body[f])])),
  }

  const { data, error } = await supabase.from('chit_members').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['name', 'address', 'aadhaar', 'pan', 'notes', 'is_active',
    'nominees', 'reference_contacts', 'guarantors', 'securities'] as const) {
    if (k in body) patch[k] = body[k]
  }
  for (const k of PROFILE_FIELDS) {
    if (k in body) patch[k] = text(body[k])
  }
  if ('referred_by_member_id' in body) {
    const ref = text(body.referred_by_member_id)
    // Self-reference is refused here as well as by the CHECK constraint, so the
    // message is one a person can read.
    if (ref && ref === id) {
      return NextResponse.json({ error: 'A member cannot be their own reference.' }, { status: 400 })
    }
    patch.referred_by_member_id = ref
  }
  if ('member_code' in body) {
    const { taken } = await codeIndex(supabase, user.id)
    const check = checkMemberCode(body.member_code as string, taken, id)
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })
    patch.member_code = check.code
  }
  if ('phone' in body) patch.phone = normalizePhone(body.phone as string) || null
  if ('dial_code' in body) patch.dial_code = (body.dial_code as string)?.replace(/\D/g, '') || '91'

  const { data, error } = await supabase.from('chit_members')
    .update(patch).eq('id', id).eq('user_id', user.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('chit_members').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
