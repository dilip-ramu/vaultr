import { describe, it, expect } from 'vitest'
import {
  istDateString, istParts, isWeekend, isTradingDay, tradingDayOnOrBefore,
  addDays, resolveTradingDate, istDateFromEpochSeconds, isKnownHoliday,
} from '@/lib/investments/marketdate'

describe('IST dates (item 8)', () => {
  it('a 02:00 IST instant belongs to the IST day, not the UTC day before', () => {
    // 2026-08-18 02:00 IST = 2026-08-17 20:30 UTC. The old UTC slice booked this
    // as the 17th; the trading date is the 18th.
    const d = new Date('2026-08-17T20:30:00Z')
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-17')
    expect(istDateString(d)).toBe('2026-08-18')
  })

  it('keeps the same day for a normal daytime instant', () => {
    expect(istDateString(new Date('2026-08-18T04:00:00Z'))).toBe('2026-08-18')
    expect(istParts(new Date('2026-08-18T04:00:00Z')).hour).toBe(9)
  })

  it('recognises weekends', () => {
    expect(isWeekend('2026-08-15')).toBe(true)    // Saturday
    expect(isWeekend('2026-08-16')).toBe(true)    // Sunday
    expect(isWeekend('2026-08-18')).toBe(false)   // Tuesday
  })

  it('treats a listed NSE holiday as a non-trading day', () => {
    expect(isKnownHoliday('2026-01-26')).toBe(true)
    expect(isTradingDay('2026-01-26')).toBe(false)
  })

  it('rolls a weekend back to the previous trading day instead of inventing an observation', () => {
    expect(tradingDayOnOrBefore('2026-08-16')).toBe('2026-08-14')   // Sun -> Fri
    expect(tradingDayOnOrBefore('2026-08-18')).toBe('2026-08-18')
  })

  it('addDays crosses month boundaries correctly', () => {
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('resolveTradingDate', () => {
  it('prefers the exchange timestamp when one is available', () => {
    const now = new Date('2026-08-16T06:00:00Z')            // Sunday IST
    const fridayClose = Math.floor(new Date('2026-08-14T10:00:00Z').getTime() / 1000)
    const r = resolveTradingDate({ now, indexMarketTimeSec: fridayClose })
    expect(r.source).toBe('index')
    expect(r.date).toBe('2026-08-14')
    expect(r.sessionKnown).toBe(true)
  })

  it('falls back to the IST calendar and never returns a weekend', () => {
    const now = new Date('2026-08-16T06:00:00Z')            // Sunday IST
    const r = resolveTradingDate({ now, indexMarketTimeSec: null })
    expect(r.source).toBe('calendar')
    expect(r.date).toBe('2026-08-14')
    expect(isWeekend(r.date)).toBe(false)
    expect(r.todayIsTradingDay).toBe(false)
  })

  it('ignores an implausible timestamp rather than trusting it', () => {
    const now = new Date('2026-08-18T04:00:00Z')
    const future = Math.floor(new Date('2027-01-01T00:00:00Z').getTime() / 1000)
    const r = resolveTradingDate({ now, indexMarketTimeSec: future })
    expect(r.source).toBe('calendar')
    expect(r.date).toBe('2026-08-18')
  })

  it('converts an epoch to the IST session date', () => {
    expect(istDateFromEpochSeconds(Math.floor(new Date('2026-08-17T20:30:00Z').getTime() / 1000))).toBe('2026-08-18')
  })
})
