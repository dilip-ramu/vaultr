import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzePortfolio } from '@/lib/investments/portfolio'

export const dynamic = 'force-dynamic'

// GET /api/investments/portfolio — holdings + computed analytics + latest regime + open alerts.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: holdings }, { data: regime }, { data: alerts }] = await Promise.all([
    supabase.from('inv_holdings').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    supabase.from('inv_market_regime').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
    supabase.from('inv_alerts').select('*').eq('user_id', user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(20),
  ])

  const summary = analyzePortfolio((holdings ?? []).map(h => ({
    symbol: h.symbol, exchange: h.exchange, quantity: Number(h.quantity), avg_cost: Number(h.avg_cost),
    last_price: h.last_price != null ? Number(h.last_price) : null, sector: h.sector, market_cap_band: h.market_cap_band,
  })))

  return NextResponse.json({ holdings: holdings ?? [], summary, regime: regime?.[0] ?? null, alerts: alerts ?? [] })
}
