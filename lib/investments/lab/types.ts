// Inex Investment Lab — shared types. Mirrors the v110/v111/v112 lab_* tables.

import type { Exchange, RecAction, Source, ScoreBreakdown, RegimeState } from '../types'

/**
 * The Lab's investment rules. ONE authoritative definition (correctness pass,
 * item 6): the same object drives the recommendation layer (via
 * config.toDecideConfig) and the execution engine, so the analysis can never
 * bless an allocation the engine will then refuse.
 *
 * The first eight fields are the v110 shape and stay REQUIRED. Everything added
 * afterwards is optional here and defaulted by config.resolveConstraints(), so
 * a Lab row written before v112 keeps working.
 */
export interface LabConstraints {
  max_single_pct: number      // ceiling on one name, % of NAV
  max_sector_pct: number      // ceiling on one sector, % of NAV
  min_data_confidence: number // gate below which no buy happens
  min_price: number           // penny-stock guard (₹)
  no_leverage: boolean
  no_shorting: boolean
  no_derivatives: boolean
  max_actions_per_cycle: number

  /** Cash floor, % of NAV — the engine will not spend below it. */
  min_cash_pct?: number
  /** SECURITIES fully analysed across a whole cycle. A security counts once,
   *  when it reaches a completed decision — not once per research stage. */
  max_analyses_per_cycle?: number
  /** Expensive research stages allowed in ONE invocation. Code-owned. */
  max_research_stages_per_invocation?: number
  /** Web searches each analysis may make. */
  max_web_searches_per_analysis?: number
  /** Wall-clock budget for one invocation (ms) before it yields and resumes. */
  invocation_budget_ms?: number
  /** Cached fundamentals are reused for this long before re-researching. */
  fundamentals_ttl_hours?: number
  /** Persisted qualitative research is reused for this long. Deliberately much
   *  shorter than fundamentals: news and sentiment go stale fast, and the point
   *  of persisting it is to survive an invocation boundary, not to age. */
  qualitative_ttl_hours?: number
  /** A stored market regime is reused for this long. */
  regime_ttl_hours?: number
  /** A position priced no later than this many hours ago is still "fresh". */
  price_staleness_hours?: number
}

export type ResolvedConstraints = Required<LabConstraints>

export interface CostModel {
  brokerage_pct: number       // of turnover
  brokerage_flat: number      // ₹ per order
  stt_pct: number             // both sides (delivery equity)
  exchange_pct: number
  sebi_pct: number
  stamp_pct_buy: number       // buy side only
  gst_pct: number             // on (brokerage + exchange + sebi)
  slippage_pct: number        // adverse price move
}

/** Permanently pinned benchmark baseline (item 7). Captured once, at account
 *  creation, and never re-derived from a later mark. */
export interface BenchmarkBaseline {
  nifty50_level: number | null
  nifty500_level: number | null
  as_of: string               // trading session date the levels belong to
  captured_at: string         // ISO instant we captured them
  source: string
}

export type LabStatus = 'pending_baseline' | 'active' | 'paused' | 'closed'

export interface LabAccount {
  id: string
  user_id: string
  name: string
  starting_capital: number
  start_date: string
  cash: number
  model_version: string
  status: LabStatus
  constraints: LabConstraints
  cost_model: CostModel
  benchmark_start: BenchmarkBaseline | null
  created_at: string
  updated_at: string
}

export type PriceSource = 'live' | 'carried' | 'none'

export interface LabPosition {
  symbol: string
  exchange: Exchange
  company_name?: string | null
  quantity: number
  cost_basis: number          // total INR paid incl. buy costs
  sector?: string | null
  market_cap_band?: string | null
  /** Last valid price we ever saw, carried forward when a fetch fails. */
  last_price?: number | null
  last_price_at?: string | null
  last_price_source?: string | null
  opened_at?: string | null
}

/** A position marked with a price. `price` is null ONLY when the position has
 *  never had a valid price — a fetch failure carries the last one forward and
 *  flags it stale instead (item 2). */
export interface MarkedPosition extends LabPosition {
  price: number | null
  /** How `price` was obtained. Absent is treated as a fresh live mark, so
   *  callers that only care about value stay simple. */
  price_source?: PriceSource
  priced_at?: string | null
  stale?: boolean
}

/** The minimal state the pure engine needs. Positions must be marked. */
export interface LabState {
  cash: number
  positions: MarkedPosition[]
  constraints: LabConstraints
  cost_model: CostModel
}

export interface Charges {
  brokerage: number; stt: number; exchange: number
  sebi: number; stamp: number; gst: number
}
export interface CostResult {
  side: 'buy' | 'sell'
  requestedPrice: number
  execPrice: number           // after slippage
  quantity: number
  gross: number               // execPrice * qty
  charges: Charges
  chargesTotal: number
  slippageCost: number
  /** Cash change: negative for buy, positive for sell. */
  cashDelta: number
}

export interface TradeRecord {
  side: 'buy' | 'sell'
  symbol: string
  exchange: Exchange
  quantity: number
  price: number               // execution price after slippage
  gross_amount: number
  costs_total: number
  costs_breakdown: Charges & { slippage: number }
  cash_after: number
  realized_pnl: number | null
}

export interface EngineResult {
  ok: boolean
  reason?: string             // why refused / capped
  capped: boolean             // requested qty was reduced to satisfy limits
  requestedQty: number
  filledQty: number
  trade: TradeRecord | null
  state: LabState             // new state (unchanged if !ok)
  closed?: boolean            // sell fully closed the position
}

export interface BuyOrder {
  symbol: string
  exchange: Exchange
  price: number               // pre-slippage reference price
  quantity: number            // requested (may be capped)
  sector?: string | null
  market_cap_band?: string | null
  company_name?: string | null
  dataConfidence?: number | null
  /** When the reference price was observed (ISO). Kept so the engine stays pure
   *  — it never calls the clock itself. */
  pricedAt?: string | null
}
export interface SellOrder {
  symbol: string
  exchange: Exchange
  price: number
  quantity: number            // requested (clamped to held)
  pricedAt?: string | null
}

// ── Cycle state machine (item 1) ────────────────────────────────────────────

export type CycleStatus =
  | 'started'      // created, nothing processed yet
  | 'in_progress'  // work done, more remains (yielded on budget)
  | 'partial'      // yielded AND some steps were deferred/failed
  | 'completed'
  | 'failed'

export type CyclePhase = 'mark' | 'holdings' | 'discovery' | 'finalize' | 'done'

/** Exactly where the cycle got to. Queues are frozen at cycle start so a resume
 *  continues at the next item instead of restarting at the first. */
export interface CycleCursor {
  holdingQueue: string[]       // step keys, in order
  holdingIndex: number
  discoveryQueue: string[]
  discoveryIndex: number
  discoveryRan: boolean
  markDone: boolean
  corporateDone: boolean
}

/** One line of evidence per research stage. Names, durations and outcomes only
 *  — never prompts, payloads or credentials. */
export interface StageLogEntry {
  symbol: string | null
  exchange: string | null
  stage: string
  attempt: number
  /** ISO instants. */
  invocationStartedAt: string
  stageStartedAt: string | null
  stageEndedAt: string | null
  durationMs: number | null
  /** Budget left at the moment we decided whether to start. */
  remainingBeforeMs: number
  /** Timeout we would have granted / did grant the call. */
  timeoutGrantedMs: number | null
  outcome: 'completed' | 'yielded_before_start' | 'failed'
  failureKind: string | null
  note?: string
}

export interface CycleCounters {
  /** SECURITIES that reached a completed decision. Not stage attempts. */
  analyses: number
  cacheHits: number
  actions: number              // trades executed
  invocations: number
  deferred: number
  failures: number
  webSearchBudgetUsed: number  // upper-bound estimate of searches consumed
  /** Expensive research stages attempted, successful or not. Operational. */
  stageAttempts?: number
}

export interface LabCycle {
  id: string
  lab_id: string
  user_id: string
  status: CycleStatus
  phase: CyclePhase
  cursor: CycleCursor
  counters: CycleCounters
  trading_date: string
  model_version: string
  summary: Record<string, unknown>
  error: string | null
  started_at: string
  updated_at: string
  completed_at: string | null
}

export type CycleStepStatus = 'claimed' | 'done' | 'skipped' | 'deferred' | 'failed'

export type ResearchStage = 'fundamentals' | 'qualitative' | 'decision' | 'complete'

export interface LabCycleStep {
  id: string
  cycle_id: string
  lab_id: string
  user_id: string
  step_key: string             // stable: "holding:RELIANCE:NSE"
  kind: string
  symbol: string | null
  exchange: string | null
  status: CycleStepStatus
  /** Durable research stage for this security — the resume point. */
  stage?: ResearchStage
  attempts?: number
  last_error?: string | null
  last_error_at?: string | null
  stage_updated_at?: string | null
  reason: string | null
  decision_id: string | null
  trade_id: string | null
  created_at: string
  updated_at: string
}

/** Why a step did not trade. Recorded so a later cycle can retry it. */
export type DeferReason =
  | 'UNPRICED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'NO_DATA_FOUND'
  | 'BUDGET_EXHAUSTED'
  | 'CONSTRAINT'

// Re-exports so lab code has one import site.
export type { Exchange, RecAction, Source, ScoreBreakdown, RegimeState }
