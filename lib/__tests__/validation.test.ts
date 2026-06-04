import { describe, it, expect } from 'vitest'
import { isSaneDate, dateError, parseAmount, firstError } from '../validation'

describe('isSaneDate — permissive for real dates, strict for nonsense', () => {
  it('accepts legitimate old dates without complaint (2018, 2005, 1995)', () => {
    expect(isSaneDate('2018-03-15')).toBe(true)
    expect(isSaneDate('2005-12-31')).toBe(true)
    expect(isSaneDate('1995-01-01')).toBe(true)
  })

  it('accepts future dates within reason (due dates years ahead)', () => {
    expect(isSaneDate('2035-06-01')).toBe(true)
  })

  it('rejects typo years (the bug that froze the profitability page)', () => {
    expect(isSaneDate('0205-05-12')).toBe(false)
    expect(isSaneDate('0001-01-01')).toBe(false)
    expect(isSaneDate('3026-01-01')).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(isSaneDate('2026-02-30')).toBe(false)
    expect(isSaneDate('2026-13-01')).toBe(false)
    expect(isSaneDate('2026-00-10')).toBe(false)
  })

  it('rejects garbage and empty values', () => {
    expect(isSaneDate('garbage')).toBe(false)
    expect(isSaneDate('')).toBe(false)
    expect(isSaneDate(null)).toBe(false)
    expect(isSaneDate(undefined)).toBe(false)
  })

  it('accepts leap-day on leap years only', () => {
    expect(isSaneDate('2024-02-29')).toBe(true)
    expect(isSaneDate('2026-02-29')).toBe(false)
  })
})

describe('dateError', () => {
  it('returns null for a fine date', () => {
    expect(dateError('2018-03-15')).toBe(null)
  })

  it('optional fields can be empty', () => {
    expect(dateError(null, 'Due date', false)).toBe(null)
    expect(dateError('', 'Due date', false)).toBe(null)
  })

  it('required fields cannot be empty', () => {
    expect(dateError(null, 'Invoice date')).toBe('Invoice date is required')
  })

  it('mentions the bad value so the user can spot the typo', () => {
    const err = dateError('0205-05-12', 'Date')
    expect(err?.includes('0205-05-12')).toBe(true)
  })
})

describe('parseAmount', () => {
  it('accepts normal amounts, including string form input', () => {
    expect(parseAmount('1234.56').value).toBe(1234.56)
    expect(parseAmount(50000).value).toBe(50000)
  })

  it('rejects negative amounts', () => {
    expect(parseAmount('-500').error).toBe("Amount can't be negative")
  })

  it('rejects zero unless explicitly allowed', () => {
    expect(parseAmount('0').error).toBe('Amount must be more than zero')
    expect(parseAmount('0', 'Amount', { allowZero: true }).value).toBe(0)
  })

  it('rejects garbage and empties', () => {
    expect(parseAmount('abc').error).toBe('Amount is required')
    expect(parseAmount('').error).toBe('Amount is required')
    expect(parseAmount(null).error).toBe('Amount is required')
  })

  it('rejects absurdly large amounts (fat-finger guard)', () => {
    expect(parseAmount('99999999999999').error)
      .toBe('Amount looks too large — check for extra digits')
  })

  it('large but plausible business amounts pass (₹50 crore)', () => {
    expect(parseAmount('500000000').value).toBe(500000000)
  })
})

describe('firstError', () => {
  it('returns the first non-null error', () => {
    expect(firstError(null, 'boom', 'later')).toBe('boom')
  })
  it('returns null when everything passes', () => {
    expect(firstError(null, null)).toBe(null)
  })
})
