import { describe, it, expect } from 'vitest'
import { markLab, captureBenchmarkBaseline } from '@/lib/investments/lab/marking'
import { asClient } from './helpers/fake-supabase'
import { seedDb, position, fakePrices, fakeIndex, makeLabRow, USER, NOW } from './helpers/lab-fixture'
import type { LabAccount } from '@/lib/investments/lab/types'

const opts = (prices: Record<string, number | null>, index = fakeIndex()) => ({
  now: NOW, fetchPricesFn: fakePrices(prices) as never, fetchIndexQuoteFn: index,
})

describe('marking — a failed quote must not print a loss (item 2)', () => {
  it('values every position and records a fresh snapshot', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 90_000 })] })
    const r = await markLab(asClient(db), USER, makeLabRow() as LabAccount, opts({ AAA: 1000 }))

    expect(r.navWritten).toBe(true)
    expect(r.nav.quality).toBe('fresh')
    expect(r.nav.positionsValue).toBe(100_000)
    expect(r.nav.totalValue).toBe(1_100_000)
    expect(r.tradingDate).toBe('2026-08-18')
    expect(r.sessionSource).toBe('index')
    expect(db.count('lab_nav_history')).toBe(1)
  })

  it('carries the last valid price forward and flags the snapshot stale', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 90_000, last_price: 1000, last_price_at: '2026-08-17T10:00:00Z' })],
    })
    const r = await markLab(asClient(db), USER, makeLabRow() as LabAccount, opts({ AAA: null }))

    expect(r.navWritten).toBe(true)
    expect(r.nav.quality).toBe('stale')
    expect(r.nav.stale).toEqual(['AAA'])
    // The crucial assertion: the position is still worth 100,000, NOT zero.
    expect(r.nav.positionsValue).toBe(100_000)
    expect(r.nav.totalValue).toBe(1_100_000)
    const row = db.rows('lab_nav_history')[0]
    expect(row.data_quality).toBe('stale')
    expect(row.stale_count).toBe(1)
  })

  it('refuses to write a NAV row for a position that has never been priced', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 90_000, last_price: null })] })
    const r = await markLab(asClient(db), USER, makeLabRow() as LabAccount, opts({ AAA: null }))

    expect(r.navWritten).toBe(false)
    expect(r.nav.quality).toBe('incomplete')
    expect(r.nav.unpriced).toEqual(['AAA'])
    expect(db.count('lab_nav_history')).toBe(0)          // no misleading history
    expect(r.skippedReason).toMatch(/never had a valid price/i)
    // Benchmark levels are still market data worth recording.
    expect(db.count('lab_benchmarks')).toBe(1)
  })

  it('stores each live price so the next failure has something to carry', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 100 })] })
    await markLab(asClient(db), USER, makeLabRow() as LabAccount, opts({ AAA: 1234 }))
    expect(db.rows('lab_positions')[0].last_price).toBe(1234)
    expect(db.rows('lab_positions')[0].last_price_source).toBe('yahoo-finance')
  })

  it('re-marking the same session updates one row rather than adding another', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA', quantity: 100 })] })
    const lab = makeLabRow() as LabAccount
    await markLab(asClient(db), USER, lab, opts({ AAA: 1000 }))
    await markLab(asClient(db), USER, lab, opts({ AAA: 1100 }))
    expect(db.count('lab_nav_history')).toBe(1)
    expect(db.rows('lab_nav_history')[0].positions_value).toBe(110_000)
  })
})

describe('benchmark baseline is pinned, never re-derived (item 7)', () => {
  it('measures against the level stored on the account', async () => {
    const db = seedDb({ positions: [] })
    const r = await markLab(asClient(db), USER, makeLabRow() as LabAccount, opts({}, fakeIndex({ nifty50: 21_000, nifty500: 18_900 })))
    // Baseline 20,000 -> 21,000 is +5% on ₹10L.
    expect(r.benchmarks.nifty50_value).toBe(1_050_000)
    expect(r.benchmarks.nifty500_value).toBe(1_050_000)
  })

  it('does not invent a baseline from the first successful mark', async () => {
    const db = seedDb({ lab: { benchmark_start: null } as never })
    const r = await markLab(asClient(db), USER, makeLabRow({ benchmark_start: null } as never) as LabAccount, opts({}))
    expect(r.benchmarks.nifty50_value).toBe(null)
    expect(r.benchmarks.nifty500_value).toBe(null)
    expect(r.notes.join(' ')).toMatch(/no benchmark baseline/i)
  })

  it('captureBenchmarkBaseline refuses to pin a half-read baseline', async () => {
    const ok = await captureBenchmarkBaseline({ now: NOW, fetchIndexQuoteFn: fakeIndex({ nifty50: 20_000, nifty500: 18_000 }) })
    expect(ok.baseline!.nifty50_level).toBe(20_000)
    expect(ok.baseline!.as_of).toBe('2026-08-18')

    const partial = await captureBenchmarkBaseline({ now: NOW, fetchIndexQuoteFn: fakeIndex({ nifty50: 20_000, nifty500: null }) })
    expect(partial.baseline).toBe(null)
    expect(partial.reason).toMatch(/Nifty 500/)
  })
})
