// What time the auction starts.
//
// This exists because the notice sent to every member carried the string
// '6:30 PM', typed into the code, for every group in every month. A notice that
// states the wrong time is worse than one that states none — members turn up
// when it says — so the conversions between what the database holds, what a
// browser sends, and what a person reads are tested rather than trusted.

import { describe, it, expect } from 'vitest'
import {
  formatAuctionTime, toTimeInput, toStoredTime, parseAuctionTime,
} from '@/lib/chit/auctionTime'

describe('reading what the database holds', () => {
  it('accepts the form Postgres returns', () => {
    expect(parseAuctionTime('18:30:00')).toEqual({ hour: 18, minute: 30 })
  })

  it('accepts the form a browser sends', () => {
    expect(parseAuctionTime('18:30')).toEqual({ hour: 18, minute: 30 })
  })

  it('refuses a time that is not one, rather than guessing', () => {
    for (const bad of ['', null, undefined, 'evening', '6:30 PM', '25:00', '18:60', '1830', '-1:00']) {
      expect(parseAuctionTime(bad as string), String(bad)).toBeNull()
    }
  })
})

describe('writing it the way a member reads it', () => {
  it('turns 24-hour into 12-hour with AM and PM', () => {
    expect(formatAuctionTime('18:30:00')).toBe('6:30 PM')
    expect(formatAuctionTime('09:05')).toBe('9:05 AM')
    expect(formatAuctionTime('13:00')).toBe('1:00 PM')
  })

  it('gets midnight and noon right, which is where this usually breaks', () => {
    expect(formatAuctionTime('00:00')).toBe('12:00 AM')
    expect(formatAuctionTime('00:30')).toBe('12:30 AM')
    expect(formatAuctionTime('12:00')).toBe('12:00 PM')
    expect(formatAuctionTime('12:45')).toBe('12:45 PM')
  })

  it('keeps the leading zero on the minutes', () => {
    // '6:5 PM' would look like a typo in a message sent to twenty people.
    expect(formatAuctionTime('18:05')).toBe('6:05 PM')
  })

  it('gives nothing at all when there is no time set', () => {
    // The notice then omits the line, instead of printing a made-up time.
    expect(formatAuctionTime(null)).toBeNull()
    expect(formatAuctionTime('')).toBeNull()
    expect(formatAuctionTime('nonsense')).toBeNull()
  })
})

describe('the round trip', () => {
  it('survives database → form → database unchanged', () => {
    for (const stored of ['18:30:00', '09:05:00', '00:00:00', '23:59:00']) {
      expect(toStoredTime(toTimeInput(stored)), stored).toBe(stored)
    }
  })

  it('hands an input box something it can show', () => {
    expect(toTimeInput('18:30:00')).toBe('18:30')
    expect(toTimeInput('9:05')).toBe('09:05')
    expect(toTimeInput(null)).toBe('')
  })

  it('stores null when the field is cleared, not a zero time', () => {
    // Blank must mean "no time stated", not midnight.
    expect(toStoredTime('')).toBeNull()
    expect(toStoredTime(null)).toBeNull()
    expect(toStoredTime('   ')).toBeNull()
  })

  it('refuses to store something a person typed badly', () => {
    expect(toStoredTime('6:30 PM')).toBeNull()
    expect(toStoredTime('25:00')).toBeNull()
  })
})
