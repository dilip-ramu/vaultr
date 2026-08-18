import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET — the Lab's immutable decision journal, newest first.
 * ?symbol= filters to one security; ?limit= caps the page (default 200).
 * Read-only: there is no PATCH/DELETE here, and the database blocks UPDATE on
 * this table for every role.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lab } = await supabase.from('lab_accounts').select('id')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline', 'paused']).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ decisions: [] })

  const url = new URL(req.url)
  const symbol = url.searchParams.get('symbol')
  const kind = url.searchParams.get('kind')
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 200)))

  let q = supabase.from('lab_decisions').select('*').eq('lab_id', lab.id).eq('user_id', user.id)
  if (symbol) q = q.eq('symbol', symbol.toUpperCase())
  if (kind) q = q.eq('kind', kind)

  const { data, error } = await q.order('ts', { ascending: false }).limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ decisions: data ?? [] })
}
