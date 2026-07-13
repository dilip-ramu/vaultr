import { describe, it, expect } from './shim'
import {
  BASE_CURRENCY, rateMap, toBase, sumInBase, isCrossCurrency,
  impliedRate, expectedToAmount, validateCrossTransfer,
} from '../lib/fx'

const rates = rateMap([
  { currency: 'EUR', market_rate: 91 },
  { currency: 'USD', market_rate: 84 },
])

describe('rates', () => {
  it('treats the base currency as exactly 1 — never a lookup', () => {
    expect(rates[BASE_CURRENCY]).toBe(1)
  })

  it('ignores junk rates rather than poisoning every total with NaN', () => {
    const m = rateMap([
      { currency: 'EUR', market_rate: 91 },
      { currency: 'GBP', market_rate: 0 },
      { currency: 'JPY', market_rate: NaN },
    ])
    expect(m.EUR).toBe(91)
    expect(m.GBP).toBeUndefined()
    expect(m.JPY).toBeUndefined()
  })
})

describe('converting', () => {
  it('converts a foreign amount at its rate', () => {
    expect(toBase(1000, 'EUR', rates)).toBe(91000)
  })

  it('leaves base currency alone', () => {
    expect(toBase(5000, 'INR', rates)).toBe(5000)
  })

  // THE TRAP: a missing rate must not become zero. "I don't know" and "nothing"
  // are different, and confusing them silently deletes money from every total.
  it('returns null for a currency it has no rate for — never 0', () => {
    expect(toBase(200, 'GBP', rates)).toBeNull()
  })
})

describe('totalling money held in several currencies', () => {
  const accounts = [
    { balance: 500000, currency: 'INR' },
    { balance: 20000, currency: 'INR' },
    { balance: 1000, currency: 'EUR' },
    { balance: 500, currency: 'USD' },
  ]

  const total = sumInBase(accounts, rates)

  it('converts before adding — you cannot add rupees to euros', () => {
    // 520000 + (1000 × 91) + (500 × 84)
    expect(total.base).toBe(520000 + 91000 + 42000)
  })

  it('keeps each currency as a separate holding, in what you actually hold', () => {
    const eur = total.holdings.find(h => h.currency === 'EUR')!
    expect(eur.native).toBe(1000)     // still €1,000 — not converted away
    expect(eur.base).toBe(91000)
    expect(eur.rate).toBe(91)
    expect(eur.accounts).toBe(1)
  })

  it('merges accounts sharing a currency', () => {
    const inr = total.holdings.find(h => h.currency === 'INR')!
    expect(inr.native).toBe(520000)
    expect(inr.accounts).toBe(2)
  })

  it('knows when it is dealing with more than one currency', () => {
    expect(total.multiCurrency).toBe(true)
    expect(sumInBase([{ balance: 100, currency: 'INR' }], rates).multiCurrency).toBe(false)
  })

  // THE HONEST BIT: money we can't convert is EXCLUDED and NAMED, not counted
  // as zero. A total that quietly swallows £200 is worse than one that admits it.
  it('excludes money it cannot convert, and says which currency', () => {
    const withGbp = sumInBase([...accounts, { balance: 200, currency: 'GBP' }], rates)
    expect(withGbp.missingRates).toEqual(['GBP'])
    expect(withGbp.base).toBe(total.base)              // unchanged — GBP is NOT in it
    const gbp = withGbp.holdings.find(h => h.currency === 'GBP')!
    expect(gbp.native).toBe(200)                       // but the £200 is still shown
    expect(gbp.base).toBeNull()
  })

  it('treats a missing currency as the base currency, not as unknown', () => {
    const t = sumInBase([{ balance: 100 }], rates)
    expect(t.base).toBe(100)
    expect(t.missingRates).toEqual([])
  })
})

describe('cross-currency transfers', () => {
  it('spots when the two sides differ', () => {
    expect(isCrossCurrency('INR', 'EUR')).toBe(true)
    expect(isCrossCurrency('EUR', 'EUR')).toBe(false)
    expect(isCrossCurrency(null, 'INR')).toBe(false)   // null = base
  })

  // THE BUG v104 FIXES: the balance view credited the destination with the
  // SOURCE amount. Send ₹91,000 to a EUR account and it credited €91,000.
  it('records what LEFT and what ARRIVED as two different numbers', () => {
    const t = { amount: 91000, fromCurrency: 'INR', toAmount: 1000, toCurrency: 'EUR' }
    expect(t.amount).not.toBe(t.toAmount)
    expect(impliedRate(t)).toBe(0.01098901)            // €1,000 ÷ ₹91,000
  })

  it('reports the rate you actually got, which is never the market rate', () => {
    // The bank gave you €990 for ₹91,000, not the €1,000 the market implies.
    expect(impliedRate({ amount: 91000, toAmount: 990 })).toBe(0.01087912)
    expect(expectedToAmount(91000, 'INR', 'EUR', rates)).toBe(1000)
  })

  it('has no implied rate when nothing left the account', () => {
    expect(impliedRate({ amount: 0, toAmount: 100 })).toBeNull()
  })

  it('refuses a transfer that is missing either side', () => {
    expect(validateCrossTransfer({ amount: 91000, toAmount: 0 }).ok).toBe(false)
    expect(validateCrossTransfer({ amount: 0, toAmount: 1000 }).ok).toBe(false)
    expect(validateCrossTransfer({ amount: 91000, toAmount: 1000 }).ok).toBe(true)
  })
})
