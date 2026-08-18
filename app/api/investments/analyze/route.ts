import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeSymbol } from '@/lib/investments/analyzeCore'
import { analyzePortfolio } from '@/lib/investments/portfolio'
import type { Exchange, RegimeState, ThesisStatus } from '@/lib/investments/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Thin wrapper over analyzeSymbol (lib/investments/analyzeCore): load the real
// portfolio + regime, analyse, then persist to the real-portfolio tables.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const symbol = String(body.symbol ?? '').trim().toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
  const exchange = (body.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange
  const companyName = (body.company_name as string) ?? null

  const [regimeRow, holdingsRes] = await Promise.all([
    supabase.from('inv_market_regime').select('state').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
    supabase.from('inv_holdings').select('*').eq('user_id', user.id),
  ])
  const regimeState = (regimeRow.data?.[0]?.state as RegimeState) ?? 'neutral'
  const holdings = holdingsRes.data ?? []
  const held = holdings.find(h => h.symbol.toUpperCase() === symbol && h.exchange === exchange)
  const isHolding = Boolean(body.is_holding ?? held)

  const summary = analyzePortfolio(holdings.map(h => ({
    symbol: h.symbol, exchange: h.exchange, quantity: Number(h.quantity), avg_cost: Number(h.avg_cost),
    last_price: h.last_price != null ? Number(h.last_price) : null, sector: h.sector, market_cap_band: h.market_cap_band,
  })))

  const outcome = await analyzeSymbol({
    symbol, exchange, companyName, isHolding, portfolio: summary, regimeState,
  })

  // A research TRANSPORT failure is not a view about the company. Report it as
  // an upstream problem instead of writing "insufficient data" into the
  // permanent journal (correctness pass, item 9).
  if (!outcome.ok) {
    return NextResponse.json({
      error: `Could not complete the analysis: ${outcome.failure.message}`,
      failure: { kind: outcome.failure.kind, stage: outcome.failure.stage, retryable: outcome.failure.retryable },
    }, { status: outcome.failure.kind === 'RATE_LIMITED' ? 429 : 503 })
  }
  const { recommendation, decision, fundamentals } = outcome

  const { data: recRow, error: recErr } = await supabase
    .from('inv_recommendations').insert({ ...recommendation, user_id: user.id }).select('*').single()
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  await supabase.from('inv_securities').upsert({
    user_id: user.id, symbol, exchange,
    company_name: recommendation.company_name, sector: fundamentals.sector, market_cap_band: fundamentals.market_cap_band,
    fundamentals: fundamentals.fundamentals, valuation: fundamentals.valuation,
    data_confidence: fundamentals.data_confidence, sources: recommendation.sources,
    fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,symbol,exchange' })

  if (held) {
    const thesis_status: ThesisStatus =
      decision.action === 'INSUFFICIENT_DATA' ? held.thesis_status
      : recommendation.invalidation.length && (decision.action === 'SELL' || decision.action === 'AVOID') ? 'invalidated'
      : (decision.action === 'REDUCE' || decision.action === 'SELL') ? 'deteriorating'
      : (decision.wait || decision.concentration_flag) ? 'watch'
      : 'intact'
    await supabase.from('inv_holdings')
      .update({ ai_rating: decision.action, thesis_status, sector: held.sector ?? fundamentals.sector, market_cap_band: held.market_cap_band ?? fundamentals.market_cap_band, updated_at: new Date().toISOString() })
      .eq('id', held.id).eq('user_id', user.id)
  }

  return NextResponse.json({ recommendation: recRow, breakdown: recommendation.score_breakdown })
}
