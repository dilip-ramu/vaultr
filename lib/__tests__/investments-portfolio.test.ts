import { describe, it, expect } from 'vitest'
import { analyzePortfolio, sectorWeight, nameWeight, type PortfolioHolding } from '@/lib/investments/portfolio'

const H: PortfolioHolding[] = [
  { symbol: 'ICICIBANK', quantity: 100, avg_cost: 900,  last_price: 1000, sector: 'Financials' },
  { symbol: 'SBIN',      quantity: 100, avg_cost: 500,  last_price: 600,  sector: 'Financials' },
  { symbol: 'TCS',       quantity: 10,  avg_cost: 3000, last_price: 3500, sector: 'IT' },
  { symbol: 'SUNPHARMA', quantity: 50,  avg_cost: 1000, last_price: 1200, sector: 'Pharma' },
]

describe('analyzePortfolio', () => {
  it('totals value and gain over priced holdings only', () => {
    const s = analyzePortfolio(H)
    // 100000 + 60000 + 35000 + 60000 = 255000
    expect(s.totalValue).toBe(255000)
    expect(s.totalInvested).toBe(90000 + 50000 + 30000 + 50000)
    expect(s.gain).toBe(255000 - 220000)
    expect(s.gainPct).toBeCloseTo((35000 / 220000) * 100, 2)
  })

  it('excludes and NAMES an unpriced holding rather than counting it as zero', () => {
    const s = analyzePortfolio([...H, { symbol: 'XYZ', quantity: 10, avg_cost: 100, last_price: null, sector: 'IT' }])
    expect(s.unpriced).toContain('XYZ')
    expect(s.totalValue).toBe(255000)               // unchanged — unpriced not added
    const line = s.lines.find(l => l.symbol === 'XYZ')!
    expect(line.value).toBeNull()
    expect(line.weightPct).toBe(0)
  })

  it('computes sector allocation and concentration', () => {
    const s = analyzePortfolio(H)
    expect(sectorWeight(s, 'Financials')).toBeCloseTo((160000 / 255000) * 100, 1)
    expect(s.concentration.maxSector).toBe('Financials')
    expect(s.concentration.topWeightPct).toBeCloseTo((100000 / 255000) * 100, 1)
    expect(nameWeight(s, 'TCS')).toBeCloseTo((35000 / 255000) * 100, 1)
    expect(s.concentration.hhi).toBeGreaterThan(0)
  })

  it('weights of priced holdings sum to ~100', () => {
    const s = analyzePortfolio(H)
    const sum = s.lines.filter(l => l.value !== null).reduce((t, l) => t + l.weightPct, 0)
    expect(sum).toBeGreaterThan(99)
    expect(sum).toBeLessThan(101)
  })
})
