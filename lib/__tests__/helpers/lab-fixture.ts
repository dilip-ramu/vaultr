// Shared fixtures for the Lab lifecycle tests. Builds a seeded fake database and
// deterministic stand-ins for the two things the Lab cannot call in a test: the
// price feed and the AI analysis.

import { FakeSupabase } from './fake-supabase'
import { DEFAULT_LAB_CONSTRAINTS } from '@/lib/investments/lab/config'
import { DEFAULT_COST_MODEL } from '@/lib/investments/lab/costs'
import type { AnalyzeOutcome } from '@/lib/investments/analyzeCore'
import type { LabAccount, Exchange, RecAction } from '@/lib/investments/lab/types'
import type { Quote } from '@/lib/investments/providers/price'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const USER = 'user-1'
export const LAB = 'lab-1'
/** 2026-08-18 09:30 IST (a Tuesday) expressed as UTC. */
export const NOW = new Date('2026-08-18T04:00:00Z')
/** Yahoo's timestamp for the 2026-08-18 session. */
export const SESSION_EPOCH = Math.floor(new Date('2026-08-18T04:00:00Z').getTime() / 1000)

export function makeLabRow(over: Partial<LabAccount> = {}): any {
  return {
    id: LAB, user_id: USER, name: 'Inex Investment Lab',
    starting_capital: 1_000_000, start_date: '2026-08-01', cash: 1_000_000,
    model_version: '1.0', status: 'active',
    constraints: { ...DEFAULT_LAB_CONSTRAINTS },
    cost_model: { ...DEFAULT_COST_MODEL },
    benchmark_start: {
      nifty50_level: 20_000, nifty500_level: 18_000,
      as_of: '2026-08-01', captured_at: '2026-08-01T04:00:00Z', source: 'test',
    },
    created_at: '2026-08-01T04:00:00Z', updated_at: '2026-08-01T04:00:00Z',
    ...over,
  }
}

export function seedDb(opts: { lab?: Partial<LabAccount>; positions?: any[]; extra?: Record<string, any[]> } = {}): FakeSupabase {
  return new FakeSupabase({
    lab_accounts: [makeLabRow(opts.lab)],
    lab_positions: opts.positions ?? [],
    lab_trades: [], lab_decisions: [], lab_nav_history: [], lab_benchmarks: [],
    lab_dividends: [], lab_corporate_actions: [], lab_cycles: [], lab_cycle_steps: [],
    inv_market_regime: [], inv_securities: [],
    ...(opts.extra ?? {}),
  })
}

export function position(over: Partial<any> = {}): any {
  return {
    id: `pos-${over.symbol ?? 'X'}`, lab_id: LAB, user_id: USER,
    symbol: 'AAA', exchange: 'NSE', company_name: 'AAA Ltd',
    quantity: 100, cost_basis: 100_000, sector: 'IT', market_cap_band: 'large',
    last_price: null, last_price_at: null, last_price_source: null,
    opened_at: '2026-08-01T04:00:00Z', updated_at: '2026-08-01T04:00:00Z',
    ...over,
  }
}

/** A price feed that returns exactly what the test says, including failures. */
export function fakePrices(map: Record<string, number | null>) {
  return async (items: { symbol: string; exchange: Exchange }[]) => {
    const quotes: Record<string, Quote> = {}
    const failed: string[] = []
    for (const i of items) {
      const sym = i.symbol.toUpperCase()
      const p = map[sym]
      if (p == null) { failed.push(sym); continue }
      quotes[sym] = { symbol: sym, price: p, currency: 'INR', at: NOW.toISOString(), marketTime: SESSION_EPOCH }
    }
    return { quotes, failed }
  }
}

export function fakeIndex(levels: { nifty50?: number | null; nifty500?: number | null } = {}, marketTime: number | null = SESSION_EPOCH) {
  return async (symbol: string): Promise<Quote | null> => {
    // An EXPLICIT null means "this index could not be read" — distinct from
    // "not specified", which falls back to a default level.
    const price = symbol === '^NSEI'
      ? ('nifty50' in levels ? levels.nifty50 : 21_000)
      : ('nifty500' in levels ? levels.nifty500 : 19_000)
    if (price == null) return null
    return { symbol, price, currency: 'INR', at: NOW.toISOString(), marketTime }
  }
}

/** A successful analysis with a given verdict. */
export function okAnalysis(args: {
  symbol: string
  exchange?: Exchange
  action: RecAction
  price: number | null
  dataConfidence?: number
  sector?: string | null
  maxAllocPct?: number | null
  companyName?: string | null
}): AnalyzeOutcome {
  const exchange = args.exchange ?? 'NSE'
  const dc = args.dataConfidence ?? 80
  return {
    ok: true,
    recommendation: {
      symbol: args.symbol, exchange, company_name: args.companyName ?? `${args.symbol} Ltd`,
      action: args.action, current_price: args.price,
      entry_low: null, entry_high: null, fair_value_low: null, fair_value_high: null,
      bull_case: 'bull', base_case: 'base', bear_case: 'bear',
      horizon: '2-3 years', why_now: 'test',
      catalysts: [], risks: [], invalidation: [],
      data_confidence: dc, ai_confidence: 70,
      max_alloc_pct: args.maxAllocPct ?? 10,
      market_regime: 'neutral', total_score: 70,
      score_breakdown: { factors: {}, total: 70 },
      portfolio_context: null, sources: [], is_holding: false,
    },
    breakdown: { factors: {}, total: 70 },
    fundamentals: {
      company_name: args.companyName ?? `${args.symbol} Ltd`, sector: args.sector ?? 'IT',
      market_cap_band: 'large', fundamentals: {}, valuation: {},
      data_confidence: dc, sources: [], cached: false, fetched_at: NOW.toISOString(),
    },
    decision: {
      action: args.action, why_now: 'test', portfolio_context: null,
      max_alloc_pct: args.maxAllocPct ?? 10, ai_confidence: 70, wait: false, concentration_flag: false,
    },
    currentPrice: args.price,
    regimeState: 'neutral',
    note: null,
    fundamentalsCached: false,
    qualitativeCached: false,
    qualitative: {
      qualitative: { business_quality: 70, management: 70, industry: 65, moat: 60 },
      fair_value_low: null, fair_value_high: null, entry_low: null, entry_high: null,
      horizon: '2-3 years', bull_case: 'bull', base_case: 'base', bear_case: 'bear',
      catalysts: [], risks: [], invalidation: [], why_now: 'test',
      thesis_invalidated: false, sources: [], researched_at: NOW.toISOString(), regime: 'neutral',
    },
    searchBudgetUsed: 12,
    timings: { price_ms: 5, fundamentals_ms: 100, analysis_ms: 200 },
  }
}

export function failedAnalysis(kind: 'RATE_LIMITED' | 'TIMEOUT' | 'PROVIDER_ERROR' | 'AUTHENTICATION_ERROR' = 'RATE_LIMITED'): AnalyzeOutcome {
  return {
    ok: false,
    failure: {
      kind, stage: 'fundamentals', message: 'Anthropic API 429: rate limited',
      retryable: true, progressSaved: false, timings: { fundamentals_ms: 120 },
    },
  }
}

/** Route analyses by symbol, and count how many were requested. */
export function analyzeRouter(map: Record<string, AnalyzeOutcome>, log: string[] = []) {
  return async (params: any): Promise<AnalyzeOutcome> => {
    log.push(params.symbol)
    const hit = map[params.symbol.toUpperCase()]
    if (!hit) throw new Error(`no stub analysis for ${params.symbol}`)
    return hit
  }
}

/** The Lab ran out of request budget before the qualitative half could start.
 *  Fundamentals were cached, so a re-run is cheaper — and this is NOT a view
 *  about the company. */
export function budgetExhausted(progressSaved = true): AnalyzeOutcome {
  return {
    ok: false,
    failure: {
      kind: 'BUDGET_EXHAUSTED', stage: 'qualitative',
      message: 'Not enough time left in this request to complete the qualitative analysis.',
      retryable: true, progressSaved, timings: { fundamentals_ms: 30_000 },
    },
  }
}
