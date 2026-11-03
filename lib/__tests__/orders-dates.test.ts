// Cut-off and ETD: which one matters when, and what turns red.

import { describe, it, expect } from 'vitest'
import { orderDateFlags, whenWords, countLate, SOON_DAYS } from '@/lib/orders/dates'

const TODAY = '2026-09-01'
const base = { stage: 'confirmed', fullyShipped: false }

describe('the cut-off date', () => {
  it('matters while the order could still change', () => {
    const f = orderDateFlags({ ...base, cutoffDate: '2026-09-20' }, TODAY)
    expect(f.map(x => x.kind)).toEqual(['cutoff'])
    expect(f[0].daysAway).toBe(19)
    expect(f[0].state).toBe('ok')
  })

  it('stops mattering once the order has been bought', () => {
    // The purchase order is placed. Nobody is changing it now, so a red flag
    // on the cut-off is noise.
    for (const stage of ['ordered', 'shipped', 'invoiced']) {
      expect(orderDateFlags({ ...base, stage, cutoffDate: '2026-08-01' }, TODAY)).toEqual([])
    }
  })

  it('turns red once it has gone by', () => {
    const f = orderDateFlags({ ...base, cutoffDate: '2026-08-25' }, TODAY)
    expect(f[0]).toMatchObject({ state: 'passed', daysAway: -7 })
  })
})

describe('the ETD', () => {
  it('matters until everything has gone', () => {
    expect(orderDateFlags({ ...base, stage: 'ordered', etd: '2026-09-15' }, TODAY).map(x => x.kind)).toEqual(['etd'])
  })

  it('stops mattering when the order has fully shipped', () => {
    expect(orderDateFlags({ ...base, stage: 'shipped', etd: '2026-08-01', fullyShipped: true }, TODAY)).toEqual([])
  })

  it('still shouts about an ETD that passed on a part-shipped order', () => {
    const f = orderDateFlags({ ...base, stage: 'shipped', etd: '2026-08-20', fullyShipped: false }, TODAY)
    expect(f[0]).toMatchObject({ kind: 'etd', state: 'passed', daysAway: -12 })
  })

  it(`warns inside ${SOON_DAYS} days`, () => {
    expect(orderDateFlags({ ...base, etd: '2026-09-05' }, TODAY)[0].state).toBe('soon')
    expect(orderDateFlags({ ...base, etd: '2026-09-09' }, TODAY)[0].state).toBe('ok')
  })

  it('counts today as soon, not passed', () => {
    expect(orderDateFlags({ ...base, etd: TODAY }, TODAY)[0]).toMatchObject({ state: 'soon', daysAway: 0 })
  })
})

describe('orders that are over', () => {
  it('says nothing about a closed or cancelled order', () => {
    for (const stage of ['closed', 'cancelled']) {
      expect(orderDateFlags({ ...base, stage, cutoffDate: '2026-01-01', etd: '2026-01-01' }, TODAY)).toEqual([])
    }
  })
})

describe('odds and ends', () => {
  it('says nothing when no dates are set', () => {
    expect(orderDateFlags(base, TODAY)).toEqual([])
  })

  it('ignores a date it cannot read rather than showing NaN', () => {
    expect(orderDateFlags({ ...base, etd: 'not a date' }, TODAY)).toEqual([])
  })

  it('can show both at once', () => {
    expect(orderDateFlags({ ...base, cutoffDate: '2026-09-03', etd: '2026-09-25' }, TODAY).map(f => f.kind))
      .toEqual(['cutoff', 'etd'])
  })
})

describe('saying it in words', () => {
  it('reads like a person', () => {
    expect(whenWords(0)).toBe('today')
    expect(whenWords(1)).toBe('tomorrow')
    expect(whenWords(-1)).toBe('yesterday')
    expect(whenWords(5)).toBe('in 5 days')
    expect(whenWords(-12)).toBe('12 days ago')
  })
})

describe('across the whole list', () => {
  it('counts each order once, by its worst flag', () => {
    const late = [{ kind: 'etd' as const, label: 'ETD', date: 'x', state: 'passed' as const, daysAway: -1 },
                  { kind: 'cutoff' as const, label: 'Cut-off', date: 'x', state: 'soon' as const, daysAway: 2 }]
    const soon = [{ kind: 'etd' as const, label: 'ETD', date: 'x', state: 'soon' as const, daysAway: 2 }]
    expect(countLate([late, soon, []])).toEqual({ passed: 1, soon: 1 })
  })
})
