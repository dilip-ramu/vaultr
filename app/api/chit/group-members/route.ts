import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET ?group_id= — members in a group, with the member joined in.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!groupId) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  const { data, error } = await supabase.from('chit_group_members')
    .select('*, member:chit_members(*)')
    .eq('user_id', user.id).eq('group_id', groupId)
    .order('slot_number', { nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

// POST { group_id, member_ids[] } — add members to a group in bulk.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const groupId = String(body.group_id ?? '')
  const memberIds = (body.member_ids as string[]) ?? []
  if (!groupId || memberIds.length === 0) return NextResponse.json({ error: 'group_id and member_ids required' }, { status: 400 })

  // Don't over-fill a group. If it has room for 20 and 18 are in, only 2 more go.
  const { data: group } = await supabase.from('chit_groups')
    .select('members').eq('id', groupId).eq('user_id', user.id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { data: existing } = await supabase.from('chit_group_members')
    .select('member_id, slot_number').eq('group_id', groupId).eq('user_id', user.id)
  const already = new Set((existing ?? []).map(e => e.member_id))
  const usedSlots = new Set((existing ?? []).map(e => e.slot_number).filter(Boolean))

  const room = group.members - (existing ?? []).length
  if (room <= 0) return NextResponse.json({ error: 'Group is already full' }, { status: 400 })

  const toAdd = memberIds.filter(id => !already.has(id)).slice(0, room)

  // Next free slot number.
  let slot = 1
  const nextSlot = () => { while (usedSlots.has(slot)) slot++; usedSlots.add(slot); return slot }

  const rows = toAdd.map(member_id => ({
    user_id: user.id, group_id: groupId, member_id, slot_number: nextSlot(),
  }))

  if (rows.length === 0) return NextResponse.json({ added: 0, skipped: memberIds.length })

  const { error } = await supabase.from('chit_group_members').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ added: rows.length, skipped: memberIds.length - rows.length })
}

// PATCH { id, slot_number } — set a member's seat number in the group.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const slot = body.slot_number == null || body.slot_number === '' ? null : Math.floor(Number(body.slot_number))
  if (slot != null && (!Number.isFinite(slot) || slot < 1)) {
    return NextResponse.json({ error: 'Slot must be a positive number' }, { status: 400 })
  }

  // Look up this row's group so we can check the slot isn't already taken by
  // SOMEONE ELSE — two members in the same seat is a data smell, not an edit.
  const { data: row } = await supabase.from('chit_group_members')
    .select('group_id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (slot != null) {
    const { data: clash } = await supabase.from('chit_group_members')
      .select('id').eq('group_id', row.group_id).eq('slot_number', slot).neq('id', id).maybeSingle()
    if (clash) return NextResponse.json({ error: `Slot ${slot} is already taken in this group.` }, { status: 409 })
  }

  const { data, error } = await supabase.from('chit_group_members')
    .update({ slot_number: slot }).eq('id', id).eq('user_id', user.id)
    .select('*, member:chit_members(*)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('chit_group_members').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
