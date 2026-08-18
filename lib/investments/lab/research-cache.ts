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
import type { QualitativeResearch } from '../analyzeStages'

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

// ── Persisted qualitative research (Deploy #5) ───────────────────────────────
//
// The second research call is as expensive as the first and was being thrown
// away whenever the request ran out of time immediately afterwards. It is now
// stored the same way fundamentals are, so a stage that succeeds is banked and
// the next invocation goes straight to the decision.
//
// This is a CACHE, not a journal. The permanent record of what the Lab concluded
// stays in lab_decisions; this table just stops us paying twice for the same
// research inside its TTL.

export interface QualitativeCacheHit {
  qualitative: QualitativeResearch
  fetchedAt: string
  ageHours: number | null
  fresh: boolean
}

/** Read stored qualitative research for one security. Returns the row even when
 *  stale, with `fresh` telling the caller whether it may be used. */
export async function readQualitative(
  supabase: SupabaseClient, userId: string, symbol: string, exchange: string,
  ttlHours: number, now: Date = new Date(),
): Promise<QualitativeCacheHit | null> {
  const { data } = await supabase.from('lab_research').select('*')
    .eq('user_id', userId).eq('symbol', symbol.toUpperCase()).eq('exchange', exchange).limit(1)
  const row = data?.[0]
  if (!row) return null
  return {
    qualitative: {
      ...((row.qualitative ?? {}) as Record<string, unknown>),
      sources: (row.sources ?? []) as QualitativeResearch['sources'],
      researched_at: row.fetched_at,
      regime: row.regime_at_research ?? null,
    } as QualitativeResearch,
    fetchedAt: row.fetched_at,
    ageHours: hoursSince(row.fetched_at, now),
    fresh: isFresh(row.fetched_at, ttlHours, now),
  }
}

/** Bank a completed qualitative stage. Called the moment the research returns,
 *  before anything else can fail. */
export async function saveQualitative(
  supabase: SupabaseClient, userId: string,
  symbol: string, exchange: string, companyName: string | null,
  q: QualitativeResearch, modelVersion: string, now: Date = new Date(),
): Promise<void> {
  const { sources, researched_at, regime, ...payload } = q
  await supabase.from('lab_research').upsert({
    user_id: userId, symbol: symbol.toUpperCase(), exchange,
    company_name: companyName,
    qualitative: payload,
    sources,
    model_version: modelVersion,
    regime_at_research: regime ?? null,
    fetched_at: researched_at || now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,symbol,exchange' })
}

/** Read cached fundamentals WITHOUT ever falling back to a research call.
 *  Used by the decision stage, which must be free: if the cache has gone cold
 *  the caller sends the step back to the fundamentals stage rather than
 *  quietly making an expensive call it may not have time for. */
export async function readFundamentalsCache(
  supabase: SupabaseClient, userId: string, symbol: string, exchange: string,
  ttlHours: number, now: Date = new Date(),
): Promise<FundamentalsResult | null> {
  const { data } = await supabase.from('inv_securities').select('*')
    .eq('user_id', userId).eq('symbol', symbol.toUpperCase()).eq('exchange', exchange).limit(1)
  const row = data?.[0]
  if (!row || row.data_confidence == null) return null
  if (!isFresh(row.fetched_at, ttlHours, now)) return null
  return fromRow(row)
}
