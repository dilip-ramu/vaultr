// Inex Investments — shared domain types (Phase 1).
//
// These mirror the v109 tables. Kept deliberately close to the DB shape so the
// API routes can pass rows straight through to the client with minimal mapping.

import type { ResearchFailure } from './claude'

export type Exchange = 'NSE' | 'BSE'

export type RecAction =
  | 'STRONG_BUY' | 'BUY' | 'ACCUMULATE' | 'HOLD'
  | 'REDUCE' | 'SELL' | 'AVOID' | 'INSUFFICIENT_DATA'

export type ThesisStatus = 'intact' | 'watch' | 'deteriorating' | 'invalidated'
export type MarketCapBand = 'large' | 'mid' | 'small' | 'micro' | 'unknown'
export type RegimeState = 'risk_on' | 'neutral' | 'cautious' | 'risk_off' | 'crisis'
export type OppCategory =
  | 'strong_buy' | 'buy' | 'accumulate' | 'watch' | 'deep_value'
  | 'growth' | 'turnaround' | 'special_situation' | 'ipo' | 'avoid'

/** A traceable source. tier follows brief §16 (1 = official, 4 = social). */
export interface Source { title: string; url: string; tier?: 1 | 2 | 3 | 4 }

export interface Fundamentals {
  revenue?: number | null
  revenue_growth_pct?: number | null
  ebitda?: number | null
  ebitda_margin_pct?: number | null
  ebit?: number | null
  pat?: number | null
  eps?: number | null
  eps_growth_pct?: number | null
  roe_pct?: number | null
  roce_pct?: number | null
  fcf?: number | null
  ocf?: number | null
  debt?: number | null
  cash?: number | null
  interest_coverage?: number | null
  promoter_holding_pct?: number | null
  promoter_pledge_pct?: number | null
  [k: string]: number | null | undefined
}

export interface Valuation {
  pe?: number | null
  pb?: number | null
  ev_ebitda?: number | null
  ev_sales?: number | null
  peg?: number | null
  sector_pe?: number | null
  hist_pe?: number | null
  [k: string]: number | null | undefined
}

/** Per-factor scores 0–100 with the weight applied. Fully transparent (§12). */
export interface ScoreFactor { score: number; weight: number; note?: string }
export interface ScoreBreakdown {
  factors: Record<string, ScoreFactor>
  total: number            // 0–100 weighted
}

export interface Holding {
  id: string
  user_id: string
  symbol: string
  exchange: Exchange
  company_name: string | null
  quantity: number
  avg_cost: number
  last_price: number | null
  last_price_at: string | null
  sector: string | null
  market_cap_band: MarketCapBand | null
  thesis: string | null
  ai_rating: RecAction | null
  thesis_status: ThesisStatus
  max_alloc_pct: number | null
  source: 'manual' | 'assets' | 'hdfc'
  asset_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FundamentalsResult {
  company_name: string | null
  sector: string | null
  market_cap_band: MarketCapBand | null
  fundamentals: Fundamentals
  valuation: Valuation
  data_confidence: number        // 0–100 (§15)
  sources: Source[]
  notes?: string
  /**
   * Set when the RESEARCH CALL failed rather than the evidence being thin
   * (correctness pass, item 9). data_confidence is 0 in both cases, so callers
   * must check this before concluding anything: a provider outage must defer
   * the decision, never produce "INSUFFICIENT_DATA, therefore hold".
   */
  failure?: ResearchFailure
  /** True when this came from the cache rather than a fresh research call. */
  cached?: boolean
  /** When the underlying research was performed (ISO). */
  fetched_at?: string | null
}

export interface Recommendation {
  symbol: string
  exchange: Exchange
  company_name: string | null
  action: RecAction
  current_price: number | null
  entry_low: number | null
  entry_high: number | null
  fair_value_low: number | null
  fair_value_high: number | null
  bull_case: string | null
  base_case: string | null
  bear_case: string | null
  horizon: string | null
  why_now: string | null
  catalysts: string[]
  risks: string[]
  invalidation: string[]
  data_confidence: number | null
  ai_confidence: number | null
  max_alloc_pct: number | null
  market_regime: string | null
  total_score: number | null
  score_breakdown: ScoreBreakdown | Record<string, never>
  portfolio_context: string | null
  sources: Source[]
  is_holding: boolean
}

export interface MarketRegime {
  as_of: string
  state: RegimeState
  summary: string | null
  reasons: string[]
  drivers: Record<string, string>
  sources: Source[]
}

export const REC_LABEL: Record<RecAction, string> = {
  STRONG_BUY: 'Strong Buy',
  BUY: 'Buy',
  ACCUMULATE: 'Accumulate',
  HOLD: 'Hold',
  REDUCE: 'Reduce',
  SELL: 'Sell',
  AVOID: 'Avoid',
  INSUFFICIENT_DATA: 'Insufficient Data',
}

export const REGIME_LABEL: Record<RegimeState, string> = {
  risk_on: 'Risk ON',
  neutral: 'Neutral',
  cautious: 'Cautious',
  risk_off: 'Risk OFF',
  crisis: 'Crisis',
}
