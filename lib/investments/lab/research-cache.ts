// Research freshness and cost control (correctness pass, item 10).
//
// Every AI analysis is two web-search calls; a cycle that re-researches the same
// company on every invocation burns money for no new information. Company
// fundamentals move on results, which is a quarterly event — so they are cached.
// Prices, news and the qualitative read are NOT cached: they are the parts that
// actually change between runs.
//
// The cache is inv_securities, the Phase-1 table that was already being WRITTEN
// on every analysis and never read. It is per-user and shared with the real
// portfolio, so researching a name in one place benefits the other.
//
// Nothing here degrades research quality: a miss, or an entry past its TTL,
// performs the full research call exactly as before.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getFundamentals, type FundamentalsInput } from '../providers/fundamentals'
import { isFresh, hoursSince } from './config'
import type { FundamentalsResult, MarketCapBand, Source } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FundamentalsCacheOptions {
  supabase: SupabaseClient
  userId: string
  ttlHours: number
  now?: Date
  /** Set false to force a fresh call (kept for a future "re-research" action). */
  useCache?: boolean
  onEvent?: (e: { symbol: string; hit: boolean; ageHours: number | null }) => void
}

function fromRow(row: any): FundamentalsResult {
  return {
    company_name: row.company_name ?? null,
    sector: row.sector ?? null,
    market_cap_band: (row.market_cap_band ?? null) as MarketCapBand | null,
    fundamentals: (row.fundamentals ?? {}) as FundamentalsResult['fundamentals'],
    valuation: (row.valuation ?? {}) as FundamentalsResult['valuation'],
    data_confidence: Number(row.data_confidence ?? 0),
    sources: (row.sources ?? []) as Source[],
    notes: row.notes ?? undefined,
    cached: true,
    fetched_at: row.fetched_at ?? null,
  }
}

/**
 * A drop-in replacement for getFundamentals that consults inv_securities first.
 * Pass the result to analyzeSymbol({ loadFundamentals }).
 */
export function makeCachedFundamentalsLoader(opts: FundamentalsCacheOptions) {
  const { supabase, userId, ttlHours } = opts
  const now = opts.now ?? new Date()
  const useCache = opts.useCache !== false

  return async function loadFundamentals(input: FundamentalsInput): Promise<FundamentalsResult> {
    const symbol = input.symbol.toUpperCase()
    if (useCache) {
      const { data } = await supabase
        .from('inv_securities').select('*')
        .eq('user_id', userId).eq('symbol', symbol).eq('exchange', input.exchange)
        .limit(1)
      const row = data?.[0]
      const age = hoursSince(row?.fetched_at, now)
      if (row && row.data_confidence != null && isFresh(row.fetched_at, ttlHours, now)) {
        opts.onEvent?.({ symbol, hit: true, ageHours: age })
        return fromRow(row)
      }
    }

    const fresh = await getFundamentals(input)
    opts.onEvent?.({ symbol, hit: false, ageHours: null })

    // Only a successful read is worth caching — never store a transport failure.
    if (!fresh.failure) {
      await supabase.from('inv_securities').upsert({
        user_id: userId, symbol, exchange: input.exchange,
        company_name: fresh.company_name, sector: fresh.sector, market_cap_band: fresh.market_cap_band,
        fundamentals: fresh.fundamentals, valuation: fresh.valuation,
        data_confidence: fresh.data_confidence, sources: fresh.sources,
        fetched_at: now.toISOString(), updated_at: now.toISOString(),
      }, { onConflict: 'user_id,symbol,exchange' })
    }
    return { ...fresh, cached: false }
  }
}

export interface RegimeCacheResult {
  state: string
  as_of: string | null
  fresh: boolean
  ageHours: number | null
}

/** The stored market regime, and whether it is still inside its TTL. Lets a
 *  cycle skip a macro research call it does not need. */
export async function readStoredRegime(
  supabase: SupabaseClient, userId: string, ttlHours: number, now: Date = new Date(),
): Promise<RegimeCacheResult> {
  const { data } = await supabase
    .from('inv_market_regime').select('state, created_at, as_of')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
  const row = data?.[0]
  if (!row) return { state: 'neutral', as_of: null, fresh: false, ageHours: null }
  return {
    state: String(row.state ?? 'neutral'),
    as_of: row.as_of ?? null,
    fresh: isFresh(row.created_at, ttlHours, now),
    ageHours: hoursSince(row.created_at, now),
  }
}
