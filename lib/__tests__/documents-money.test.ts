// Money in the currency the document is actually in.

import { describe, it, expect } from 'vitest'
import { money, signedMoney, plainAmount, currencySymbol, defaultGstFor } from '@/lib/documents/money'

describe('formatting', () => {
  it('groups rupees the Indian way', () => {
    expect(money(259600, 'INR')).toBe('₹2,59,600')
    expect(money(4281600, 'INR')).toBe('₹42,81,600')
  })

  it('groups dollars the Western way', () => {
    expect(money(48000, 'USD')).toBe('$48,000')
    expect(money(1234567, 'USD')).toBe('$1,234,567')
  })

  it('knows the other symbols it will meet', () => {
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol('GBP')).toBe('£')
    expect(currencySymbol('AED')).toBe('د.إ')
  })

  it('falls back to rupees when nothing is said', () => {
    expect(money(100)).toBe('₹100')
    expect(money(100, '')).toBe('₹100')
  })

  it('shows an unknown currency by its code rather than guessing a symbol', () => {
    expect(money(100, 'XYZ')).toBe('XYZ100')
  })

  it('keeps the paise', () => {
    expect(money(10192.5, 'INR')).toBe('₹10,192.5')
    expect(money(1234.56, 'USD')).toBe('$1,234.56')
  })

  it('puts the minus before the symbol', () => {
    expect(signedMoney(-3620000, 'INR')).toBe('−₹36,20,000')
    expect(signedMoney(3620000, 'INR')).toBe('₹36,20,000')
  })

  it('can leave the symbol off for a column that already has a header', () => {
    expect(plainAmount(372000, 'INR')).toBe('3,72,000')
    expect(plainAmount(372000, 'USD')).toBe('372,000')
  })

  it('survives rubbish instead of printing NaN', () => {
    expect(money(NaN, 'INR')).toBe('₹0')
    expect(signedMoney(Infinity, 'USD')).toBe('$0')
  })
})

describe('tax on a foreign-currency document', () => {
  it('defaults an export document to no GST, because an export is zero-rated', () => {
    expect(defaultGstFor('USD')).toBe('0')
    expect(defaultGstFor('EUR')).toBe('0')
  })

  it('leaves a rupee document at the usual 18%', () => {
    expect(defaultGstFor('INR')).toBe('18')
    expect(defaultGstFor('')).toBe('18')
  })
})
