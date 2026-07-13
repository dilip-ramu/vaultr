import { describe, it, expect } from './shim'
import {
  stockCost, stockValue, stockGain, stockGainPct,
  priceAgeHours, isPriceStale, quoteSymbol, validateStock, portfolio,
  STALE_AFTER_HOURS,
} from '../lib/assets/stocks'

const RELIANCE = {
  symbol: 'RELIANCE',
  exchange: 'NSE' as const,
  quantity: 100,
  avg_cost: 2400,
  last_price: 2900,
  last_price_at: '2026-07-13T09:00:00Z',
}

describe('what it cost and what it is worth', () => {
  it('cost is quantity × what you paid — always knowable', () => {
    expect(stockCost(RELIANCE)).toBe(240000)
  })

  it('value is quantity × the last price', () => {
    expect(stockValue(RELIANCE)).toBe(290000)
  })

  it('gain is the difference, and the percentage of what you put in', () => {
    expect(stockGain(RELIANCE)).toBe(50000)
    expect(stockGainPct(RELIANCE)).toBe(20.83)
  })

  it('goes negative when the market went against you', () => {
    expect(stockGain({ ...RELIANCE, last_price: 2000 })).toBe(-40000)
  })
})

describe('a holding with no price', () => {
  // THE TRAP: a missing price must not be worth 0, and must not be worth cost.
  // Zero deletes it from your net worth; cost pretends the market never moved.
  // Both are lies, so the honest answer is "I don't know".
  const unpriced = { symbol: 'TCS', quantity: 10, avg_cost: 3500 }

  it('is worth UNKNOWN — not zero', () => {
    expect(stockValue(unpriced)).toBeNull()
    expect(stockValue({ ...unpriced, last_price: 0 })).toBeNull()
  })

  it('has no gain, rather than a fake one', () => {
    expect(stockGain(unpriced)).toBeNull()
    expect(stockGainPct(unpriced)).toBeNull()
  })

  it('still knows what it cost', () => {
    expect(stockCost(unpriced)).toBe(35000)
  })

  it('is worth exactly zero when you hold zero shares — that IS knowable', () => {
    expect(stockValue({ symbol: 'X', quantity: 0, avg_cost: 100 })).toBe(0)
  })
})

describe('how old the price is', () => {
  const now = new Date('2026-07-13T12:00:00Z')

  it('reports the age in hours', () => {
    expect(priceAgeHours(RELIANCE, now)).toBe(3)
  })

  it('is fresh within a day', () => {
    expect(isPriceStale(RELIANCE, now)).toBe(false)
  })

  it('is stale beyond a day — a week-old price shown as live is worse than none', () => {
    const old = { ...RELIANCE, last_price_at: '2026-07-05T09:00:00Z' }
    expect(priceAgeHours(old, now)).toBeGreaterThan(STALE_AFTER_HOURS)
    expect(isPriceStale(old, now)).toBe(true)
  })

  it('treats a never-fetched price as stale, not as fresh', () => {
    expect(priceAgeHours({ symbol: 'X' }, now)).toBeNull()
    expect(isPriceStale({ symbol: 'X' }, now)).toBe(true)
  })
})

describe('the symbol we ask the quote provider for', () => {
  it('suffixes NSE and BSE differently', () => {
    expect(quoteSymbol({ symbol: 'RELIANCE', exchange: 'NSE' })).toBe('RELIANCE.NS')
    expect(quoteSymbol({ symbol: 'RELIANCE', exchange: 'BSE' })).toBe('RELIANCE.BO')
  })

  it('defaults to NSE when the exchange is not set', () => {
    expect(quoteSymbol({ symbol: 'infy' })).toBe('INFY.NS')
  })

  it('leaves an already-suffixed symbol alone', () => {
    expect(quoteSymbol({ symbol: 'AAPL.US' })).toBe('AAPL.US')
  })

  it('has nothing to ask for without a symbol', () => {
    expect(quoteSymbol({})).toBeNull()
  })
})

describe('validation', () => {
  it('needs a symbol and a quantity', () => {
    expect(validateStock({ symbol: '', quantity: 10 }).ok).toBe(false)
    expect(validateStock({ symbol: 'TCS', quantity: 0 }).ok).toBe(false)
    expect(validateStock({ symbol: 'TCS', quantity: 10, avg_cost: 3500 }).ok).toBe(true)
  })

  it('does not demand a price — you can hold a stock before you price it', () => {
    expect(validateStock({ symbol: 'TCS', quantity: 10, avg_cost: 3500 }).ok).toBe(true)
  })
})

describe('the portfolio total', () => {
  const holdings = [
    RELIANCE,                                             // priced
    { symbol: 'TCS', quantity: 10, avg_cost: 3500 },      // NOT priced
  ]

  it('adds up only what it could actually price', () => {
    const p = portfolio(holdings)
    expect(p.value).toBe(290000)          // TCS is NOT in here
    expect(p.cost).toBe(240000 + 35000)   // …but its cost is known
  })

  it('names what it could not price, instead of silently dropping it', () => {
    expect(portfolio(holdings).unpriced).toEqual(['TCS'])
  })

  it('is all zeroes for an empty portfolio, not NaN', () => {
    const p = portfolio([])
    expect(p.cost).toBe(0)
    expect(p.value).toBe(0)
    expect(p.gain).toBe(0)
  })
})
