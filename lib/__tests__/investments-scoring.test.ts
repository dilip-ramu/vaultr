import { describe, it, expect } from 'vitest'
import {
  scoreEarningsGrowth, scoreValuation, scoreSecurity, DEFAULT_WEIGHTS,
} from '@/lib/investments/scoring'

describe('scoring — quantitative factors', () => {
  it('rewards higher earnings growth, and returns null with no inputs', () => {
    const hi = scoreEarningsGrowth({ eps_growth_pct: 28, revenue_growth_pct: 22 })!
    const lo = scoreEarningsGrowth({ eps_growth_pct: 2, revenue_growth_pct: 1 })!
    expect(hi).toBeGreaterThan(lo)
    expect(scoreEarningsGrowth({})).toBeNull()
  })

  it('rewards cheaper valuation vs sector', () => {
    const cheap = scoreValuation({ pe: 12, sector_pe: 24 }, {})!
    const dear  = scoreValuation({ pe: 40, sector_pe: 24 }, {})!
    expect(cheap).toBeGreaterThan(dear)
  })
})

describe('scoreSecurity', () => {
  it('drops missing factors and renormalises (no false zeros)', () => {
    const b = scoreSecurity({ fundamentals: { eps_growth_pct: 20 }, valuation: {}, dataConfidence: 80 })
    // Only earnings_growth + data_confidence had inputs.
    expect(Object.keys(b.factors).sort()).toEqual(['data_confidence', 'earnings_growth'])
    expect(b.total).toBeGreaterThan(0)
    expect(b.total).toBeLessThanOrEqual(100)
  })

  it('a strong company scores higher than a weak one', () => {
    const strong = scoreSecurity({
      fundamentals: { eps_growth_pct: 26, revenue_growth_pct: 20, roe_pct: 22, roce_pct: 24, fcf: 900, ocf: 1200, pat: 800, debt: 100, cash: 1500, interest_coverage: 12, promoter_pledge_pct: 0 },
      valuation: { pe: 16, sector_pe: 26, peg: 0.8, ev_ebitda: 11, pb: 3 },
      dataConfidence: 90,
      qualitative: { business_quality: 85, management: 80, industry: 75, moat: 80, macro_sensitivity: 70, geopolitical_risk: 70 },
    })
    const weak = scoreSecurity({
      fundamentals: { eps_growth_pct: -8, revenue_growth_pct: -3, roe_pct: 4, roce_pct: 5, fcf: -200, ocf: -50, pat: 100, debt: 3000, cash: 100, interest_coverage: 1.2, promoter_pledge_pct: 40 },
      valuation: { pe: 55, sector_pe: 22, peg: 3.5, ev_ebitda: 30, pb: 6 },
      dataConfidence: 60,
      qualitative: { business_quality: 25, management: 30, industry: 35, moat: 20, macro_sensitivity: 40, geopolitical_risk: 40 },
    })
    expect(strong.total).toBeGreaterThan(weak.total)
    expect(strong.total).toBeGreaterThan(65)
    expect(weak.total).toBeLessThan(50)
  })

  it('default weights are deliberate (valuation + growth heaviest) and sum ~1', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 2)
    expect(DEFAULT_WEIGHTS.valuation).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.momentum)
  })
})
