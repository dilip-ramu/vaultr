import { describe, it, expect } from 'vitest'
import {
  createBudget, unlimitedBudget, stopwatch,
  MIN_RESEARCH_STAGE_MS, CALL_RESERVE_MS, ROUTE_MAX_MS, SAFETY_MS,
} from '@/lib/investments/deadline'
import { researchJson, backoffMs } from '@/lib/investments/claude'
import { analyzeSymbol } from '@/lib/investments/analyzeCore'
import { analyzePortfolio } from '@/lib/investments/portfolio'
import { runInvestmentCycle } from '@/lib/investments/lab/cycle'
import { asClient, type Row } from './helpers/fake-supabase'
import { seedDb, position, fakePrices, fakeIndex, okAnalysis, budgetExhausted, USER, LAB, NOW } from './helpers/lab-fixture'
import { DEFAULT_LAB_CONSTRAINTS } from '@/lib/investments/lab/config'
import type { CASyncResult } from '@/lib/investments/lab/corporate-sync'
import type { FundamentalsResult } from '@/lib/investments/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The budget itself ───────────────────────────────────────────────────────

describe('request budget', () => {
  const now = 1_000_000

  it('reserves headroom from the platform wall', () => {
    const b = createBudget({ totalMs: ROUTE_MAX_MS, now })
    expect(b.deadline).toBe(now + ROUTE_MAX_MS - SAFETY_MS)
  })

  it('never hands a call the whole remaining time', () => {
    const b = createBudget({ totalMs: 30_000, now: Date.now() })
    expect(b.callTimeout()).toBeLessThanOrEqual(b.remaining() - CALL_RESERVE_MS)
  })

  it('refuses to start research it cannot finish', () => {
    const spent = createBudget({ totalMs: 10_000, now: Date.now() - 9_000 })
    expect(spent.enough(MIN_RESEARCH_STAGE_MS)).toBe(false)
    const fresh = createBudget({ totalMs: 60_000, now: Date.now() })
    expect(fresh.enough(MIN_RESEARCH_STAGE_MS)).toBe(true)
  })

  it('only allows a retry when a WHOLE further attempt fits', () => {
    const b = createBudget({ totalMs: 60_000, now: Date.now() })
    expect(b.retriesFor(45_000)).toBe(0)        // one attempt barely fits
    expect(b.retriesFor(10_000)).toBeGreaterThan(0)
  })

  it('an unlimited budget never blocks anything', () => {
    const u = unlimitedBudget()
    expect(u.enough(10_000_000)).toBe(true)
    expect(u.remaining()).toBe(Number.POSITIVE_INFINITY)
  })

  it('backoff honours Retry-After and stays bounded', () => {
    expect(backoffMs(0)).toBe(750)
    expect(backoffMs(10)).toBeLessThanOrEqual(20_000)
    expect(backoffMs(0, 5)).toBe(5_000)
  })

  it('the stopwatch records stage names only', async () => {
    const w = stopwatch()
    await w.time('fundamentals_ms', async () => 1)
    w.mark('scoring_ms', 3)
    expect(Object.keys(w.timings).sort()).toEqual(['fundamentals_ms', 'scoring_ms'])
  })
})

// ── The provider layer ──────────────────────────────────────────────────────

function stubFetch(handler: () => Promise<any>) {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => { calls++; return handler() }) as never
  return { count: () => calls, restore: () => { globalThis.fetch = original } }
}

describe('Anthropic calls respect the wall (item 4)', () => {
  const withKey = async (fn: () => Promise<void>) => {
    const prev = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    try { await fn() } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prev
    }
  }

  it('does not retry when another attempt could not finish in time', async () => {
    await withKey(async () => {
      const f = stubFetch(async () => ({ ok: false, status: 429, headers: { get: () => null }, text: async () => 'slow down' }))
      try {
        const r = await researchJson({
          prompt: 'x', retries: 3, timeoutMs: 30_000,
          deadline: Date.now() + 1_000,          // no room for a second attempt
          sleep: async () => {},
        })
        expect(r.failure!.kind).toBe('RATE_LIMITED')
        expect(f.count()).toBe(1)
      } finally { f.restore() }
    })
  })

  it('classifies an abort as TIMEOUT, never as thin evidence', async () => {
    await withKey(async () => {
      const f = stubFetch(async () => { throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }) })
      try {
        const r = await researchJson({ prompt: 'x', retries: 0, timeoutMs: 50, sleep: async () => {} })
        expect(r.failure!.kind).toBe('TIMEOUT')
        expect(r.data).toBe(null)
      } finally { f.restore() }
    })
  })

  it('reports a rejected key as AUTHENTICATION_ERROR, not as a data problem', async () => {
    await withKey(async () => {
      const f = stubFetch(async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => 'invalid x-api-key' }))
      try {
        const r = await researchJson({ prompt: 'x', retries: 2, sleep: async () => {} })
        expect(r.failure!.kind).toBe('AUTHENTICATION_ERROR')
        expect(f.count()).toBe(1)               // not retryable
      } finally { f.restore() }
    })
  })
})

// ── The analysis path ───────────────────────────────────────────────────────

const emptyPortfolio = analyzePortfolio([])
const fundamentals = (over: Partial<FundamentalsResult> = {}): FundamentalsResult => ({
  company_name: 'AAA Ltd', sector: 'IT', market_cap_band: 'large',
  fundamentals: { roe_pct: 18 }, valuation: { pe: 20 },
  data_confidence: 80, sources: [], cached: false, ...over,
})

describe('analysis stops before the wall instead of being killed (item 2)', () => {
  it('returns BUDGET_EXHAUSTED — never a recommendation — when time has run out', async () => {
    const spent = createBudget({ totalMs: 10_000, now: Date.now() - 9_500 })
    const outcome = await analyzeSymbol({
      symbol: 'AAA', exchange: 'NSE', isHolding: true,
      portfolio: emptyPortfolio, regimeState: 'neutral',
      budget: spent, persistsFundamentals: true,
      loadFundamentals: async () => fundamentals(),
      fetchPriceFn: async () => null,
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.failure.kind).toBe('BUDGET_EXHAUSTED')
    expect(outcome.failure.stage).toBe('qualitative')
    expect(outcome.failure.retryable).toBe(true)
    expect(outcome.failure.progressSaved).toBe(true)      // fundamentals were cached
    expect(outcome.failure.message).toMatch(/again/i)
    expect(outcome.failure.timings.fundamentals_ms).toBeGreaterThanOrEqual(0)
  })

  it('a timeout is reported as a TIMEOUT, never as INSUFFICIENT_DATA (item 4)', async () => {
    const outcome = await analyzeSymbol({
      symbol: 'AAA', exchange: 'NSE', isHolding: true,
      portfolio: emptyPortfolio, regimeState: 'neutral',
      budget: createBudget({ totalMs: 60_000 }),
      loadFundamentals: async () => fundamentals({
        data_confidence: 0, fundamentals: {}, valuation: {},
        failure: { kind: 'TIMEOUT', message: 'aborted after 30000ms', retryable: true, attempts: 1 },
      }),
      fetchPriceFn: async () => null,
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.failure.kind).toBe('TIMEOUT')
    expect(outcome.failure.stage).toBe('fundamentals')
    // The crucial property: no verdict of any kind was produced.
    expect((outcome as any).recommendation).toBeUndefined()
  })

  it('does not report progress saved when nothing was cached', async () => {
    const spent = createBudget({ totalMs: 10_000, now: Date.now() - 9_500 })
    const outcome = await analyzeSymbol({
      symbol: 'AAA', exchange: 'NSE', isHolding: false,
      portfolio: emptyPortfolio, regimeState: 'neutral',
      budget: spent,
      loadFundamentals: async () => fundamentals({ cached: true }),
      fetchPriceFn: async () => null,
    })
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.failure.progressSaved).toBe(false)
  })
})

// ── The cycle ───────────────────────────────────────────────────────────────

const noCorporate = async (): Promise<CASyncResult> => ({
  ran: false, dividends: 0, splits: 0, bonuses: 0, flagged: 0, skipped: 0,
  cashCredited: 0, notes: [], failure: null,
})

describe('a cycle that runs out of time yields and resumes (item 3)', () => {
  const setup = () => seedDb({
    positions: [
      position({ symbol: 'AAA', quantity: 10, cost_basis: 10_000, last_price: 1000 }),
      position({ id: 'pos-BBB', symbol: 'BBB', quantity: 10, cost_basis: 10_000, last_price: 1000 }),
    ],
  })
  const deps = (analyze: any) => ({
    now: () => NOW,
    syncCorporate: noCorporate as never,
    discover: async () => [],
    analyze,
    markOptions: { now: NOW, fetchPricesFn: fakePrices({ AAA: 1000, BBB: 1000 }) as never, fetchIndexQuoteFn: fakeIndex() },
  })

  it('leaves the step claimed, keeps the cursor, and records no decision', async () => {
    const db = setup()
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, deps(async () => budgetExhausted(true)))

    expect(summary.status).toBe('in_progress')
    expect(summary.resumable).toBe(true)
    expect(summary.remaining).toBeGreaterThan(0)

    const cycle = db.rows('lab_cycles')[0]
    expect(cycle.status).toBe('in_progress')
    expect(cycle.cursor.holdingIndex).toBe(0)                 // cursor did NOT advance
    expect(db.rows('lab_cycle_steps')[0].status).toBe('claimed')
    expect(db.count('lab_trades')).toBe(0)
    // Nothing that looks like a verdict was written for the symbol.
    expect(db.rows('lab_decisions').filter((d: Row) => d.symbol === 'AAA')).toHaveLength(0)
  })

  it('the next invocation finishes that same step exactly once', async () => {
    const db = setup()
    const log: string[] = []
    const record = (impl: any) => async (p: any) => { log.push(p.symbol); return impl(p) }

    await runInvestmentCycle(asClient(db), USER, LAB, deps(record(async () => budgetExhausted(true))))
    expect(log).toEqual(['AAA'])

    await runInvestmentCycle(asClient(db), USER, LAB, deps(record(async (p: any) =>
      okAnalysis({ symbol: p.symbol, action: 'HOLD', price: 1000 }))))

    // Resumed at the SAME step. It then had budget left and moved on to BBB —
    // which is the point: the cursor advances, it never restarts.
    expect(log.filter(x => x === 'AAA')).toHaveLength(2)
    expect(log[0]).toBe('AAA')
    expect(log[1]).toBe('AAA')
    expect(db.count('lab_cycles')).toBe(1)                    // same cycle, not a new one
    const steps = db.rows('lab_cycle_steps')
    expect(steps.filter((x: Row) => x.step_key === 'holding:AAA:NSE')).toHaveLength(1)
    expect(steps.find((x: Row) => x.step_key === 'holding:AAA:NSE')!.status).toBe('done')
    // Exactly one decision for AAA — the retry did not duplicate it.
    expect(db.rows('lab_decisions').filter((d: Row) => d.symbol === 'AAA')).toHaveLength(1)
    expect(db.count('lab_trades')).toBe(0)                    // HOLD trades nothing
  })

  it('a buy interrupted by the budget is never executed twice', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 10_000, last_price: 1000 })],
    })
    const buy = async (p: any) => okAnalysis({ symbol: p.symbol, action: 'STRONG_BUY', price: 1000, maxAllocPct: 10 })
    const d = (a: any) => ({ ...deps(a), maxStagesPerInvocation: 1 })

    await runInvestmentCycle(asClient(db), USER, LAB, d(buy))
    const tradesAfterFirst = db.count('lab_trades')
    expect(tradesAfterFirst).toBe(1)

    // Simulate the invocation dying after the trade but before the cursor saved.
    const step = db.rows('lab_cycle_steps').find((x: Row) => x.step_key === 'holding:AAA:NSE')!
    step.status = 'claimed'
    db.rows('lab_cycles')[0].cursor = { ...db.rows('lab_cycles')[0].cursor, holdingIndex: 0 }

    await runInvestmentCycle(asClient(db), USER, LAB, d(buy))
    expect(db.count('lab_trades')).toBe(1)                    // still one
    expect(db.rows('lab_decisions').filter((d: Row) => d.symbol === 'AAA' && d.kind === 'add')).toHaveLength(1)
  })
})
