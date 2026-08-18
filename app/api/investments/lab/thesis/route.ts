import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET ?symbol=&exchange= — the latest STORED reasoning for one security.
 *
 * Returns the most recent decision that actually carries a thesis (a buy, add,
 * hold, reduce or exit), plus the decisions that came before it, plus that
 * security's trades. Nothing is generated here: if the Lab has never analysed
 * the name, the response says so rather than inventing a view.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase()
  const exchange = url.searchParams.get('exchange') === 'BSE' ? 'BSE' : 'NSE'
  if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 })

  const { data: lab } = await supabase.from('lab_accounts').select('id')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline', 'paused']).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ thesis: null, history: [], trades: [] })

  const [{ data: decisions }, { data: trades }] = await Promise.all([
    supabase.from('lab_decisions').select('*')
      .eq('lab_id', lab.id).eq('user_id', user.id).eq('symbol', symbol).eq('exchange', exchange)
      .order('ts', { ascending: false }).limit(50),
    supabase.from('lab_trades').select('*')
      .eq('lab_id', lab.id).eq('user_id', user.id).eq('symbol', symbol).eq('exchange', exchange)
      .order('ts', { ascending: false }).limit(50),
  ])

  const all = decisions ?? []
  // A deferral records why nothing happened — it is not a thesis.
  const thesis = all.find(d => d.kind !== 'deferred' && (d.base_case || d.bull_case || d.reason)) ?? null

  return NextResponse.json({ thesis, history: all, trades: trades ?? [] })
}
