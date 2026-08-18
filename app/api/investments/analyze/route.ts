import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchPrice } from '@/lib/investments/providers/price'
import { getFundamentals } from '@/lib/investments/providers/fundamentals'
import { researchJson } from '@/lib/investments/claude'
import { scoreSecurity } from '@/lib/investments/scoring'
import { decide } from '@/lib/investments/recommend'
import { analyzePortfolio } from '@/lib/investments/portfolio'
import type { Exchange, RegimeState, Source, ThesisStatus } from '@/lib/investments/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // research can be slow; 60s is the safe ceiling across Vercel plans

// The AI research step returns qualitative judgement + narrative. The NUMBERS
// (fundamentals) and the DECISION (score → action, portfolio-awareness) are
// handled deterministically elsewhere; this call supplies what only judgement
// can: the cases, the fair value, and the invalidation conditions.
interface Analysis {
  qualitative?: {
    business_quality?: number; management?: number; industry?: number
    moat?: number; macro_sensitivity?: number; geopolitical_risk?: number
  }
  fair_value_low?: number | null
  fair_value_high?: number | null
  entry_low?: number | null
  entry_high?: number | null
  horizon?: string | null
  bull_case?: string | null
  base_case?: string | null
  bear_case?: string | null
  catalysts?: string[]
  risks?: string[]
  invalidation?: string[]
  why_now?: string | null
  thesis_invalidated?: boolean
}

const ANALYSIS_SYSTEM = `You are a disciplined, sceptical equity analyst for Indian listed companies.
Present BOTH bull and bear cases. Avoid FOMO, hype, and price-chasing. Never claim a stock "will" go up — speak in risk/reward and probabilities. Distinguish price decline from business deterioration, and company quality from valuation. State uncertainty explicitly. Base everything on evidence and cite sources. Score qualitative factors 0-100 conservatively; if you cannot judge one, omit it.`

const num = (x: unknown): number | null => (x == null || !Number.isFinite(Number(x)) ? null : Number(x))
const arr = (x: unknown): string[] => Array.isArray(x) ? x.filter(v => typeof v === 'string') : []

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const symbol = String(body.symbol ?? '').trim().toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
  const exchange = (body.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange
  const companyName = (body.company_name as string) ?? null

  // 1. Live price, current fundamentals, latest regime, and the portfolio ------
  const [quote, fundamentals, regimeRow, holdingsRes] = await Promise.all([
    fetchPrice(symbol, exchange),
    getFundamentals({ symbol, exchange, companyName }),
    supabase.from('inv_market_regime').select('state').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
    supabase.from('inv_holdings').select('*').eq('user_id', user.id),
  ])
  const currentPrice = quote?.price ?? null
  const regimeState = (regimeRow.data?.[0]?.state as RegimeState) ?? 'neutral'
  const holdings = holdingsRes.data ?? []
  const held = holdings.find(h => h.symbol.toUpperCase() === symbol && h.exchange === exchange)
  const isHolding = Boolean(body.is_holding ?? held)

  const summary = analyzePortfolio(holdings.map(h => ({
    symbol: h.symbol, exchange: h.exchange, quantity: Number(h.quantity), avg_cost: Number(h.avg_cost),
    last_price: h.last_price != null ? Number(h.last_price) : null, sector: h.sector, market_cap_band: h.market_cap_band,
  })))

  // 2. Qualitative judgement + narrative (grounded, cited) ---------------------
  const factSummary = JSON.stringify({ fundamentals: fundamentals.fundamentals, valuation: fundamentals.valuation, data_confidence: fundamentals.data_confidence, sector: fundamentals.sector })
  const prompt = `Analyse ${companyName ? companyName + ' ' : ''}${symbol} (${exchange}) for a long-term investor.
Current price: ${currentPrice != null ? '₹' + currentPrice : 'unknown'}. Market regime: ${regimeState}.
Verified fundamentals gathered so far (INR crore for absolutes; null = unknown, do NOT invent): ${factSummary}

Use web search for anything material and recent (order book, promoter actions, capacity, regulation, results). Return ONLY JSON:
{
  "qualitative": { "business_quality": 0-100, "management": 0-100, "industry": 0-100, "moat": 0-100, "macro_sensitivity": 0-100, "geopolitical_risk": 0-100 },
  "fair_value_low": number|null, "fair_value_high": number|null,
  "entry_low": number|null, "entry_high": number|null,
  "horizon": string,
  "bull_case": string, "base_case": string, "bear_case": string,
  "catalysts": string[], "risks": string[],
  "invalidation": string[],
  "why_now": string,
  "thesis_invalidated": boolean
}
Notes: macro_sensitivity/geopolitical_risk are scored so that HIGHER = more resilient (less vulnerable). "invalidation" = specific, monitorable conditions that would break the thesis. "why_now" = the concrete reason to act now, or state that there is none and to wait.`

  const research = await researchJson<Analysis>({ system: ANALYSIS_SYSTEM, prompt, webSearch: true, maxUses: 6, maxTokens: 4096 })
  const a = research.data ?? {}

  // 3. Transparent score -------------------------------------------------------
  const breakdown = scoreSecurity({
    fundamentals: fundamentals.fundamentals,
    valuation: fundamentals.valuation,
    dataConfidence: fundamentals.data_confidence,
    qualitative: a.qualitative,
  })

  // 4. Deterministic, portfolio-aware decision --------------------------------
  const decision = decide({
    symbol,
    isHolding,
    score: breakdown.total,
    dataConfidence: fundamentals.data_confidence,
    valuationScore: breakdown.factors.valuation?.score ?? null,
    currentPrice,
    fairValueHigh: num(a.fair_value_high),
    sector: fundamentals.sector,
    regimeState,
    portfolio: summary,
    thesisInvalidated: Boolean(a.thesis_invalidated),
  })

  // why_now: engine wins for wait/insufficient/thesis; otherwise use the analyst's reason.
  const why_now = decision.why_now ?? (a.why_now ?? null)
  const sources: Source[] = [...fundamentals.sources, ...research.sources]
    .filter((s, i, all) => s.url && all.findIndex(x => x.url === s.url) === i)

  const recommendation = {
    user_id: user.id,
    symbol, exchange,
    company_name: companyName ?? fundamentals.company_name ?? held?.company_name ?? null,
    action: decision.action,
    current_price: currentPrice,
    entry_low: num(a.entry_low), entry_high: num(a.entry_high),
    fair_value_low: num(a.fair_value_low), fair_value_high: num(a.fair_value_high),
    bull_case: a.bull_case ?? null, base_case: a.base_case ?? null, bear_case: a.bear_case ?? null,
    horizon: a.horizon ?? null,
    why_now,
    catalysts: arr(a.catalysts),
    risks: arr(a.risks),
    invalidation: arr(a.invalidation),
    data_confidence: fundamentals.data_confidence,
    ai_confidence: decision.ai_confidence,
    max_alloc_pct: decision.max_alloc_pct,
    market_regime: regimeState,
    total_score: breakdown.total,
    score_breakdown: breakdown,
    portfolio_context: decision.portfolio_context,
    sources,
    is_holding: isHolding,
  }

  // 5. Persist: immutable recommendation + cached security snapshot ------------
  const { data: recRow, error: recErr } = await supabase
    .from('inv_recommendations').insert(recommendation).select('*').single()
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  await supabase.from('inv_securities').upsert({
    user_id: user.id, symbol, exchange,
    company_name: recommendation.company_name,
    sector: fundamentals.sector,
    market_cap_band: fundamentals.market_cap_band,
    fundamentals: fundamentals.fundamentals,
    valuation: fundamentals.valuation,
    data_confidence: fundamentals.data_confidence,
    sources,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,symbol,exchange' })

  // 6. Keep the holding's headline rating + thesis status in sync -------------
  if (held) {
    const thesis_status: ThesisStatus =
      a.thesis_invalidated ? 'invalidated'
      : (decision.action === 'REDUCE' || decision.action === 'SELL') ? 'deteriorating'
      : (decision.wait || decision.concentration_flag) ? 'watch'
      : 'intact'
    await supabase.from('inv_holdings')
      .update({ ai_rating: decision.action, thesis_status, sector: held.sector ?? fundamentals.sector, market_cap_band: held.market_cap_band ?? fundamentals.market_cap_band, updated_at: new Date().toISOString() })
      .eq('id', held.id).eq('user_id', user.id)
  }

  return NextResponse.json({ recommendation: recRow, breakdown, note: research.error ?? null })
}
