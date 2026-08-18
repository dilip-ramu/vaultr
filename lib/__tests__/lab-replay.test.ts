import { describe, it, expect } from 'vitest'
import { replayPosition, latestTrade, type ReplayTrade } from '@/lib/investments/lab/replay'
import { sharesHeldAsOf, eligibleShares, eligibilityCutoff, computeDividend, adjustCarriedPrice, quantityFactor } from '@/lib/investments/lab/eligibility'

const T = (over: Partial<ReplayTrade>): ReplayTrade => ({
  ts: '2026-08-01T04:00:00Z', side: 'buy', symbol: 'AAA', exchange: 'NSE',
  quantity: 100, gross_amount: 100_000, costs_total: 150, ...over,
})

describe('replaying the immutable trade log (item 1 recovery)', () => {
  it('rebuilds quantity and cost basis from buys', () => {
    const p = replayPosition([
      T({ quantity: 100, gross_amount: 100_000, costs_total: 150 }),
      T({ ts: '2026-08-05T04:00:00Z', quantity: 50, gross_amount: 55_000, costs_total: 80 }),
    ], 'AAA', 'NSE')
    expect(p.quantity).toBe(150)
    expect(p.cost_basis).toBe(155_230)
    expect(p.closed).toBe(false)
  })

  it('removes a proportional slice of cost basis on a partial sell', () => {
    const p = replayPosition([
      T({ quantity: 100, gross_amount: 100_000, costs_total: 0 }),
      T({ ts: '2026-08-05T04:00:00Z', side: 'sell', quantity: 40, gross_amount: 48_000, costs_total: 0 }),
    ], 'AAA', 'NSE')
    expect(p.quantity).toBe(60)
    expect(p.cost_basis).toBe(60_000)
  })

  it('reports a fully closed position', () => {
    const p = replayPosition([
      T({ quantity: 100 }),
      T({ ts: '2026-08-05T04:00:00Z', side: 'sell', quantity: 100, gross_amount: 120_000, costs_total: 0 }),
    ], 'AAA', 'NSE')
    expect(p.quantity).toBe(0)
    expect(p.closed).toBe(true)
    expect(p.cost_basis).toBe(0)
  })

  it('ignores other symbols and finds the newest trade', () => {
    const trades = [T({ symbol: 'BBB' }), T({ ts: '2026-08-09T04:00:00Z', quantity: 20, gross_amount: 20_000, costs_total: 0 })]
    expect(replayPosition(trades, 'AAA', 'NSE').quantity).toBe(20)
    expect(latestTrade(trades)!.ts).toBe('2026-08-09T04:00:00Z')
  })
})

describe('dividend eligibility from history (item 4)', () => {
  const trades = [
    T({ ts: '2026-08-03T04:00:00Z', quantity: 100 }),
    T({ ts: '2026-08-12T04:00:00Z', quantity: 50 }),      // bought AFTER the ex-date below
  ]

  it('counts only shares held before the ex-date', () => {
    expect(eligibilityCutoff('2026-08-10')).toBe('2026-08-09')
    expect(sharesHeldAsOf(trades, 'AAA', 'NSE', '2026-08-09')).toBe(100)
    expect(eligibleShares(trades, 'AAA', 'NSE', '2026-08-10')).toBe(100)
  })

  it('counts the later purchase for a later ex-date', () => {
    expect(eligibleShares(trades, 'AAA', 'NSE', '2026-08-20')).toBe(150)
  })

  it('returns zero when the position was opened after the ex-date', () => {
    expect(eligibleShares(trades, 'AAA', 'NSE', '2026-08-02')).toBe(0)
  })

  it('computes gross, tax and net', () => {
    const d = computeDividend(100, 12.5, 0)
    expect(d.gross).toBe(1250)
    expect(d.tax).toBe(0)
    expect(d.net).toBe(1250)
    const taxed = computeDividend(100, 10, 0.1)
    expect(taxed.net).toBe(900)
  })
})

describe('price adjustment for splits and bonuses (item 3)', () => {
  it('a 5:1 split multiplies quantity and divides the carried price', () => {
    expect(quantityFactor('split', 5)).toBe(5)
    expect(adjustCarriedPrice(1000, 5)).toBe(200)
  })

  it('a 1:1 bonus doubles quantity and halves the carried price', () => {
    expect(quantityFactor('bonus', 1)).toBe(2)
    expect(adjustCarriedPrice(1000, 2)).toBe(500)
  })

  it('leaves an unknown price alone', () => {
    expect(adjustCarriedPrice(null, 5)).toBe(null)
  })
})
