import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LAB_CONSTRAINTS, resolveConstraints, toDecideConfig,
  validateConstraints, constraintsBrief, isFresh,
} from '@/lib/investments/lab/config'
import { decide } from '@/lib/investments/recommend'
import { analyzePortfolio, type PortfolioHolding } from '@/lib/investments/portfolio'
import { simulateBuy } from '@/lib/investments/lab/engine'
import { DEFAULT_COST_MODEL } from '@/lib/investments/lab/costs'

describe('one authoritative configuration (item 6)', () => {
  it('fills defaults for a constraints blob written before v112', () => {
    const legacy = {
      max_single_pct: 10, max_sector_pct: 25, min_data_confidence: 45, min_price: 20,
      no_leverage: true, no_shorting: true, no_derivatives: true, max_actions_per_cycle: 6,
    }
    const r = resolveConstraints(legacy)
    expect(r.max_analyses_per_invocation).toBe(DEFAULT_LAB_CONSTRAINTS.max_analyses_per_invocation)
    expect(r.min_cash_pct).toBe(DEFAULT_LAB_CONSTRAINTS.min_cash_pct)
    expect(r.max_single_pct).toBe(10)
  })

  it('hands the recommendation layer the SAME ceilings the engine enforces', () => {
    const cfg = toDecideConfig(DEFAULT_LAB_CONSTRAINTS)
    expect(cfg.maxSingleNamePct).toBe(DEFAULT_LAB_CONSTRAINTS.max_single_pct)
    expect(cfg.maxSectorPct).toBe(DEFAULT_LAB_CONSTRAINTS.max_sector_pct)
    expect(cfg.minConfidence).toBe(DEFAULT_LAB_CONSTRAINTS.min_data_confidence)
  })

  it('the two layers now agree: what decide() blesses, the engine can fill', () => {
    // A portfolio 26% in IT — over the Lab's 25% sector ceiling but UNDER the
    // Phase-1 default of 30%. Before this pass, decide() said BUY and the engine
    // then refused it. Now both refuse.
    const holdings: PortfolioHolding[] = [
      { symbol: 'ITA', quantity: 100, avg_cost: 1000, last_price: 1300, sector: 'IT' },
      { symbol: 'BNK', quantity: 100, avg_cost: 1000, last_price: 3700, sector: 'Financials' },
    ]
    const summary = analyzePortfolio(holdings)
    expect(summary.sectorAlloc.IT).toBeGreaterThan(25)
    expect(summary.sectorAlloc.IT).toBeLessThan(30)

    const withPhase1Defaults = decide({
      symbol: 'ITB', isHolding: false, score: 85, dataConfidence: 90,
      valuationScore: 70, sector: 'IT', portfolio: summary,
    })
    const withLabConfig = decide({
      symbol: 'ITB', isHolding: false, score: 85, dataConfidence: 90,
      valuationScore: 70, sector: 'IT', portfolio: summary,
      config: toDecideConfig(DEFAULT_LAB_CONSTRAINTS),
    })

    expect(withPhase1Defaults.concentration_flag).toBe(false)   // 26% < 30%
    expect(withLabConfig.concentration_flag).toBe(true)         // 26% > 25%
    expect(withLabConfig.action).toBe('HOLD')
  })

  it('enforces the cash floor in the engine', () => {
    const k = resolveConstraints({ ...DEFAULT_LAB_CONSTRAINTS, max_single_pct: 100, max_sector_pct: 100, min_cash_pct: 10 })
    const r = simulateBuy(
      { cash: 100_000, positions: [], constraints: k, cost_model: DEFAULT_COST_MODEL },
      { symbol: 'AAA', exchange: 'NSE', price: 100, quantity: 10_000, dataConfidence: 80 },
    )
    expect(r.ok).toBe(true)
    // 10% of a 100,000 NAV must stay in cash.
    expect(r.state.cash).toBeGreaterThanOrEqual(10_000)
  })

  it('rejects an incoherent configuration', () => {
    expect(validateConstraints(DEFAULT_LAB_CONSTRAINTS)).toEqual([])
    const bad = validateConstraints({ ...DEFAULT_LAB_CONSTRAINTS, max_single_pct: 40, max_sector_pct: 25 })
    expect(bad.length).toBeGreaterThan(0)
    const noShort = validateConstraints({ ...DEFAULT_LAB_CONSTRAINTS, no_shorting: false })
    expect(noShort.length).toBeGreaterThan(0)
  })

  it('describes the rules for the analysis prompt', () => {
    const brief = constraintsBrief(DEFAULT_LAB_CONSTRAINTS)
    expect(brief).toMatch(/10%/)
    expect(brief).toMatch(/25%/)
    expect(brief).toMatch(/no shorting/i)
  })

  it('freshness respects the TTL', () => {
    const now = new Date('2026-08-18T00:00:00Z')
    expect(isFresh('2026-08-17T00:00:00Z', 48, now)).toBe(true)
    expect(isFresh('2026-08-10T00:00:00Z', 48, now)).toBe(false)
    expect(isFresh(null, 48, now)).toBe(false)
  })
})
