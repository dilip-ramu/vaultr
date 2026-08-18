import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMarketRegime } from '@/lib/investments/providers/macro'

export const dynamic = 'force-dynamic'

// GET — latest stored regime.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase
    .from('inv_market_regime').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1)
  return NextResponse.json({ regime: data?.[0] ?? null })
}

// POST — research a fresh assessment and store it (append-only history).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { regime, error } = await getMarketRegime()
  if (!regime) return NextResponse.json({ error: error || 'Could not assess regime' }, { status: 502 })

  const { data, error: ierr } = await supabase.from('inv_market_regime').insert({
    user_id: user.id,
    as_of: regime.as_of,
    state: regime.state,
    summary: regime.summary,
    reasons: regime.reasons,
    drivers: regime.drivers,
    sources: regime.sources,
  }).select('*').single()
  if (ierr) return NextResponse.json({ error: ierr.message }, { status: 500 })
  return NextResponse.json({ regime: data })
}
