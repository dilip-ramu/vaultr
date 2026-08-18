// Cost and efficiency (efficiency pass).
//
// The Lab consumed a $5 credit without recording a single completed decision.
// The cause was configuration, not investment logic: every research call went to
// the expensive model with six web searches, search results are billed as input
// tokens and re-sent on every internal iteration, and a scan's leftover
// candidates were thrown away and re-bought on the next cycle.
//
// These tests pin down the fix. NONE of them makes a network call: `fetch` is
// replaced with a fake for the transport tests, and everything else uses the
// in-memory Supabase and the existing stage seams.

import { describe, it, expect } from 'vitest'
import {
  routeFor, estimateCallCost, addUsage, emptyTotals, emptyUsage, priceFor,
  MODELS, WEB_SEARCH_USD, ALL_TASKS, type CallUsage,
} from '@/lib/investments/models'
import { researchJson, resolveCall } from '@/lib/investments/claude'
import { getFundamentals } from '@/lib/investments/providers/fundamentals'
import { runQualitativeStage } from '@/lib/investments/analyzeStages'
import { makeCachedFundamentalsLoader } from '@/lib/investments/lab/research-cache'
import { readCarryOverCandidates } from '@/lib/investments/lab/cycle-state'
import { runInvestmentCycle } from '@/lib/investments/lab/cycle'
import { asClient, FakeSupabase } from './helpers/fake-supabase'
import { seedDb, position, fakePrices, fakeIndex, USER, LAB, NOW } from './helpers/lab-fixture'
import type { CASyncResult } from '@/lib/investments/lab/corporate-sync'
import type { StageResult, QualitativeResearch } from '@/lib/investments/analyzeStages'
import type { FundamentalsResult } from '@/lib/investments/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── A fake Anthropic endpoint. Records every request body so the tests can
//    assert WHICH model and HOW MANY searches were actually asked for. ───────

interface FakeCall { model: string; maxTokens: number; maxUses: number | null; system: string | null }

function fakeAnthropic(opts: {
  body?: unknown
  usage?: Record<string, unknown>
  status?: number
} = {}) {
  const calls: FakeCall[] = []
  const original = globalThis.fetch
  const key = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real'

  globalThis.fetch = (async (_url: string, init: any) => {
    const sent = JSON.parse(init.body)
    const tool = (sent.tools ?? [])[0]
    calls.push({
      model: sent.model,
      maxTokens: sent.max_tokens,
      maxUses: tool ? tool.max_uses : null,
      system: sent.system ?? null,
    })
    if (opts.status && opts.status >= 400) {
      return {
        ok: false, status: opts.status,
        headers: { get: () => null },
        text: async () => 'upstream said no',
      }
    }
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({
        model: sent.model,
        content: [{ type: 'text', text: JSON.stringify(opts.body ?? { ok: true }) }],
        usage: opts.usage ?? {
          input_tokens: 40_000, output_tokens: 900,
          server_tool_use: { web_search_requests: 4 },
        },
      }),
    }
  }) as never

  return {
    calls,
    restore() {
      globalThis.fetch = original
      if (key === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = key
    },
  }
}

// ── 1. Model routing ────────────────────────────────────────────────────────

describe('model routing separates extraction from judgement', () => {
  it('sends mechanical extraction to the cheap model', () => {
    expect(routeFor('fundamentals').model).toBe(MODELS.fast)
    expect(routeFor('corporate').model).toBe(MODELS.fast)
    expect(routeFor('connectivity').model).toBe(MODELS.fast)
  })

  it('keeps every judgement call on the strong model', () => {
    expect(routeFor('qualitative').model).toBe(MODELS.analysis)
    expect(routeFor('discovery').model).toBe(MODELS.analysis)
    expect(routeFor('regime').model).toBe(MODELS.analysis)
  })

  it('never lets a route ask for more searches than the old flat six', () => {
    for (const task of ALL_TASKS) {
      expect(routeFor(task).maxUses).toBeLessThanOrEqual(6)
      expect(routeFor(task).maxUses).toBeGreaterThanOrEqual(1)
    }
  })

  it('gives every route an output ceiling big enough not to truncate JSON', () => {
    for (const task of ALL_TASKS) {
      if (task === 'connectivity') continue
      expect(routeFor(task).maxTokens).toBeGreaterThanOrEqual(3072)
    }
  })
})

describe('resolveCall applies the route, the override and the cap in that order', () => {
  it('uses the task route when nothing is overridden', () => {
    const r = resolveCall({ prompt: 'x', task: 'fundamentals' })
    expect(r.model).toBe(MODELS.fast)
    expect(r.maxUses).toBe(routeFor('fundamentals').maxUses)
  })

  it('lets an explicit model and search count win over the route', () => {
    const r = resolveCall({ prompt: 'x', task: 'fundamentals', model: 'claude-opus-4', maxUses: 2 })
    expect(r.model).toBe('claude-opus-4')
    expect(r.maxUses).toBe(2)
  })

  it('treats the lab ceiling as a limit — it lowers a budget', () => {
    const r = resolveCall({ prompt: 'x', task: 'qualitative', maxUsesCap: 2 })
    expect(r.maxUses).toBe(2)
  })

  it('and NEVER as an instruction — a high ceiling cannot raise a budget', () => {
    const wanted = routeFor('fundamentals').maxUses
    const r = resolveCall({ prompt: 'x', task: 'fundamentals', maxUsesCap: 50 })
    expect(r.maxUses).toBe(wanted)
  })

  it('falls back to the old defaults when no task is given', () => {
    const r = resolveCall({ prompt: 'x' })
    expect(r.model).toBe(MODELS.analysis)
    expect(r.maxUses).toBe(6)
  })
})

// ── 2. The routing actually reaches the wire ────────────────────────────────

describe('the routed model and search budget are what is sent to Anthropic', () => {
  it('fundamentals research asks for the cheap model', async () => {
    const fake = fakeAnthropic({ body: { company_name: 'AAA Ltd', data_confidence: 70, fundamentals: {}, valuation: {} } })
    try {
      const r = await getFundamentals({ symbol: 'AAA', exchange: 'NSE' })
      expect(fake.calls).toHaveLength(1)
      expect(fake.calls[0].model).toBe(MODELS.fast)
      expect(fake.calls[0].maxUses).toBe(routeFor('fundamentals').maxUses)
      expect(r.data_confidence).toBe(70)
    } finally { fake.restore() }
  })

  it('the qualitative judgement stays on the strong model', async () => {
    const fake = fakeAnthropic({ body: { qualitative: { business_quality: 70 }, bull_case: 'b' } })
    try {
      const r = await runQualitativeStage({
        symbol: 'AAA', exchange: 'NSE', currentPrice: 100, regimeState: 'neutral',
        fundamentals: { company_name: 'AAA', sector: null, market_cap_band: null, fundamentals: {}, valuation: {}, data_confidence: 60, sources: [] },
        now: () => NOW,
      })
      expect(r.ok).toBe(true)
      expect(fake.calls[0].model).toBe(MODELS.analysis)
      expect(fake.calls[0].maxUses).toBe(routeFor('qualitative').maxUses)
    } finally { fake.restore() }
  })

  it('a lab ceiling of 2 lowers the qualitative search budget on the wire', async () => {
    const fake = fakeAnthropic({ body: { qualitative: {} } })
    try {
      await runQualitativeStage({
        symbol: 'AAA', exchange: 'NSE', currentPrice: 100, regimeState: 'neutral',
        fundamentals: { company_name: 'AAA', sector: null, market_cap_band: null, fundamentals: {}, valuation: {}, data_confidence: 60, sources: [] },
        research: { maxUsesCap: 2 }, now: () => NOW,
      })
      expect(fake.calls[0].maxUses).toBe(2)
    } finally { fake.restore() }
  })
})

// ── 3. Usage reporting ──────────────────────────────────────────────────────

describe('what a call consumed is read from the API, never assumed', () => {
  it('reports the token counts and search count the response carried', async () => {
    const fake = fakeAnthropic({
      usage: { input_tokens: 12_345, output_tokens: 678, server_tool_use: { web_search_requests: 3 } },
    })
    try {
      const r = await researchJson({ prompt: 'x', task: 'fundamentals' })
      expect(r.usage!.inputTokens).toBe(12_345)
      expect(r.usage!.outputTokens).toBe(678)
      expect(r.usage!.webSearches).toBe(3)
      expect(r.usage!.model).toBe(MODELS.fast)
    } finally { fake.restore() }
  })

  it('reports UNKNOWN, not zero, when a call fails before returning', async () => {
    const fake = fakeAnthropic({ status: 500 })
    try {
      const r = await researchJson({ prompt: 'x', task: 'fundamentals', retries: 0 })
      expect(r.failure!.kind).toBe('PROVIDER_ERROR')
      // A failed call may still have been billed. Saying "0" would be a lie.
      expect(r.usage!.inputTokens).toBeNull()
      expect(r.usage!.webSearches).toBeNull()
    } finally { fake.restore() }
  })

  it('records usage even when the answer could not be parsed', async () => {
    const fake = fakeAnthropic({ body: undefined })
    try {
      const original = globalThis.fetch
      globalThis.fetch = (async () => ({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({
          model: MODELS.fast,
          content: [{ type: 'text', text: 'not json at all' }],
          usage: { input_tokens: 500, output_tokens: 10 },
        }),
      })) as never
      const r = await researchJson({ prompt: 'x', task: 'fundamentals' })
      globalThis.fetch = original
      expect(r.failure!.kind).toBe('PARSE_ERROR')
      // The money was spent whether or not we could read the answer.
      expect(r.usage!.inputTokens).toBe(500)
    } finally { fake.restore() }
  })
})

// ── 4. Cost estimation ──────────────────────────────────────────────────────

describe('cost estimation is arithmetic on a price list, clearly labelled', () => {
  const usage = (over: Partial<CallUsage> = {}): CallUsage => ({
    ...emptyUsage(MODELS.analysis),
    inputTokens: 100_000, outputTokens: 2_000, webSearches: 5,
    ...over,
  })

  it('prices the strong model at its published rate', () => {
    const e = estimateCallCost(usage())
    // 100k in @ $3/MTok + 2k out @ $15/MTok + 5 searches @ $0.01
    expect(e.usd).toBeCloseTo(0.3 + 0.03 + 0.05, 6)
    expect(e.estimated).toBe(true)
  })

  it('prices the cheap model at roughly a third of the strong one', () => {
    const strong = estimateCallCost(usage())!.usd!
    const cheap = estimateCallCost(usage({ model: MODELS.fast }))!.usd!
    expect(cheap).toBeLessThan(strong)
    // tokens are 1/3 the price; the flat search fee is the same either way
    expect(cheap).toBeCloseTo(0.1 + 0.01 + 0.05, 6)
  })

  it('charges the published web-search fee per search', () => {
    const none = estimateCallCost(usage({ webSearches: 0 }))!.usd!
    const five = estimateCallCost(usage({ webSearches: 5 }))!.usd!
    expect(five - none).toBeCloseTo(5 * WEB_SEARCH_USD, 6)
  })

  it('returns null — not zero — for a model it has no price for', () => {
    const e = estimateCallCost(usage({ model: 'some-other-vendor-model' }))
    expect(e.usd).toBeNull()
    expect(e.reason).toMatch('no price list')
  })

  it('returns null when the call reported nothing at all', () => {
    const e = estimateCallCost(emptyUsage(MODELS.analysis))
    expect(e.usd).toBeNull()
  })

  it('knows the price of both models it routes to', () => {
    expect(priceFor(MODELS.analysis)).not.toBeNull()
    expect(priceFor(MODELS.fast)).not.toBeNull()
  })
})

describe('running totals stay honest about what they could not price', () => {
  it('adds token counts, searches and estimated dollars', () => {
    let t = emptyTotals()
    t = addUsage(t, { ...emptyUsage(MODELS.fast), inputTokens: 10_000, outputTokens: 500, webSearches: 2 })
    t = addUsage(t, { ...emptyUsage(MODELS.analysis), inputTokens: 20_000, outputTokens: 800, webSearches: 3 })
    expect(t.calls).toBe(2)
    expect(t.inputTokens).toBe(30_000)
    expect(t.webSearches).toBe(5)
    expect(t.estimatedUsd).toBeGreaterThan(0)
    expect(t.unpricedCalls).toBe(0)
    expect(t.byModel[MODELS.fast].calls).toBe(1)
    expect(t.byModel[MODELS.analysis].calls).toBe(1)
  })

  it('counts a call it could not price instead of silently dropping it', () => {
    let t = emptyTotals()
    t = addUsage(t, { ...emptyUsage('mystery-model'), inputTokens: 5_000 })
    expect(t.calls).toBe(1)
    expect(t.unpricedCalls).toBe(1)
    expect(t.estimatedUsd).toBe(0)   // and the total therefore reads "at least"
  })
})

// ── 5. Caches: a hit must cost nothing ──────────────────────────────────────

describe('a cache hit makes no call at all', () => {
  it('fresh fundamentals are served from storage without touching the API', async () => {
    const fake = fakeAnthropic()
    try {
      const db = new FakeSupabase({
        inv_securities: [{
          id: 's1', user_id: USER, symbol: 'AAA', exchange: 'NSE',
          company_name: 'AAA Ltd', sector: 'IT', market_cap_band: 'large',
          fundamentals: { roe_pct: 20 }, valuation: { pe: 18 },
          data_confidence: 80, sources: [],
          fetched_at: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(),
        }],
      })
      const events: { hit: boolean }[] = []
      const load = makeCachedFundamentalsLoader({
        supabase: asClient(db), userId: USER, ttlHours: 168, now: NOW,
        onEvent: e => events.push({ hit: e.hit }),
      })
      const r = await load({ symbol: 'AAA', exchange: 'NSE' })
      expect(r.cached).toBe(true)
      expect(events[0].hit).toBe(true)
      expect(fake.calls).toHaveLength(0)      // THE point of the cache
      expect(r.usage).toBeUndefined()         // nothing was spent, so nothing is reported
    } finally { fake.restore() }
  })

  it('a stale entry falls through to a real call, and the call is the cheap one', async () => {
    const fake = fakeAnthropic({ body: { company_name: 'AAA Ltd', data_confidence: 71, fundamentals: {}, valuation: {} } })
    try {
      const db = new FakeSupabase({
        inv_securities: [{
          id: 's1', user_id: USER, symbol: 'AAA', exchange: 'NSE',
          data_confidence: 80, fundamentals: {}, valuation: {}, sources: [],
          fetched_at: new Date(NOW.getTime() - 400 * 3_600_000).toISOString(),
        }],
      })
      const load = makeCachedFundamentalsLoader({ supabase: asClient(db), userId: USER, ttlHours: 168, now: NOW })
      const r = await load({ symbol: 'AAA', exchange: 'NSE' })
      expect(r.cached).toBe(false)
      expect(fake.calls).toHaveLength(1)
      expect(fake.calls[0].model).toBe(MODELS.fast)
    } finally { fake.restore() }
  })
})

// ── 6. Candidates survive the cycle that found them ─────────────────────────

const candidateCycle = (over: Record<string, unknown> = {}) => ({
  id: 'cyc-old', lab_id: LAB, user_id: USER, status: 'completed', phase: 'done',
  cursor: {
    holdingQueue: [], holdingIndex: 0,
    discoveryQueue: ['idea:AAA:NSE|AAA Ltd', 'idea:BBB:NSE|BBB Ltd', 'idea:CCC:NSE|CCC Ltd'],
    discoveryIndex: 1, discoveryRan: true, markDone: true, corporateDone: true,
  },
  counters: {},
  trading_date: '2026-08-15', model_version: 'v1', summary: {},
  started_at: new Date(NOW.getTime() - 20 * 3_600_000).toISOString(),
  updated_at: new Date(NOW.getTime() - 20 * 3_600_000).toISOString(),
  completed_at: new Date(NOW.getTime() - 20 * 3_600_000).toISOString(),
  ...over,
})

describe('unevaluated candidates are reused instead of re-bought', () => {
  it('returns the names the previous cycle never got to', async () => {
    const db = new FakeSupabase({ lab_cycles: [candidateCycle()] })
    const r = await readCarryOverCandidates({
      supabase: asClient(db), userId: USER, labId: LAB, ttlHours: 48, now: NOW,
    })
    expect(r!.entries).toHaveLength(2)      // index was 1 of 3
    expect(r!.entries[0]).toMatch('BBB')
  })

  it('drops anything now held — a holding is not a new idea', async () => {
    const db = new FakeSupabase({ lab_cycles: [candidateCycle()] })
    const r = await readCarryOverCandidates({
      supabase: asClient(db), userId: USER, labId: LAB, ttlHours: 48, now: NOW, exclude: ['BBB'],
    })
    expect(r!.entries).toHaveLength(1)
    expect(r!.entries[0]).toMatch('CCC')
  })

  it('refuses candidates older than the TTL — stale ideas are not free quality', async () => {
    const old = new Date(NOW.getTime() - 200 * 3_600_000).toISOString()
    const db = new FakeSupabase({
      lab_cycles: [candidateCycle({ updated_at: old, completed_at: old, started_at: old })],
    })
    const r = await readCarryOverCandidates({
      supabase: asClient(db), userId: USER, labId: LAB, ttlHours: 48, now: NOW,
    })
    expect(r).toBeNull()
  })

  it('ignores a cycle that is still open — its queue is still being worked', async () => {
    const db = new FakeSupabase({ lab_cycles: [candidateCycle({ status: 'in_progress' })] })
    const r = await readCarryOverCandidates({
      supabase: asClient(db), userId: USER, labId: LAB, ttlHours: 48, now: NOW,
    })
    expect(r).toBeNull()
  })

  it('returns null when every candidate was already evaluated', async () => {
    const db = new FakeSupabase({
      lab_cycles: [candidateCycle({ cursor: { ...candidateCycle().cursor, discoveryIndex: 3 } })],
    })
    const r = await readCarryOverCandidates({
      supabase: asClient(db), userId: USER, labId: LAB, ttlHours: 48, now: NOW,
    })
    expect(r).toBeNull()
  })
})

// ── 7. The cycle spends the carry-over instead of a scan ────────────────────

const noCorporate = async (): Promise<CASyncResult> => ({
  ran: false, dividends: 0, splits: 0, bonuses: 0, flagged: 0, skipped: 0,
  cashCredited: 0, notes: [], failure: null,
})

const FUND: FundamentalsResult = {
  company_name: 'AAA Ltd', sector: 'IT', market_cap_band: 'large',
  fundamentals: { roe_pct: 20 }, valuation: { pe: 18 },
  data_confidence: 82, sources: [],
}

const QUAL: QualitativeResearch = {
  qualitative: { business_quality: 40, management: 40, industry: 40, moat: 40 },
  fair_value_low: null, fair_value_high: null, entry_low: null, entry_high: null,
  horizon: '3 years', bull_case: 'b', base_case: 'b', bear_case: 'b',
  catalysts: [], risks: [], invalidation: [], why_now: null, thesis_invalidated: false,
  sources: [], researched_at: NOW.toISOString(), regime: 'neutral',
}

const stubStages = (db: any, calls: string[], usage?: { fund?: CallUsage; qual?: CallUsage }) => ({
  runFundamentals: async (p: any): Promise<StageResult<FundamentalsResult>> => {
    calls.push(`fundamentals:${p.symbol}`)
    db.rows('inv_securities').push({
      id: `sec-${p.symbol}`, user_id: USER, symbol: p.symbol, exchange: p.exchange,
      company_name: FUND.company_name, sector: FUND.sector, market_cap_band: FUND.market_cap_band,
      fundamentals: FUND.fundamentals, valuation: FUND.valuation,
      data_confidence: FUND.data_confidence, sources: FUND.sources,
      fetched_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    })
    return { ok: true, value: { ...FUND, cached: false }, usage: usage?.fund }
  },
  runQualitative: async (p: any): Promise<StageResult<QualitativeResearch>> => {
    calls.push(`qualitative:${p.symbol}`)
    return { ok: true, value: QUAL, usage: usage?.qual }
  },
})

const baseDeps = (over: Record<string, unknown>) => ({
  now: () => NOW,
  syncCorporate: noCorporate as never,
  fetchPriceFn: async () => ({ symbol: 'X.NS', price: 500, currency: 'INR', at: NOW.toISOString(), marketTime: null }),
  markOptions: { now: NOW, fetchPricesFn: fakePrices({}) as never, fetchIndexQuoteFn: fakeIndex() },
  ...over,
})

describe('the cycle pays for an idea scan only when it has to', () => {
  it('reuses carried candidates and never calls discovery', async () => {
    const db = seedDb()
    const calls: string[] = []
    let discoverCalls = 0
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, baseDeps({
      ...stubStages(db, calls),
      discover: async () => { discoverCalls++; return { ideas: [{ symbol: 'ZZZ' }], failure: null } },
      readCandidates: async () => ({ entries: ['idea:BBB:NSE|BBB Ltd'], fromCycleId: 'cyc-old', ageHours: 20 }),
    }) as never)
    expect(discoverCalls).toBe(0)
    expect(calls).toContain('fundamentals:BBB')
    expect(summary.notes.join(' ')).toMatch('Reused 1 candidate')
  })

  it('still researches a carried candidate from scratch — reuse is not a shortcut', async () => {
    const db = seedDb()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, baseDeps({
      ...stubStages(db, calls),
      discover: async () => ({ ideas: [], failure: null }),
      readCandidates: async () => ({ entries: ['idea:BBB:NSE|BBB Ltd'], fromCycleId: 'c', ageHours: 1 }),
    }) as never)
    expect(calls).toContain('fundamentals:BBB')
    expect(calls).toContain('qualitative:BBB')
  })

  it('scans when there is nothing to carry over', async () => {
    const db = seedDb()
    const calls: string[] = []
    let discoverCalls = 0
    await runInvestmentCycle(asClient(db), USER, LAB, baseDeps({
      ...stubStages(db, calls),
      discover: async () => { discoverCalls++; return { ideas: [{ symbol: 'ZZZ' }], failure: null } },
      readCandidates: async () => null,
    }) as never)
    expect(discoverCalls).toBe(1)
    expect(calls).toContain('fundamentals:ZZZ')
  })

  it('a failed scan is still not treated as "no ideas"', async () => {
    const db = seedDb()
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, baseDeps({
      ...stubStages(db, calls),
      discover: async () => ({ ideas: [], failure: 'RATE_LIMITED: slow down' }),
      readCandidates: async () => null,
    }) as never)
    const cycle = db.rows('lab_cycles')[0]
    expect(cycle.cursor.discoveryRan).toBe(false)   // so the next run scans again
    expect(cycle.cursor.discoveryQueue).toHaveLength(0)
  })
})

// ── 8. The cycle records what it spent ──────────────────────────────────────

describe('a cycle records its own consumption', () => {
  const fundUsage: CallUsage = {
    model: MODELS.fast, inputTokens: 30_000, outputTokens: 600,
    cacheReadTokens: null, cacheWriteTokens: null, webSearches: 4,
  }
  const qualUsage: CallUsage = {
    model: MODELS.analysis, inputTokens: 60_000, outputTokens: 1_200,
    cacheReadTokens: null, cacheWriteTokens: null, webSearches: 5,
  }

  it('folds each call into the cycle counters, by model', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 5_000, last_price: 500 })] })
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, baseDeps({
      ...stubStages(db, calls, { fund: fundUsage, qual: qualUsage }),
      discover: async () => ({ ideas: [], failure: null }),
      readCandidates: async () => null,
      markOptions: { now: NOW, fetchPricesFn: fakePrices({ AAA: 500 }) as never, fetchIndexQuoteFn: fakeIndex() },
    }) as never)

    const usage = db.rows('lab_cycles')[0].counters.usage
    expect(usage.calls).toBe(2)
    expect(usage.inputTokens).toBe(90_000)
    expect(usage.webSearches).toBe(9)         // measured, not the 12 we allowed
    expect(usage.byModel[MODELS.fast].calls).toBe(1)
    expect(usage.byModel[MODELS.analysis].calls).toBe(1)
    expect(usage.estimatedUsd).toBeGreaterThan(0)
    expect(usage.unpricedCalls).toBe(0)
  })

  it('writes the model and the estimated cost onto each stage log line', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 5_000, last_price: 500 })] })
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, baseDeps({
      ...stubStages(db, calls, { fund: fundUsage, qual: qualUsage }),
      discover: async () => ({ ideas: [], failure: null }),
      readCandidates: async () => null,
      markOptions: { now: NOW, fetchPricesFn: fakePrices({ AAA: 500 }) as never, fetchIndexQuoteFn: fakeIndex() },
    }) as never)

    const log = (db.rows('lab_cycles')[0].summary.stageLog ?? []) as any[]
    const fundLine = log.find(l => l.stage === 'fundamentals' && l.outcome === 'completed')
    expect(fundLine.model).toBe(MODELS.fast)
    expect(fundLine.webSearches).toBe(4)
    expect(fundLine.estimatedUsd).toBeGreaterThan(0)
    expect(fundLine.cacheHit).toBe(false)
  })

  it('a qualitative cache hit is logged as a zero-cost line', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 5_000, last_price: 500 })] })
    db.rows('lab_research').push({
      id: 'lr-1', user_id: USER, symbol: 'AAA', exchange: 'NSE',
      qualitative: { qualitative: QUAL.qualitative, horizon: '3 years' },
      sources: [], regime_at_research: 'neutral',
      fetched_at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
    })
    const calls: string[] = []
    await runInvestmentCycle(asClient(db), USER, LAB, baseDeps({
      ...stubStages(db, calls, { fund: fundUsage, qual: qualUsage }),
      discover: async () => ({ ideas: [], failure: null }),
      readCandidates: async () => null,
      markOptions: { now: NOW, fetchPricesFn: fakePrices({ AAA: 500 }) as never, fetchIndexQuoteFn: fakeIndex() },
    }) as never)

    expect(calls).not.toContain('qualitative:AAA')   // no second call was made
    const log = (db.rows('lab_cycles')[0].summary.stageLog ?? []) as any[]
    const hit = log.find(l => l.stage === 'qualitative' && l.cacheHit === true)
    expect(hit.estimatedUsd).toBe(0)
    expect(hit.webSearches).toBe(0)
  })
})
