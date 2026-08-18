import { describe, it, expect } from 'vitest'
import { runInvestmentCycle } from '@/lib/investments/lab/cycle'
import { asClient, type Row } from './helpers/fake-supabase'
import { seedDb, position, fakePrices, fakeIndex, okAnalysis, USER, LAB, NOW } from './helpers/lab-fixture'
import { createBudget } from '@/lib/investments/deadline'
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
  fundamentals: { roe_pct: 20, eps_growth_pct: 15 }, valuation: { pe: 18, sector_pe: 24 },
  data_confidence: 82, sources: [{ title: 'NSE', url: 'https://nseindia.com/aaa' }],
}

const QUAL: QualitativeResearch = {
  qualitative: { business_quality: 75, management: 70, industry: 68, moat: 62 },
  fair_value_low: 1200, fair_value_high: 1500, entry_low: 950, entry_high: 1050,
  horizon: '2-3 years', bull_case: 'bull', base_case: 'base', bear_case: 'bear',
  catalysts: ['new plant'], risks: ['input costs'], invalidation: ['margin below 10%'],
  why_now: 'trades below fair value', thesis_invalidated: false,
  sources: [{ title: 'Annual report', url: 'https://aaa.com/ar' }],
  researched_at: NOW.toISOString(), regime: 'neutral',
}

/** Stands in for the fundamentals stage AND its write-through to the cache,
 *  exactly as the real cache loader would. */
const stubFundamentals = (db: any, calls: string[]) =>
  async (p: any): Promise<StageResult<FundamentalsResult>> => {
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

const stubQualitativeOk = (calls: string[]) =>
  async (p: any): Promise<StageResult<QualitativeResearch>> => {
    calls.push(`qualitative:${p.symbol}`)
    return { ok: true, value: QUAL }
  }

const stubQualitativeTimeout = (calls: string[]) =>
  async (p: any): Promise<StageResult<QualitativeResearch>> => {
    calls.push(`qualitative:${p.symbol}`)
    return {
      ok: false,
      failure: {
        kind: 'TIMEOUT', stage: 'qualitative',
        message: 'Request aborted after 8000ms', retryable: true, progressSaved: true,
      },
    }
  }

const deps = (over: Record<string, unknown>) => ({
  now: () => NOW,
  syncCorporate: noCorporate as never,
  discover: async () => ({ ideas: [], failure: null }),
  fetchPriceFn: async () => ({ symbol: 'AAA.NS', price: 1000, currency: 'INR', at: NOW.toISOString(), marketTime: null }),
  markOptions: { now: NOW, fetchPricesFn: fakePrices({ AAA: 1000, BBB: 1000 }) as never, fetchIndexQuoteFn: fakeIndex() },
  ...over,
})

const oneHolding = () => seedDb({
  positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 10_000, last_price: 1000 })],
})

describe('research stages are persisted (items 1 and 5)', () => {
  it('a completed fundamentals stage advances the step and is banked', async () => {
    const db = oneHolding()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls),
      runQualitative: stubQualitativeTimeout(calls),
    }))

    expect(calls).toEqual(['fundamentals:AAA', 'qualitative:AAA'])
    const step = db.rows('lab_cycle_steps')[0]
    expect(step.stage).toBe('qualitative')       // fundamentals done, qualitative pending
    expect(step.status).toBe('claimed')          // still ours to finish
    expect(db.count('inv_securities')).toBe(1)   // fundamentals survived the timeout
    expect(db.count('lab_research')).toBe(0)     // qualitative did not
  })

  it('a technical timeout writes NO investment decision (item 2)', async () => {
    const db = oneHolding()
    const calls: string[] = []
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls),
      runQualitative: stubQualitativeTimeout(calls),
    }))

    // The journal stays clean: no verdict, and nothing resembling one.
    expect(db.rows('lab_decisions').filter((d: Row) => d.symbol === 'AAA')).toHaveLength(0)
    expect(db.rows('lab_decisions').some((d: Row) => d.action === 'INSUFFICIENT_DATA')).toBe(false)
    // The failure is recorded as OPERATIONAL state on the step instead.
    const step = db.rows('lab_cycle_steps')[0]
    expect(step.last_error).toMatch(/TIMEOUT/)
    expect(step.attempts).toBe(1)
    expect(summary.status).toBe('in_progress')
  })

  it('a completed qualitative stage is banked before the decision', async () => {
    const db = oneHolding()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls),
      runQualitative: stubQualitativeOk(calls),
    }))

    expect(db.count('lab_research')).toBe(1)
    const row = db.rows('lab_research')[0]
    expect(row.symbol).toBe('AAA')
    expect(row.qualitative.bull_case).toBe('bull')
    expect(row.qualitative.catalysts).toEqual(['new plant'])
    expect(row.qualitative.invalidation).toEqual(['margin below 10%'])
    expect(row.sources).toHaveLength(1)
    expect(row.fetched_at).toBeTruthy()
  })
})

describe('a partially researched security resumes at the right stage (item 3)', () => {
  it('does not redo fundamentals after a qualitative timeout', async () => {
    const db = oneHolding()
    const calls: string[] = []

    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls),
      runQualitative: stubQualitativeTimeout(calls),
    }))
    expect(calls).toEqual(['fundamentals:AAA', 'qualitative:AAA'])

    // Resume: fundamentals must NOT be called again.
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runFundamentals: stubFundamentals(db, calls),
      runQualitative: stubQualitativeOk(calls),
    }))

    expect(calls.filter(c => c === 'fundamentals:AAA')).toHaveLength(1)
    expect(calls.filter(c => c === 'qualitative:AAA')).toHaveLength(2)
    expect(db.count('lab_cycles')).toBe(1)
    expect(db.rows('lab_cycle_steps')[0].status).toBe('done')
  })

  it('reaches a decision exactly once, however many times it is resumed', async () => {
    const db = oneHolding()
    const calls: string[] = []
    const d = (q: any) => deps({ runFundamentals: stubFundamentals(db, calls), runQualitative: q })

    await runInvestmentCycle(asClient(db), USER, LAB, d(stubQualitativeTimeout(calls)))
    await runInvestmentCycle(asClient(db), USER, LAB, d(stubQualitativeOk(calls)))
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, d(stubQualitativeOk(calls)))

    const aaa = db.rows('lab_decisions').filter((r: Row) => r.symbol === 'AAA')
    expect(aaa).toHaveLength(1)
    expect(db.count('lab_trades')).toBe(0)        // the stub thesis produces a hold
    expect(summary.status).toBe('completed')      // the cycle finishes
  })

  it('persisted qualitative research is reused by a later cycle (item 4)', async () => {
    const db = oneHolding()
    const calls: string[] = []
    const d = () => deps({ runFundamentals: stubFundamentals(db, calls), runQualitative: stubQualitativeOk(calls) })

    await runInvestmentCycle(asClient(db), USER, LAB, d())
    await runInvestmentCycle(asClient(db), USER, LAB, d())

    // The expensive half is paid for once and reused.
    expect(calls.filter(c => c.startsWith('qualitative:'))).toHaveLength(1)
    expect(db.count('lab_research')).toBe(1)
  })

  it('cached fundamentals are not re-researched (item 4)', async () => {
    const db = oneHolding()
    // A fresh cache entry, exactly as a previous run would have left it.
    db.rows('inv_securities').push({
      id: 'sec-AAA', user_id: USER, symbol: 'AAA', exchange: 'NSE',
      company_name: FUND.company_name, sector: FUND.sector, market_cap_band: FUND.market_cap_band,
      fundamentals: FUND.fundamentals, valuation: FUND.valuation,
      data_confidence: FUND.data_confidence, sources: FUND.sources,
      fetched_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    })
    const calls: string[] = []
    // NOTE: the real fundamentals stage is used here — no stub. It goes through
    // the cache loader, which finds the entry and makes no provider call.
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      runQualitative: stubQualitativeOk(calls),
    }))

    expect(calls).toEqual(['qualitative:AAA'])     // fundamentals never fetched
    expect(db.count('inv_securities')).toBe(1)
    expect(db.rows('inv_securities')[0].fetched_at).toBe(NOW.toISOString())   // untouched
  })
})

describe('a stage is never started without the budget to finish it (item 3)', () => {
  it('stops before the research call when the invocation budget is spent', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 10_000, last_price: 1000 })],
    })
    const calls: string[] = []
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, deps({
      // Execution timing is code-owned now, so a spent budget is injected here
      // rather than stored on the account (Deploy #6, item 9).
      budget: createBudget({ totalMs: 55_000, now: Date.now() - 30_000 }),
      runFundamentals: stubFundamentals(db, calls),
      runQualitative: stubQualitativeOk(calls),
    }))

    expect(calls).toEqual([])                     // nothing expensive was attempted
    expect(summary.status).toBe('in_progress')
    expect(summary.resumable).toBe(true)
    expect(db.count('lab_decisions')).toBe(0)
  })
})

describe('discovery is resumable (item 9)', () => {
  it('a failed scan does not count as "no ideas"', async () => {
    const db = seedDb({ positions: [] })
    let scans = 0
    const failing = async () => { scans++; return { ideas: [], failure: 'TIMEOUT: aborted after 30000ms' } }

    const summary = await runInvestmentCycle(asClient(db), USER, LAB, deps({ discover: failing }))
    expect(scans).toBe(1)
    expect(summary.status).toBe('in_progress')
    expect(db.rows('lab_cycles')[0].cursor.discoveryRan).toBe(false)   // will scan again

    // The retry finds candidates, and they are persisted on the cursor.
    await runInvestmentCycle(asClient(db), USER, LAB, deps({
      discover: async () => ({ ideas: [{ symbol: 'BBB', exchange: 'NSE', company_name: 'BBB Ltd' }], failure: null }),
      analyze: async () => okAnalysis({ symbol: 'BBB', action: 'HOLD', price: 1000 }),
    }))
    const cursor = db.rows('lab_cycles')[0].cursor
    expect(cursor.discoveryRan).toBe(true)
    expect(cursor.discoveryQueue.length).toBe(1)
    expect(cursor.discoveryQueue[0]).toMatch(/idea:BBB:NSE/)
  })

  it('candidates survive the invocation that found them', async () => {
    const db = seedDb({
      positions: [],
    })
    let scans = 0
    const ideas = async () => {
      scans++
      return { ideas: [{ symbol: 'BBB', exchange: 'NSE', company_name: 'BBB Ltd' }, { symbol: 'CCC', exchange: 'NSE', company_name: 'CCC Ltd' }], failure: null }
    }
    const analyze = async (p: any) => okAnalysis({ symbol: p.symbol, action: 'HOLD', price: 1000 })

    await runInvestmentCycle(asClient(db), USER, LAB, deps({ discover: ideas, analyze, maxStagesPerInvocation: 1 }))
    await runInvestmentCycle(asClient(db), USER, LAB, deps({ discover: ideas, analyze, maxStagesPerInvocation: 1 }))

    expect(scans).toBe(1)                                  // scanned once, reused after
    expect(db.rows('lab_cycles')[0].cursor.discoveryQueue).toHaveLength(2)
    expect(db.rows('lab_cycle_steps').filter((s: Row) => s.kind === 'idea')).toHaveLength(2)
  })
})
