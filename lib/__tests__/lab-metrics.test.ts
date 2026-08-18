import { describe, it, expect } from 'vitest'
import { computeMetrics } from '@/lib/investments/lab/metrics'
import { benchmarkValue, benchmarkReturnPct } from '@/lib/investments/lab/benchmarks'

describe('benchmarks', () => {
  it('grows the hypothetical ₹10L with the index and is null when a level is missing', () => {
    expect(benchmarkValue(20000, 22000, 1_000_000)).toBe(1_100_000)
    expect(benchmarkReturnPct(20000, 22000)).toBeCloseTo(10, 4)
    expect(benchmarkValue(null, 22000, 1_000_000)).toBeNull()
  })
})

describe('metrics — honesty about sample size', () => {
  it('returns null ratios when there are too few daily marks', () => {
    const navHistory = [
      { as_of: '2026-08-18', total_value: 1_000_000 },
      { as_of: '2026-08-19', total_value: 1_010_000 },
      { as_of: '2026-08-20', total_value: 1_005_000 },
    ]
    const m = computeMetrics({ navHistory, startingCapital: 1_000_000, minObs: 20 })
    expect(m.ratiosSufficient).toBe(false)
    expect(m.volatilityPct).toBeNull()
    expect(m.sharpe).toBeNull()
    expect(m.totalReturnPct).toBeCloseTo(0.5, 4)   // still computable
    expect(m.maxDrawdownPct).not.toBeNull()
  })

  it('computes alpha vs both benchmarks over the window', () => {
    const navHistory = [
      { as_of: '2026-08-18', total_value: 1_000_000 },
      { as_of: '2026-11-18', total_value: 1_150_000 },   // +15%
    ]
    const benchmarks = [
      { as_of: '2026-08-18', nifty50_value: 1_000_000, nifty500_value: 1_000_000 },
      { as_of: '2026-11-18', nifty50_value: 1_100_000, nifty500_value: 1_080_000 }, // +10% / +8%
    ]
    const m = computeMetrics({ navHistory, benchmarks, startingCapital: 1_000_000, benchmarkYieldAnnual: 0 })
    expect(m.alphaNifty50Pct).toBeCloseTo(5, 4)    // 15% − 10% (yield pinned to 0 for the check)
    expect(m.alphaNifty500Pct).toBeCloseTo(7, 4)   // 15% − 8%
  })

  it('computes trade-quality metrics from closed trades', () => {
    const navHistory = [{ as_of: '2026-08-18', total_value: 1_050_000 }]
    const closedTrades = [
      { realized_pnl: 5000, holding_days: 40 },
      { realized_pnl: -2000, holding_days: 20 },
      { realized_pnl: 3000, holding_days: 60 },
    ]
    const m = computeMetrics({ navHistory, closedTrades, startingCapital: 1_000_000, latestCash: 200000, dividendsCum: 10500 })
    expect(m.winRatePct).toBeCloseTo(66.67, 1)
    expect(m.profitFactor).toBeCloseTo(4, 4)       // (5000+3000)/2000
    expect(m.avgHoldingDays).toBe(40)
    expect(m.cashPct).toBeCloseTo((200000 / 1_050_000) * 100, 2)
    expect(m.dividendReturnPct).toBeCloseTo(1.05, 4)          // 10,500 / 10,00,000
    expect(m.priceReturnPct).toBeCloseTo(m.totalReturnPct! - 1.05, 4)
  })
})
