import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeSymbol } from '@/lib/investments/analyzeCore'
import { analyzePortfolio } from '@/lib/investments/portfolio'
import { makeCachedFundamentalsLoader } from '@/lib/investments/lab/research-cache'
import { resolveConstraints } from '@/lib/investments/lab/config'
import { createBudget, ROUTE_MAX_MS } from '@/lib/investments/deadline'
import type { Exchange, RegimeState, ThesisStatus } from '@/lib/investments/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Analyse one security and record the recommendation.
 *
 * RELIABILITY (Deploy #4). This route used to pass NO deadline at all: two
 * sequential Anthropic web-search calls ran until the platform killed the
 * request at 60s, and the browser got a bare 504 — no result, no reason, and no
 * way to tell a slow provider from a broken key. Now:
 *
 *   • A budget is computed from the route's own wall and handed to every
 *     upstream call, so nothing can outlive the request.
 *   • Fundamentals come from the shared research cache, so analysing the same
 *     name twice costs ONE call instead of two.
 *   • If the work cannot finish in time, the response is a normal 200 carrying
 *     a structured, honest result. No recommendation is written, the holding's
 *     thesis status is untouched, and nothing is recorded as INSUFFICIENT_DATA.
 *
 * Running out of time is not a view about the company.
 */
export async function POST(req: NextRequest) {
  const budget = createBudget({ totalMs: ROUTE_MAX_MS })
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

  // The same cache the Lab uses. A name researched inside the TTL skips the
  // fundamentals call entirely, which is usually the difference between
  // finishing inside the request and not.
  const ttlHours = resolveConstraints({}).fundamentals_ttl_hours
  const loadFundamentals = makeCachedFundamentalsLoader({ supabase, userId: user.id, ttlHours })

  const outcome = await analyzeSymbol({
    symbol, exchange, companyName, isHolding, portfolio: summary, regimeState,
    loadFundamentals, persistsFundamentals: true, budget,
  })

  if (!outcome.ok) {
    const f = outcome.failure
    // Names and durations only — no prompts, no keys.
    console.info('[investments/analyze] incomplete', {
      symbol, exchange, kind: f.kind, stage: f.stage,
      progressSaved: f.progressSaved, timings: f.timings, elapsedMs: budget.elapsed(),
    })
    return NextResponse.json({
      ok: false,
      status: f.retryable ? 'incomplete' : 'failed',
      reason: f.kind,
      stage: f.stage,
      message: f.message,
      progressSaved: f.progressSaved,
      // Say plainly what did NOT happen, so nothing is inferred from silence.
      recorded: false,
      note: 'No investment conclusion was recorded. This is a research or timing failure, not a judgement about the company.',
      timings: f.timings,
      elapsedMs: budget.elapsed(),
    })
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

  console.info('[investments/analyze] complete', {
    symbol, exchange, action: recommendation.action,
    cached: outcome.fundamentalsCached, timings: outcome.timings, elapsedMs: budget.elapsed(),
  })

  return NextResponse.json({
    ok: true,
    recommendation: recRow,
    breakdown: recommendation.score_breakdown,
    fundamentalsCached: outcome.fundamentalsCached,
    timings: outcome.timings,
    elapsedMs: budget.elapsed(),
  })
}
