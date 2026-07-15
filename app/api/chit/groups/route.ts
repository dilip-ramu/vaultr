import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateGroup } from '@/lib/chit/auction'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('chit_groups')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ groups: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const params = {
    chitValue: Number(body.chit_value),
    members: Number(body.members),
    commissionPct: Number(body.commission_pct ?? 5),
    bidCeilingPct: Number(body.bid_ceiling_pct ?? 30),
    model: body.commission_model as 'MONTHLY' | 'UPFRONT',
  }
  const check = validateGroup(params)
  if (!check.ok) return NextResponse.json({ error: check.errors[0] }, { status: 400 })
  if (!String(body.name ?? '').trim()) return NextResponse.json({ error: 'Name the group' }, { status: 400 })

  const row = {
    user_id: user.id,
    company_id: (body.company_id as string) || null,
    name: String(body.name).trim(),
    chit_value: params.chitValue,
    members: Math.floor(params.members),
    commission_pct: params.commissionPct,
    bid_ceiling_pct: params.bidCeilingPct,
    commission_model: params.model,
    auction_day: body.auction_day ? Number(body.auction_day) : null,
    start_date: (body.start_date as string) || null,
  }

  const { data, error } = await supabase.from('chit_groups').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
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
  for (const k of ['name', 'company_id', 'commission_pct', 'bid_ceiling_pct',
    'auction_day', 'start_date', 'status'] as const) {
    if (k in body) patch[k] = body[k]
  }

  const { data, error } = await supabase.from('chit_groups')
    .update(patch).eq('id', id).eq('user_id', user.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Cascade is defined on the FKs, so members/auctions/collections for this group
  // go with it. The posted transactions do NOT — they're real money that
  // happened, and deleting a group shouldn't rewrite your bank history.
  const { error } = await supabase.from('chit_groups').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
