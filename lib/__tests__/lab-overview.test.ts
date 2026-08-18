import { describe, it, expect } from 'vitest'
import { getLabOverview } from '@/lib/investments/lab/overview'
import { asClient, FakeSupabase } from './helpers/fake-supabase'
import { seedDb, position, makeLabRow, USER, LAB, NOW } from './helpers/lab-fixture'

/* eslint-disable @typescript-eslint/no-explicit-any */

const nav = (as_of: string, total: number, over: Record<string, unknown> = {}) => ({
  id: `nav-${as_of}`, lab_id: LAB, user_id: USER, as_of,
  cash: 0, positions_value: total, total_value: total, invested: total,
  unrealized_pnl: 0, realized_pnl_cum: 0, holdings_count: 1,
  peak: total, drawdown_pct: 0, unpriced: [], stale: [], data_quality: 'fresh',
  fresh_count: 1, stale_count: 0, session_source: 'index',
  dividends_cum: 0, marked_at: `${as_of}T10:00:00Z`, ...over,
})
const bench = (as_of: string, v50: number | null, v500: number | null) => ({
  id: `b-${as_of}`, lab_id: LAB, user_id: USER, as_of,
  nifty50_level: 21000, nifty500_level: 19000, nifty50_value: v50, nifty500_value: v500,
})

describe('Lab overview — empty state', () => {
  it('reports that no Lab exists without inventing numbers', async () => {
    const db = new FakeSupabase({ lab_accounts: [] })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.exists).toBe(false)
    expect(o.lab).toBe(null)
    expect(o.positions).toEqual([])
    expect(o.metrics).toBe(null)
    expect(o.history.chartReady).toBe(false)
    expect(o.totals.portfolioValue).toBe(0)
  })
})

describe('Lab overview — an initialised ₹10L Lab', () => {
  it('shows all cash and no return before anything is bought', async () => {
    const db = seedDb({ positions: [] })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.exists).toBe(true)
    expect(o.totals.startingCapital).toBe(1_000_000)
    expect(o.totals.cash).toBe(1_000_000)
    expect(o.totals.portfolioValue).toBe(1_000_000)
    expect(o.totals.totalReturn).toBe(0)
    expect(o.totals.totalReturnPct).toBe(0)
    expect(o.totals.cashPct).toBe(100)
    expect(o.status.holdingsCount).toBe(0)
  })

  it('values holdings from the last persisted mark and computes weights and P&L', async () => {
    const db = seedDb({
      lab: { cash: 800_000 } as never,
      positions: [
        position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1200, last_price_at: '2026-08-18T04:00:00Z' }),
        position({ id: 'pos-BBB', symbol: 'BBB', quantity: 50, cost_basis: 100_000, last_price: 1800, last_price_at: '2026-08-18T04:00:00Z', sector: 'Pharma' }),
      ],
    })
    const o = await getLabOverview(asClient(db), USER, NOW)

    expect(o.totals.investedValue).toBe(210_000)          // 120,000 + 90,000
    expect(o.totals.portfolioValue).toBe(1_010_000)
    expect(o.totals.costBasis).toBe(200_000)
    expect(o.totals.unrealizedPnl).toBe(10_000)
    expect(o.totals.totalReturnPct).toBe(1)

    const aaa = o.positions.find(p => p.symbol === 'AAA')!
    expect(aaa.marketValue).toBe(120_000)
    expect(aaa.avgCost).toBe(1000)
    expect(aaa.unrealizedPnl).toBe(20_000)
    expect(aaa.returnPct).toBe(20)
    expect(aaa.weightPct).toBeCloseTo(11.88, 1)
    expect(aaa.stale).toBe(false)

    const bbb = o.positions.find(p => p.symbol === 'BBB')!
    expect(bbb.unrealizedPnl).toBe(-10_000)
    expect(bbb.returnPct).toBe(-10)
  })

  it('flags a stale price and a never-priced position instead of hiding them', async () => {
    const db = seedDb({
      positions: [
        position({ symbol: 'OLD', quantity: 10, cost_basis: 10_000, last_price: 900, last_price_at: '2026-08-10T04:00:00Z' }),
        position({ id: 'pos-NEW', symbol: 'NEW', quantity: 10, cost_basis: 10_000, last_price: null }),
      ],
    })
    const o = await getLabOverview(asClient(db), USER, NOW)

    expect(o.positions.find(p => p.symbol === 'OLD')!.stale).toBe(true)
    expect(o.positions.find(p => p.symbol === 'NEW')!.marketValue).toBe(null)
    // The unpriced name is excluded from value, not counted as zero.
    expect(o.totals.investedValue).toBe(9_000)
    expect(o.status.warnings.join(' ')).toMatch(/OLD/)
    expect(o.status.warnings.join(' ')).toMatch(/Never priced.*NEW/)
  })

  it('counts dividends and realised P&L without double-counting them in NAV', async () => {
    const db = seedDb({
      lab: { cash: 901_250 } as never,
      positions: [],
      extra: {
        lab_dividends: [{ id: 'd1', lab_id: LAB, user_id: USER, net_dividend: 1250 }],
        lab_trades: [{ id: 't1', lab_id: LAB, user_id: USER, realized_pnl: 5000, gross_amount: 100_000, ts: '2026-08-05T04:00:00Z' }],
      },
    })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.totals.dividends).toBe(1250)
    expect(o.totals.realizedPnl).toBe(5000)
    // Portfolio value is cash + positions. The dividend is already inside cash.
    expect(o.totals.portfolioValue).toBe(901_250)
  })
})

describe('Lab overview — benchmarks', () => {
  it('compares against the pinned baseline once a mark exists', async () => {
    const db = seedDb({ positions: [], extra: { lab_benchmarks: [bench('2026-08-18', 1_050_000, 1_020_000)] } })
    const o = await getLabOverview(asClient(db), USER, NOW)

    expect(o.benchmarks.sufficient).toBe(true)
    const n50 = o.benchmarks.lines.find(l => l.label === 'Nifty 50')!
    expect(n50.current).toBe(1_050_000)
    expect(n50.returnPct).toBe(5)
    const lab = o.benchmarks.lines.find(l => l.label === 'Inex Lab')!
    expect(lab.start).toBe(1_000_000)
  })

  it('says so plainly when there is no baseline, rather than showing a flat line', async () => {
    const db = seedDb({ lab: { benchmark_start: null, status: 'pending_baseline' } as never, positions: [] })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.benchmarks.sufficient).toBe(false)
    expect(o.benchmarks.note).toMatch(/baseline/i)
    expect(o.status.baselinePinned).toBe(false)
    expect(o.status.warnings.join(' ')).toMatch(/baseline/i)
  })
})

describe('Lab overview — history gating', () => {
  it('refuses to draw a chart from a single observation', async () => {
    const db = seedDb({ positions: [], extra: { lab_nav_history: [nav('2026-08-18', 1_000_000)] } })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.history.observations).toBe(1)
    expect(o.history.chartReady).toBe(false)
    expect(o.history.note).toMatch(/at least two/i)
  })

  it('draws once there are two sessions, but withholds risk ratios', async () => {
    const db = seedDb({
      positions: [],
      extra: {
        lab_nav_history: [nav('2026-08-17', 1_000_000), nav('2026-08-18', 1_010_000)],
        lab_benchmarks: [bench('2026-08-17', 1_000_000, 1_000_000), bench('2026-08-18', 1_005_000, 1_004_000)],
      },
    })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.history.chartReady).toBe(true)
    expect(o.history.ratiosReady).toBe(false)
    expect(o.metrics!.sharpe).toBe(null)
    expect(o.metrics!.volatilityPct).toBe(null)
    expect(o.navHistory).toHaveLength(2)
    expect(o.navHistory[1].nifty50_value).toBe(1_005_000)
  })

  it('never fabricates a benchmark point for a session with no benchmark row', async () => {
    const db = seedDb({
      positions: [],
      extra: {
        lab_nav_history: [nav('2026-08-17', 1_000_000), nav('2026-08-18', 1_010_000)],
        lab_benchmarks: [bench('2026-08-18', 1_005_000, 1_004_000)],
      },
    })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.navHistory[0].nifty50_value).toBe(null)     // gap stays a gap
    expect(o.navHistory[1].nifty50_value).toBe(1_005_000)
  })
})

describe('Lab overview — status', () => {
  it('surfaces an open cycle as resumable', async () => {
    const db = seedDb({
      positions: [],
      extra: {
        lab_cycles: [{
          id: 'c1', lab_id: LAB, user_id: USER, status: 'in_progress', phase: 'holdings',
          cursor: {}, counters: {}, trading_date: '2026-08-18', model_version: '1.0',
          summary: {}, started_at: '2026-08-18T04:00:00Z', updated_at: '2026-08-18T04:05:00Z', completed_at: null,
        }],
      },
    })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.status.openCycle?.status).toBe('in_progress')
    expect(o.status.warnings.join(' ')).toMatch(/resumes/i)
  })

  it('reports the last mark and its quality', async () => {
    const db = seedDb({
      positions: [],
      extra: { lab_nav_history: [nav('2026-08-18', 1_000_000, { data_quality: 'stale', stale: ['AAA'] })] },
    })
    const o = await getLabOverview(asClient(db), USER, NOW)
    expect(o.status.lastMark?.data_quality).toBe('stale')
    expect(o.status.warnings.join(' ')).toMatch(/carried-forward/i)
  })
})
