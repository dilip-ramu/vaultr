import { describe, it, expect } from 'vitest'
import { runInvestmentCycle } from '@/lib/investments/lab/cycle'
import { asClient, type Row } from './helpers/fake-supabase'
import {
  seedDb, position, fakePrices, fakeIndex, USER, LAB, NOW,
  okAnalysis, failedAnalysis, analyzeRouter,
} from './helpers/lab-fixture'
import { DEFAULT_LAB_CONSTRAINTS } from '@/lib/investments/lab/config'
import type { CASyncResult } from '@/lib/investments/lab/corporate-sync'

/* eslint-disable @typescript-eslint/no-explicit-any */

const noCorporate = async (): Promise<CASyncResult> => ({
  ran: false, dividends: 0, splits: 0, bonuses: 0, flagged: 0, skipped: 0,
  cashCredited: 0, notes: [], failure: null,
})

const deps = (over: Record<string, unknown>) => ({
  now: () => NOW,
  syncCorporate: noCorporate as never,
  discover: async () => [],
  markOptions: { now: NOW, fetchIndexQuoteFn: fakeIndex() },
  ...over,
})

const withPrices = (prices: Record<string, number | null>, over: Record<string, unknown> = {}) =>
  deps({ ...over, markOptions: { now: NOW, fetchPricesFn: fakePrices(prices) as never, fetchIndexQuoteFn: fakeIndex() } })

describe('cycle — buy', () => {
  it('decreases cash, creates the position, and records the trade and decision exactly once', async () => {
    const db = seedDb({ positions: [] })
    const log: string[] = []
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, withPrices({ BBB: 500 }, {
      discover: async () => [{ symbol: 'BBB', exchange: 'NSE', company_name: 'BBB Ltd' }],
      analyze: analyzeRouter({ BBB: okAnalysis({ symbol: 'BBB', action: 'BUY', price: 500 }) }, log),
    }))

    expect(summary.bought).toEqual(['BBB'])
    expect(summary.status).toBe('completed')

    expect(db.count('lab_trades')).toBe(1)
    const trade = db.rows('lab_trades')[0]
    expect(trade.side).toBe('buy')
    expect(trade.quantity).toBe(200)                      // 10% of ₹10L at ₹500
    expect(trade.step_id).toBeTruthy()

    const buys = db.rows('lab_decisions').filter((d: Row) => d.kind === 'buy')
    expect(buys.length).toBe(1)
    expect(buys[0].step_id).toBe(trade.step_id)

    const pos = db.rows('lab_positions')
    expect(pos.length).toBe(1)
    expect(pos[0].symbol).toBe('BBB')
    expect(pos[0].quantity).toBe(200)

    const cash = db.rows('lab_accounts')[0].cash
    expect(cash).toBeLessThan(1_000_000)
    expect(cash).toBe(trade.cash_after)
  })
})

describe('cycle — sell', () => {
  it('closes the position, realises a profit, and returns cash', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1100 })] })
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, withPrices({ AAA: 1200 }, {
      analyze: analyzeRouter({ AAA: okAnalysis({ symbol: 'AAA', action: 'SELL', price: 1200 }) }),
    }))

    expect(summary.sold).toEqual(['AAA'])
    expect(db.count('lab_trades')).toBe(1)
    const trade = db.rows('lab_trades')[0]
    expect(trade.side).toBe('sell')
    expect(trade.quantity).toBe(100)
    expect(trade.realized_pnl).toBeGreaterThan(19_000)
    expect(db.count('lab_positions')).toBe(0)             // fully closed
    expect(db.rows('lab_accounts')[0].cash).toBeGreaterThan(1_100_000)
  })
})

describe('cycle — resumability (item 1)', () => {
  const threeHoldings = () => seedDb({
    lab: { constraints: { ...DEFAULT_LAB_CONSTRAINTS, max_analyses_per_invocation: 1 } } as never,
    positions: [
      position({ symbol: 'AAA', quantity: 10, cost_basis: 10_000, last_price: 1000 }),
      position({ symbol: 'BBB', quantity: 10, cost_basis: 10_000, last_price: 1000 }),
      position({ symbol: 'CCC', quantity: 10, cost_basis: 10_000, last_price: 1000 }),
    ],
  })
  const holds = {
    AAA: okAnalysis({ symbol: 'AAA', action: 'HOLD', price: 1000 }),
    BBB: okAnalysis({ symbol: 'BBB', action: 'HOLD', price: 1000 }),
    CCC: okAnalysis({ symbol: 'CCC', action: 'HOLD', price: 1000 }),
  }

  it('stops at its invocation budget and resumes at the NEXT position, not the first', async () => {
    const db = threeHoldings()
    const log: string[] = []
    const d = () => withPrices({ AAA: 1000, BBB: 1000, CCC: 1000 }, { analyze: analyzeRouter(holds, log) })

    const first = await runInvestmentCycle(asClient(db), USER, LAB, d())
    expect(log).toEqual(['AAA'])
    expect(first.status).toBe('in_progress')
    expect(first.resumable).toBe(true)
    expect(first.remaining).toBeGreaterThan(0)

    const second = await runInvestmentCycle(asClient(db), USER, LAB, d())
    expect(log).toEqual(['AAA', 'BBB'])                   // did NOT restart at AAA
    expect(second.cycleId).toBe(first.cycleId)            // same cycle continued

    const third = await runInvestmentCycle(asClient(db), USER, LAB, d())
    expect(log).toEqual(['AAA', 'BBB', 'CCC'])
    expect(third.status).toBe('completed')
    expect(db.count('lab_cycles')).toBe(1)
  })

  it('keeps one open cycle and one step per unit of work', async () => {
    const db = threeHoldings()
    const d = () => withPrices({ AAA: 1000, BBB: 1000, CCC: 1000 }, { analyze: analyzeRouter(holds) })
    await runInvestmentCycle(asClient(db), USER, LAB, d())
    await runInvestmentCycle(asClient(db), USER, LAB, d())
    expect(db.count('lab_cycle_steps')).toBe(2)
    expect(db.rows('lab_cycle_steps').every((s: Row) => s.status === 'done')).toBe(true)
  })
})

describe('cycle — retry does not execute the same trade twice (item 1)', () => {
  it('recovers an interrupted step from the trade log instead of re-trading', async () => {
    const db = seedDb({
      lab: { constraints: { ...DEFAULT_LAB_CONSTRAINTS, max_analyses_per_invocation: 1 } } as never,
      positions: [
        position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1100 }),
        position({ symbol: 'BBB', quantity: 10, cost_basis: 10_000, last_price: 1000 }),
      ],
    })
    const log: string[] = []
    const d = () => withPrices({ AAA: 1200, BBB: 1000 }, {
      analyze: analyzeRouter({
        AAA: okAnalysis({ symbol: 'AAA', action: 'SELL', price: 1200 }),
        BBB: okAnalysis({ symbol: 'BBB', action: 'HOLD', price: 1000 }),
      }, log),
    })

    await runInvestmentCycle(asClient(db), USER, LAB, d())
    expect(db.count('lab_trades')).toBe(1)
    expect(log).toEqual(['AAA'])

    // Simulate an invocation that died after writing the trade but before
    // saving the cursor: the step is still 'claimed' and the queue points at it.
    const step = db.rows('lab_cycle_steps').find((s: Row) => s.step_key === 'holding:AAA:NSE')!
    step.status = 'claimed'
    const cycle = db.rows('lab_cycles')[0]
    cycle.cursor = { ...cycle.cursor, holdingIndex: 0 }

    await runInvestmentCycle(asClient(db), USER, LAB, d())

    expect(db.count('lab_trades')).toBe(1)                          // NOT two
    expect(log.filter(x => x === 'AAA').length).toBe(1)             // AAA not re-analysed
    expect(db.rows('lab_cycle_steps').find((s: Row) => s.step_key === 'holding:AAA:NSE')!.status).toBe('done')
    // The recovered invocation spent its budget on the NEXT holding instead.
    expect(log).toEqual(['AAA', 'BBB'])
    expect(db.rows('lab_accounts')[0].cash).toBe(db.rows('lab_trades')[0].cash_after)
  })
})

describe('cycle — a research failure is not an investment view (item 9)', () => {
  it('defers the step and records no action, rather than concluding INSUFFICIENT_DATA', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1100 })] })
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, withPrices({ AAA: 1200 }, {
      analyze: async () => failedAnalysis('RATE_LIMITED'),
    }))

    expect(db.count('lab_trades')).toBe(0)
    expect(summary.deferred).toEqual([{ symbol: 'AAA', reason: 'RATE_LIMITED' }])

    const symbolDecisions = db.rows('lab_decisions').filter((d: Row) => d.symbol === 'AAA')
    expect(symbolDecisions.length).toBe(1)
    expect(symbolDecisions[0].kind).toBe('deferred')
    expect(symbolDecisions[0].action).toBe(null)          // no verdict was reached
    expect(symbolDecisions[0].reason).toMatch(/RATE_LIMITED/)
    expect(symbolDecisions[0].snapshot.defer_reason).toBe('RATE_LIMITED')

    // Nothing anywhere claims the evidence was thin.
    expect(db.rows('lab_decisions').some((d: Row) => d.action === 'INSUFFICIENT_DATA')).toBe(false)
    expect(db.rows('lab_cycle_steps')[0].status).toBe('deferred')
    expect(summary.status).toBe('partial')
  })
})

describe('cycle — never fabricate an execution price (item 5)', () => {
  it('defers an exit with no live price and preserves the intended action', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1100 })] })
    const summary = await runInvestmentCycle(asClient(db), USER, LAB, withPrices({ AAA: null }, {
      analyze: analyzeRouter({ AAA: okAnalysis({ symbol: 'AAA', action: 'SELL', price: null }) }),
    }))

    expect(db.count('lab_trades')).toBe(0)                // no invented ₹1,000 exit
    expect(db.count('lab_positions')).toBe(1)             // still held
    expect(summary.deferred).toEqual([{ symbol: 'AAA', reason: 'UNPRICED' }])

    const dec = db.rows('lab_decisions').find((d: Row) => d.kind === 'deferred')!
    expect(dec.action).toBe(null)
    expect(dec.snapshot.defer_reason).toBe('UNPRICED')
    expect(dec.snapshot.intended_action).toBe('SELL')      // retried in a later cycle
  })
})

describe('cycle — the analysis runs inside the Lab constraints (item 6)', () => {
  it('passes the account constraints to the recommendation layer', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 10, cost_basis: 10_000, last_price: 1000 })] })
    let seen: any = null
    await runInvestmentCycle(asClient(db), USER, LAB, withPrices({ AAA: 1000 }, {
      analyze: async (p: any) => { seen = p; return okAnalysis({ symbol: 'AAA', action: 'HOLD', price: 1000 }) },
    }))

    expect(seen.config.maxSingleNamePct).toBe(DEFAULT_LAB_CONSTRAINTS.max_single_pct)
    expect(seen.config.maxSectorPct).toBe(DEFAULT_LAB_CONSTRAINTS.max_sector_pct)
    expect(seen.config.minConfidence).toBe(DEFAULT_LAB_CONSTRAINTS.min_data_confidence)
    expect(seen.constraintsNote).toMatch(/10%/)
    // Deploy #4: no upstream call may outlive the request that started it.
    expect(typeof seen.research.deadline).toBe('number')
    expect(seen.research.deadline).toBeGreaterThan(Date.now() - 1000)
    expect(seen.budget).toBeDefined()
    expect(seen.persistsFundamentals).toBe(true)

    // The call's own timeout must fit inside the remaining budget — that is
    // what stops the platform killing the request.
    expect(seen.research.timeoutMs).toBeLessThanOrEqual(seen.budget.remaining())
    expect(seen.research.timeoutMs).toBeLessThanOrEqual(45_000)

    // Retries are deliberately NOT forced here. When one full attempt uses most
    // of the budget, a second cannot fit, and retrying anyway is exactly how a
    // request overruns. Retrying is the RESUMABLE CYCLE's job: the step stays
    // claimed and the next invocation runs it again with warm cache.
    expect(seen.research.retries).toBeGreaterThanOrEqual(0)
    expect(seen.research.retries).toBe(seen.budget.retriesFor(seen.research.timeoutMs))
  })
})

describe('cycle — refuses to run without a pinned baseline (item 7)', () => {
  it('throws rather than trading an unmeasurable experiment', async () => {
    const db = seedDb({ lab: { status: 'pending_baseline', benchmark_start: null } as never, positions: [] })
    let message = ''
    try {
      await runInvestmentCycle(asClient(db), USER, LAB, withPrices({}))
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }
    expect(message).toMatch(/baseline/i)
    expect(db.count('lab_trades')).toBe(0)
  })
})
