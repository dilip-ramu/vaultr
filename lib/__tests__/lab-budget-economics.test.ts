import { describe, it, expect } from 'vitest'
import { runInvestmentCycle } from '@/lib/investments/lab/cycle'
import { createBudget, MIN_RESEARCH_STAGE_MS, MAX_CALL_MS, SAFETY_MS, ROUTE_MAX_MS } from '@/lib/investments/deadline'
import { DEFAULT_LAB_CONSTRAINTS, resolveConstraints } from '@/lib/investments/lab/config'
import { asClient, type Row } from './helpers/fake-supabase'
import { seedDb, position, fakePrices, fakeIndex, USER, LAB, NOW } from './helpers/lab-fixture'
import type { CASyncResult } from '@/lib/investments/lab/corporate-sync'
import type { StageResult, QualitativeResearch } from '@/lib/investments/analyzeStages'
import type { FundamentalsResult } from '@/lib/investments/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const noCorporate = async (): Promise<CASyncResult> => ({
  ran: false, dividends: 0, splits: 0, bonuses: 0, flagged: 0, skipped: 0,
  cashCredited: 0, notes: [], failure: null,
})

const FUND: FundamentalsResult = {
  company_name: 'AAA Ltd', sector: 'IT', market_cap_band: 'large',
  fundamentals: { roe_pct: 20 }, valuation: { pe: 18, sector_pe: 24 },
  data_confidence: 82, sources: [],
}
const QUAL: QualitativeResearch = {
  qualitative: { business_quality: 75, management: 70 },
  fair_value_low: 1200, fair_value_high: 1500, entry_low: 950, entry_high: 1050,
  horizon: '2-3 years', bull_case: 'b', base_case: 'b', bear_case: 'b',
  catalysts: [], risks: [], invalidation: [], why_now: 'w',
  thesis_invalidated: false, sources: [], researched_at: NOW.toISOString(), regime: 'neutral',
}

const stubFundamentals = (db: any, calls: string[]) => async (p: any): Promise<StageResult<FundamentalsResult>> => {
  calls.push(`fundamentals:${p.symbol}`)
  db.rows('inv_securities').push({
    id: `sec-${p.symbol}`, user_id: USER, symbol: p.symbol, exchange: p.exchange,
    company_name: FUND.company_name, sector: FUND.sector, market_cap_band: FUND.market_cap_band,
    fundamentals: FUND.fundamentals, valuation: FUND.valuation,
    data_confidence: FUND.data_confidence, sources: FUND.sources,
    fetched_at: NOW.toISOString(), updated_at: NOW.toISOString(),
  })
  return { ok: true, value: { ...FUND, cached: false } }
}
const qualOk = (calls: string[]) => async (p: any): Promise<StageResult<QualitativeResearch>> => {
  calls.push(`qualitative:${p.symbol}`)
  return { ok: true, value: QUAL }
}
const qualTimeout = (calls: string[]) => async (p: any): Promise<StageResult<QualitativeResearch>> => {
  calls.push(`qualitative:${p.symbol}`)
  return {
    ok: false,
    failure: { kind: 'TIMEOUT', stage: 'qualitative', message: 'Request aborted after 16000ms', retryable: true, progressSaved: true },
  }
}

const deps = (over: Record<string, unknown>) => ({
  now: () => NOW,
  syncCorporate: noCorporate as never,
  discover: async () => ({ ideas: [], failure: null }),
  fetchPriceFn: async () => ({ symbol: 'AAA.NS', price: 1000, currency: 'INR', at: NOW.toISOString(), marketTime: null }),
  markOptions: { now: NOW, fetchPricesFn: fakePrices({ AAA: 1000 }) as never, fetchIndexQuoteFn: fakeIndex() },
  ...over,
})
const oneHolding = () => seedDb({ positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 10_000, last_price: 1000 })] })
const counters = (db: any) => db.rows('lab_cycles')[0].counters

// ── The budget arithmetic itself ─────────────────────────────────────────────

describe('budget economics (item 1 and 2)', () => {
  it('the gate is now large enough for the call it guards', () => {
    expect(MIN_RESEARCH_STAGE_MS).toBe(40_000)
    // A stage is only started when the timeout we would grant is time it can
    // actually use — the old 18,000 gate granted 15–20s to a 25–60s call.
    expect(MIN_RESEARCH_STAGE_MS).toBeGreaterThanOrEqual(MAX_CALL_MS * 0.8)
  })

  it('keeps a real safety reserve under the platform wall', () => {
    const k = resolveConstraints({})
    const usable = Math.min(k.invocation_budget_ms + SAFETY_MS, ROUTE_MAX_MS) - SAFETY_MS
    expect(usable).toBe(48_000)
    expect(ROUTE_MAX_MS - usable).toBeGreaterThanOrEqual(10_000)   // ≥10s of wall left
  })

  it('a fresh budget affords exactly one research stage, and a spent one affords none', () => {
    const fresh = createBudget({ totalMs: 55_000 })
    expect(fresh.enough(MIN_RESEARCH_STAGE_MS)).toBe(true)
    const spent = createBudget({ totalMs: 55_000, now: Date.now() - 30_000 })
    expect(spent.enough(MIN_RESEARCH_STAGE_MS)).toBe(false)       // ~18s left: refused
  })
})

// ── Stage counting vs security counting ──────────────────────────────────────

describe('max_analyses_per_cycle counts SECURITIES (item 3)', () => {
  it('a three-stage security counts as exactly one analysis', async () => {
    const db = oneHolding()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls), runQualitative: qualOk(calls),
    }))
    expect(calls).toEqual(['fundamentals:AAA', 'qualitative:AAA'])
    expect(counters(db).analyses).toBe(1)          // one SECURITY
    expect(counters(db).stageAttempts).toBe(2)     // two STAGES
  })

  it('a failed qualitative stage consumes no analysis allowance (item 4)', async () => {
    const db = oneHolding()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls), runQualitative: qualTimeout(calls),
    }))
    expect(counters(db).analyses).toBe(0)          // nothing completed
    expect(counters(db).stageAttempts).toBe(2)     // but work was attempted
    expect(counters(db).failures).toBe(1)
    expect(db.rows('lab_decisions').filter((d: Row) => d.symbol === 'AAA')).toHaveLength(0)
  })

  it('a resumed security still counts exactly once in total', async () => {
    const db = oneHolding()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls), runQualitative: qualTimeout(calls),
    }))
    expect(counters(db).analyses).toBe(0)

    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls), runQualitative: qualOk(calls),
    }))
    expect(counters(db).analyses).toBe(1)          // not 2
    expect(db.rows('lab_decisions').filter((d: Row) => d.symbol === 'AAA')).toHaveLength(1)
    expect(db.count('lab_trades')).toBe(0)
  })
})

// ── The gate in the cycle ────────────────────────────────────────────────────

describe('no stage starts without the budget to finish it (item 1)', () => {
  it('refuses to start fundamentals and yields cleanly', async () => {
    const db = oneHolding()
    const calls: string[] = []
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, deps({
      budget: createBudget({ totalMs: 55_000, now: Date.now() - 30_000 }),   // ~18s left
      runFundamentals: stubFundamentals(db, calls), runQualitative: qualOk(calls),
    }))
    expect(calls).toEqual([])                       // nothing was attempted
    expect(summary.status).toBe('in_progress')
    expect(summary.resumable).toBe(true)
    expect(counters(db).analyses).toBe(0)
    expect(counters(db).stageAttempts).toBe(0)      // a refusal is not an attempt
  })

  it('records WHY it refused, with the budget that produced the decision (item 5)', async () => {
    const db = oneHolding()
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, deps({
      budget: createBudget({ totalMs: 55_000, now: Date.now() - 30_000 }),
      runFundamentals: stubFundamentals(db, []), runQualitative: qualOk([]),
    }))
    const log = db.rows('lab_cycles')[0].summary.stageLog
    expect(Array.isArray(log)).toBe(true)
    expect(log).toHaveLength(1)
    const e = log[0]
    expect(e.symbol).toBe('AAA')
    expect(e.stage).toBe('fundamentals')
    expect(e.outcome).toBe('yielded_before_start')
    expect(e.stageStartedAt).toBe(null)
    expect(e.timeoutGrantedMs).toBe(null)
    expect(e.remainingBeforeMs).toBeLessThan(MIN_RESEARCH_STAGE_MS)
    expect(e.invocationStartedAt).toBeTruthy()
    expect(summary.status).toBe('in_progress')
  })

  it('records duration, remaining budget and granted timeout for a stage it did run', async () => {
    const db = oneHolding()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls), runQualitative: qualTimeout(calls),
    }))
    const log = db.rows('lab_cycles')[0].summary.stageLog
    const f = log.find((e: any) => e.stage === 'fundamentals')
    expect(f.outcome).toBe('completed')
    expect(f.durationMs).toBeGreaterThanOrEqual(0)
    expect(f.timeoutGrantedMs).toBeGreaterThan(0)
    expect(f.remainingBeforeMs).toBeGreaterThanOrEqual(MIN_RESEARCH_STAGE_MS)
    expect(f.attempt).toBe(1)

    const q = log.find((e: any) => e.stage === 'qualitative')
    expect(q.outcome).toBe('failed')
    expect(q.failureKind).toBe('TIMEOUT')
    // A timeout is classified as a timeout — never as an evidence problem.
    expect(q.failureKind).not.toBe('INSUFFICIENT_DATA')
  })
})

// ── Discovery ────────────────────────────────────────────────────────────────

describe('discovery respects the same gate (item 6)', () => {
  it('does not start a scan it cannot finish, and does not call it "no ideas"', async () => {
    const db = seedDb({ positions: [] })
    let scans = 0
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, deps({
      budget: createBudget({ totalMs: 55_000, now: Date.now() - 30_000 }),
      discover: async () => { scans++; return { ideas: [], failure: null } },
    }))
    expect(scans).toBe(0)                                   // never attempted
    expect(db.rows('lab_cycles')[0].cursor.discoveryRan).toBe(false)   // will retry
    expect(summary.status).toBe('in_progress')
    expect(counters(db).analyses).toBe(0)                   // and costs no allowance
  })
})

describe('configuration ownership (item 9)', () => {
  it('policy stays on the account, timings come from code', () => {
    const r = resolveConstraints({
      ...DEFAULT_LAB_CONSTRAINTS,
      max_single_pct: 9, min_data_confidence: 60,      // policy — honoured
      invocation_budget_ms: 45_000,                    // execution — ignored
    })
    expect(r.max_single_pct).toBe(9)
    expect(r.min_data_confidence).toBe(60)
    expect(r.invocation_budget_ms).toBe(48_000)
  })
})
