import { describe, it, expect } from 'vitest'
import { decide } from '@/lib/investments/recommend'
import { analyzePortfolio, type PortfolioHolding } from '@/lib/investments/portfolio'

const PORT: PortfolioHolding[] = [
  { symbol: 'ICICIBANK', quantity: 100, avg_cost: 900,  last_price: 1000, sector: 'Financials' },
  { symbol: 'SBIN',      quantity: 100, avg_cost: 500,  last_price: 600,  sector: 'Financials' },
  { symbol: 'TCS',       quantity: 10,  avg_cost: 3000, last_price: 3500, sector: 'IT' },
  { symbol: 'SUNPHARMA', quantity: 50,  avg_cost: 1000, last_price: 1200, sector: 'Pharma' },
]
const summary = analyzePortfolio(PORT)   // Financials ~63%, Pharma ~23.5%

describe('decide — data confidence gate (§15)', () => {
  it('returns INSUFFICIENT_DATA when confidence is below the floor, whatever the score', () => {
    const d = decide({ symbol: 'FOO', isHolding: false, score: 90, dataConfidence: 30, portfolio: summary })
    expect(d.action).toBe('INSUFFICIENT_DATA')
    expect(d.why_now).toMatch(/thin|do not buy/i)
  })
})

describe('decide — portfolio awareness (§9)', () => {
  it('downgrades a high-scoring BUY when its sector is already over the ceiling', () => {
    const d = decide({
      symbol: 'HDFCBANK', isHolding: false, score: 88, dataConfidence: 90,
      valuationScore: 70, currentPrice: 1500, fairValueHigh: 2000,
      sector: 'Financials', regimeState: 'neutral', portfolio: summary,
    })
    expect(d.action).toBe('HOLD')
    expect(d.concentration_flag).toBe(true)
    expect(d.portfolio_context).toMatch(/concentration|Financials/i)
  })

  it('downgrades a buy into an already-heavy single NAME', () => {
    const d = decide({
      symbol: 'SUNPHARMA', isHolding: true, score: 85, dataConfidence: 88,
      valuationScore: 70, currentPrice: 1100, fairValueHigh: 1600,
      sector: 'Pharma', regimeState: 'neutral', portfolio: summary,
    })
    expect(d.action).toBe('HOLD')
    expect(d.concentration_flag).toBe(true)
    expect(d.portfolio_context).toMatch(/single-name|portfolio/i)
  })

  it('allows a clean STRONG_BUY into an unheld sector', () => {
    const d = decide({
      symbol: 'ULTRACEMCO', isHolding: false, score: 85, dataConfidence: 90,
      valuationScore: 72, currentPrice: 8000, fairValueHigh: 11000,
      sector: 'Cement', regimeState: 'neutral', portfolio: summary,
    })
    expect(['STRONG_BUY', 'BUY']).toContain(d.action)
    expect(d.concentration_flag).toBe(false)
    expect(d.max_alloc_pct).toBeGreaterThan(0)
  })
})

describe('decide — valuation wait (§13)', () => {
  it('turns a good company at a rich price into HOLD + WAIT', () => {
    const d = decide({
      symbol: 'ULTRACEMCO', isHolding: false, score: 85, dataConfidence: 90,
      valuationScore: 20, currentPrice: 12000, fairValueHigh: 10000,
      sector: 'Cement', regimeState: 'neutral', portfolio: summary,
    })
    expect(d.action).toBe('HOLD')
    expect(d.wait).toBe(true)
    expect(d.why_now).toMatch(/wait for better entry/i)
  })
})

describe('decide — thesis broken (§14) and regime selectivity (§7)', () => {
  it('sells an owned position whose thesis is invalidated', () => {
    const d = decide({ symbol: 'FOO', isHolding: true, score: 60, dataConfidence: 80, thesisInvalidated: true, portfolio: summary })
    expect(d.action).toBe('SELL')
    expect(d.max_alloc_pct).toBe(0)
  })

  it('demands a higher bar in a crisis than in a neutral regime', () => {
    const base = { symbol: 'ULTRACEMCO', isHolding: false, score: 70, dataConfidence: 90, valuationScore: 70, currentPrice: 8000, fairValueHigh: 11000, sector: 'Cement', portfolio: summary }
    const neutral = decide({ ...base, regimeState: 'neutral' })
    const crisis = decide({ ...base, regimeState: 'crisis' })
    expect(neutral.action).toBe('BUY')
    expect(['HOLD', 'ACCUMULATE']).toContain(crisis.action)   // more conservative
    expect(crisis.action).not.toBe('BUY')
  })
})
