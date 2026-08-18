import { describe, it, expect } from 'vitest'
import { simulateBuy, simulateSell } from '@/lib/investments/lab/engine'
import type { LabState, LabConstraints } from '@/lib/investments/lab/types'
import { DEFAULT_COST_MODEL } from '@/lib/investments/lab/costs'

const K: LabConstraints = {
  max_single_pct: 10, max_sector_pct: 25, min_data_confidence: 45, min_price: 20,
  no_leverage: true, no_shorting: true, no_derivatives: true, max_actions_per_cycle: 6,
}
const fresh = (): LabState => ({ cash: 1_000_000, positions: [], constraints: K, cost_model: DEFAULT_COST_MODEL })

describe('engine — buy constraints', () => {
  it('caps a buy to the 10% single-name ceiling', () => {
    const r = simulateBuy(fresh(), { symbol: 'XYZ', exchange: 'NSE', price: 1000, quantity: 1000, sector: 'IT', dataConfidence: 80 })
    expect(r.ok).toBe(true)
    expect(r.capped).toBe(true)
    expect(r.filledQty).toBe(100)          // 100 * 1000 = 100000 = 10% of 1,000,000
  })

  it('refuses a penny stock below the price guard', () => {
    const r = simulateBuy(fresh(), { symbol: 'PENNY', exchange: 'NSE', price: 10, quantity: 100, dataConfidence: 90 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/penny/i)
  })

  it('refuses when data confidence is below the floor', () => {
    const r = simulateBuy(fresh(), { symbol: 'XYZ', exchange: 'NSE', price: 500, quantity: 10, dataConfidence: 30 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/confidence/i)
  })

  it('enforces the 25% sector ceiling across names', () => {
    let s = fresh()
    // Fill IT sector toward the cap with two names at ~10% each = 20%.
    s = simulateBuy(s, { symbol: 'ITA', exchange: 'NSE', price: 1000, quantity: 100, sector: 'IT', dataConfidence: 80 }).state
    s = simulateBuy(s, { symbol: 'ITB', exchange: 'NSE', price: 1000, quantity: 100, sector: 'IT', dataConfidence: 80 }).state
    // A third IT name should be capped so total IT ≤ 25% (i.e. ≤ ~50 more shares).
    const r = simulateBuy(s, { symbol: 'ITC2', exchange: 'NSE', price: 1000, quantity: 100, sector: 'IT', dataConfidence: 80 })
    expect(r.ok).toBe(true)
    expect(r.filledQty).toBeLessThanOrEqual(50)
    expect(r.capped).toBe(true)
  })

  it('does not mutate the input state (immutability) and is deterministic', () => {
    const s = fresh()
    const before = JSON.stringify(s)
    const r1 = simulateBuy(s, { symbol: 'XYZ', exchange: 'NSE', price: 1000, quantity: 50, sector: 'IT', dataConfidence: 80 })
    const r2 = simulateBuy(s, { symbol: 'XYZ', exchange: 'NSE', price: 1000, quantity: 50, sector: 'IT', dataConfidence: 80 })
    expect(JSON.stringify(s)).toBe(before)             // untouched
    expect(r1.filledQty).toBe(r2.filledQty)            // deterministic
    expect(r1.trade!.cash_after).toBe(r2.trade!.cash_after)
  })
})

describe('engine — sell', () => {
  it('realises P&L, updates cash, closes the position, and never shorts', () => {
    let s = fresh()
    s = simulateBuy(s, { symbol: 'ABC', exchange: 'NSE', price: 1000, quantity: 50, sector: 'IT', dataConfidence: 80 }).state
    const cashAfterBuy = s.cash
    const held = s.positions.find(p => p.symbol === 'ABC')!
    expect(held.quantity).toBe(50)

    const r = simulateSell(s, { symbol: 'ABC', exchange: 'NSE', price: 1200, quantity: 50 })
    expect(r.ok).toBe(true)
    expect(r.closed).toBe(true)
    expect(r.trade!.realized_pnl).toBeGreaterThan(0)   // sold at a profit
    expect(r.state.cash).toBeGreaterThan(cashAfterBuy) // cash came back in
    expect(r.state.positions.find(p => p.symbol === 'ABC')).toBeUndefined()
  })

  it('clamps a sell to the held quantity (no shorting)', () => {
    let s = fresh()
    s = simulateBuy(s, { symbol: 'ABC', exchange: 'NSE', price: 1000, quantity: 30, sector: 'IT', dataConfidence: 80 }).state
    const r = simulateSell(s, { symbol: 'ABC', exchange: 'NSE', price: 1100, quantity: 100 })
    expect(r.filledQty).toBe(30)
    expect(r.capped).toBe(true)
  })

  it('refuses to sell something not held', () => {
    const r = simulateSell(fresh(), { symbol: 'NONE', exchange: 'NSE', price: 100, quantity: 10 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no position|shorting/i)
  })
})
