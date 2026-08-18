import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { researchJson } from '@/lib/investments/claude'
import { analyzePortfolio } from '@/lib/investments/portfolio'
import type { OppCategory, Source } from '@/lib/investments/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // research can be slow; 60s is the safe ceiling across Vercel plans

// Bounded opportunity discovery (brief §10, §21). Phase 1 keeps this small and
// portfolio-aware: a handful of genuinely interesting NSE/BSE ideas, NOT a
// hundred-row screen. It avoids sectors the user is already heavy in and never
// recommends on a single ratio — each idea carries a thesis, a data-confidence,
// and sources. Nothing here is a buy instruction; it populates the watchlist.
const SYSTEM = `You are a buy-side analyst scanning the broader Indian market (NSE/BSE) for genuinely interesting, less-obvious ideas.
Look across: deep value, growth-at-reasonable-price, earnings acceleration, turnarounds, structural winners, temporary dislocations, and special situations (demergers, buybacks, restructuring).
Rules: never surface an idea on one ratio alone; independently sanity-check the data; be honest about confidence; prefer names the user likely hasn't over-heard. Do NOT include anything you cannot source. This is idea generation for a watchlist, not a buy instruction.`

interface Idea {
  symbol: string; exchange?: string; company_name?: string
  category?: string; thesis?: string; data_confidence?: number; score?: number
}

const CATS: OppCategory[] = ['strong_buy','buy','accumulate','watch','deep_value','growth','turnaround','special_situation','ipo','avoid']

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: holdings } = await supabase.from('inv_holdings').select('symbol, exchange, quantity, avg_cost, last_price, sector, market_cap_band').eq('user_id', user.id)
  const summary = analyzePortfolio((holdings ?? []).map(h => ({
    symbol: h.symbol, exchange: h.exchange, quantity: Number(h.quantity), avg_cost: Number(h.avg_cost),
    last_price: h.last_price != null ? Number(h.last_price) : null, sector: h.sector, market_cap_band: h.market_cap_band,
  })))
  const heavySectors = Object.entries(summary.sectorAlloc).filter(([, p]) => p >= 20).map(([s]) => s)
  const held = (holdings ?? []).map(h => h.symbol.toUpperCase())

  const prompt = `Surface 5 genuinely interesting, less-obvious Indian listed (NSE/BSE) investment ideas right now. Use web search for current data.
Already held (don't repeat): ${held.join(', ') || 'none'}.
Sectors already heavy in the portfolio (be selective adding more): ${heavySectors.join(', ') || 'none'}.
Return ONLY JSON: { "ideas": [ { "symbol": string, "exchange": "NSE"|"BSE", "company_name": string, "category": "deep_value"|"growth"|"turnaround"|"special_situation"|"accumulate"|"buy"|"watch", "thesis": string (2-3 sentences, the actual edge), "data_confidence": 0-100 } ] }
Only include ideas you can source. Fewer, higher-quality ideas beat a long list.`

  // Routed through the shared task table (lib/investments/models.ts) instead of
  // its own hand-set numbers. This call used to allow EIGHT web searches — the
  // most expensive configuration anywhere in the app, and it was reachable from
  // a button. Search results are billed as input tokens and re-sent on every
  // internal iteration, so the cost grows with the square of that number.
  const { data, sources, error } = await researchJson<{ ideas?: Idea[] }>({
    system: SYSTEM, prompt, webSearch: true, task: 'discovery',
    retries: 0, timeoutMs: 45_000,
  })
  const ideas = (data?.ideas ?? []).slice(0, 8)
  if (!ideas.length) return NextResponse.json({ discovered: 0, error: error ?? 'No ideas returned' })

  const rows = ideas
    .map(i => {
      const symbol = String(i.symbol ?? '').trim().toUpperCase()
      if (!symbol || held.includes(symbol)) return null
      const category = (CATS.includes(i.category as OppCategory) ? i.category : 'watch') as OppCategory
      return {
        user_id: user.id,
        symbol,
        exchange: (i.exchange === 'BSE' ? 'BSE' : 'NSE'),
        company_name: i.company_name ?? null,
        category,
        thesis: i.thesis ?? null,
        data_confidence: i.data_confidence != null ? Math.round(Number(i.data_confidence)) : null,
        sources: sources as Source[],
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (!rows.length) return NextResponse.json({ discovered: 0 })
  const { data: inserted, error: ierr } = await supabase.from('inv_opportunities').insert(rows).select('*')
  if (ierr) return NextResponse.json({ error: ierr.message }, { status: 500 })
  return NextResponse.json({ discovered: inserted?.length ?? 0, opportunities: inserted ?? [] })
}
