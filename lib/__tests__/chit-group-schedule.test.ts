// When a group starts, when it ends, and whether it is over.
//
// Neither date is stored — both are implied by the start date, the auction day
// and the tenure. The month arithmetic is where this quietly goes wrong, so the
// awkward cases are the ones tested: a chit auctioning on the 31st, one that
// crosses a year, and a group the owner has closed early.

import { describe, it, expect } from 'vitest'
import { groupSchedule, isPast, type ScheduleInput } from '@/lib/chit/groupSchedule'

const group = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  start_date: '2026-06-05',
  auction_day: 5,
  members: 26,
  commission_model: 'MONTHLY',
  status: 'active',
  ...over,
})

describe('the first and last auction', () => {
  it('starts on the first auction, not on the day the row was created', () => {
    expect(groupSchedule(group(), '2026-10-14').firstAuction).toBe('2026-06-05')
  })

  it('ends on the last auction of the tenure', () => {
    // 26 members, monthly model → 26 months. Month 1 is June 2026, month 26 is
    // July 2028.
    const s = groupSchedule(group(), '2026-10-14')
    expect(s.months).toBe(26)
    expect(s.lastAuction).toBe('2028-07-05')
  })

  it('runs one month longer on the upfront model, because it has an extra turn', () => {
    const s = groupSchedule(group({ commission_model: 'UPFRONT' }), '2026-10-14')
    expect(s.months).toBe(27)
    expect(s.lastAuction).toBe('2028-08-05')
  })

  it('does not invent a 31st of February', () => {
    const s = groupSchedule(group({ start_date: '2026-01-31', auction_day: 31, members: 2 }), '2026-10-14')
    expect(s.firstAuction).toBe('2026-01-31')
    expect(s.lastAuction).toBe('2026-02-28')   // clamped to the real month end
  })

  it('crosses the new year without landing on month zero', () => {
    const s = groupSchedule(group({ start_date: '2026-11-05', members: 4 }), '2026-10-14')
    expect(s.lastAuction).toBe('2027-02-05')
  })

  it('has no dates at all when the group has no start date', () => {
    const s = groupSchedule(group({ start_date: null }), '2026-10-14')
    expect(s.firstAuction).toBeNull()
    expect(s.lastAuction).toBeNull()
    expect(s.phase).toBe('undated')
  })
})

describe('which groups are finished', () => {
  it('is running between the first auction and the last', () => {
    expect(groupSchedule(group(), '2026-10-14').phase).toBe('running')
    expect(groupSchedule(group(), '2026-06-05').phase).toBe('running')   // the first day counts
    expect(groupSchedule(group(), '2028-07-05').phase).toBe('running')   // and so does the last
  })

  it('is upcoming before the first auction', () => {
    expect(groupSchedule(group(), '2026-05-30').phase).toBe('upcoming')
  })

  it('is past the day after the last auction', () => {
    expect(groupSchedule(group(), '2028-07-06').phase).toBe('past')
  })

  it('believes the owner over the calendar', () => {
    // Closed early, or abandoned. Either way it is not running.
    expect(groupSchedule(group({ status: 'completed' }), '2026-10-14').phase).toBe('past')
    expect(groupSchedule(group({ status: 'cancelled' }), '2026-10-14').phase).toBe('past')
  })

  it('sorts only finished groups into the past', () => {
    expect(isPast('past')).toBe(true)
    for (const p of ['running', 'upcoming', 'undated'] as const) {
      expect(isPast(p), p).toBe(false)
    }
  })
})

describe('how far through it is', () => {
  it('counts the auctions that should have happened by now', () => {
    // June, July, August, September, and October's is on the 5th.
    expect(groupSchedule(group(), '2026-10-14').monthsElapsed).toBe(5)
    expect(groupSchedule(group(), '2026-10-04').monthsElapsed).toBe(4)
  })

  it('never counts past the end of the chit', () => {
    expect(groupSchedule(group(), '2030-01-01').monthsElapsed).toBe(26)
  })

  it('counts nothing before it starts', () => {
    expect(groupSchedule(group(), '2026-01-01').monthsElapsed).toBe(0)
  })
})
