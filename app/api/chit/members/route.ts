import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/chit/types'

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

  const row = {
    user_id: user.id,
    name,
    phone,
    address: (body.address as string)?.trim() || null,
    aadhaar: (body.aadhaar as string)?.trim() || null,
    pan: (body.pan as string)?.trim() || null,
    nominees: body.nominees ?? [],
    reference_contacts: body.reference_contacts ?? [],
    guarantors: body.guarantors ?? [],
    securities: body.securities ?? [],
    notes: (body.notes as string)?.trim() || null,
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
  if ('phone' in body) patch.phone = normalizePhone(body.phone as string) || null

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
