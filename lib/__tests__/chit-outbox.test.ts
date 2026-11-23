import { describe, it, expect } from 'vitest'
import {
  scheduleProblem, isDue, dueFirst, whenWords, precisionWords, scopeWords,
  type ScheduleDraft,
} from '@/lib/chit/outbox'

const now = new Date('2026-11-24T12:00:00Z')
const draft = (o: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  templateId: 't1', scope: 'all', ...o,
})

describe('what stops a send being queued', () => {
  it('passes a sensible one', () => {
    expect(scheduleProblem(draft(), now)).toBeNull()
    expect(scheduleProblem(draft({ sendAt: '2026-11-24T18:30:00Z' }), now)).toBeNull()
  })

  it('asks for the message', () => {
    expect(scheduleProblem(draft({ templateId: '' }), now)).toContain('which message')
  })

  it('asks which group or which member', () => {
    expect(scheduleProblem(draft({ scope: 'group' }), now)).toContain('which group')
    expect(scheduleProblem(draft({ scope: 'member' }), now)).toContain('which member')
    expect(scheduleProblem(draft({ scope: 'group', groupId: 'g1' }), now)).toBeNull()
    expect(scheduleProblem(draft({ scope: 'member', memberId: 'm1' }), now)).toBeNull()
  })

  it('refuses a time that has passed', () => {
    expect(scheduleProblem(draft({ sendAt: '2026-11-24T11:00:00Z' }), now)).toContain('has passed')
  })

  // Pressing send on the minute you just picked must not be refused by a
  // second or two of lag.
  it('allows a minute of grace', () => {
    expect(scheduleProblem(draft({ sendAt: '2026-11-24T11:59:30Z' }), now)).toBeNull()
  })

  it('refuses an unreadable date and an absurd one', () => {
    expect(scheduleProblem(draft({ sendAt: 'next tuesday' }), now)).toContain('cannot be read')
    expect(scheduleProblem(draft({ sendAt: '2030-01-01T00:00:00Z' }), now)).toContain('more than a year')
  })
})

describe('what is due', () => {
  it('is due at its time and after it', () => {
    expect(isDue({ status: 'queued', sendAt: '2026-11-24T12:00:00Z' }, now)).toBe(true)
    expect(isDue({ status: 'queued', sendAt: '2026-11-24T09:00:00Z' }, now)).toBe(true)
  })

  it('is not due before its time', () => {
    expect(isDue({ status: 'queued', sendAt: '2026-11-24T18:00:00Z' }, now)).toBe(false)
  })

  // Anything already dealt with stays dealt with: this is what stops a second
  // run sending the same thing again.
  it('ignores anything not queued', () => {
    for (const status of ['sent', 'failed', 'cancelled'] as const) {
      expect(isDue({ status, sendAt: '2026-11-24T09:00:00Z' }, now)).toBe(false)
    }
  })

  it('sends a backlog oldest first', () => {
    const rows = [
      { status: 'queued' as const, sendAt: '2026-11-24T11:00:00Z', id: 'b' },
      { status: 'queued' as const, sendAt: '2026-11-24T08:00:00Z', id: 'a' },
      { status: 'queued' as const, sendAt: '2026-11-25T08:00:00Z', id: 'later' },
      { status: 'cancelled' as const, sendAt: '2026-11-24T08:00:00Z', id: 'no' },
    ]
    expect(dueFirst(rows, now).map(r => r.id)).toEqual(['a', 'b'])
  })
})

describe('saying when, and how exact', () => {
  it('counts forward in the units a person would use', () => {
    expect(whenWords('2026-11-24T12:20:00Z', now)).toBe('in 20 minutes')
    expect(whenWords('2026-11-24T12:01:00Z', now)).toBe('in 1 minute')
    expect(whenWords('2026-11-24T15:00:00Z', now)).toBe('in 3 hours')
    expect(whenWords('2026-11-26T12:00:00Z', now)).toBe('in 2 days')
    expect(whenWords('2026-11-24T11:00:00Z', now)).toBe('now')
    expect(whenWords('rubbish', now)).toContain('unreadable')
  })

  // A queue that drains once a day looks broken to somebody who picked 6:30pm
  // and saw nothing at 6:31, so the screen says so.
  it('is honest about how close to the minute it can be', () => {
    expect(precisionWords(true)).toContain('every few minutes')
    expect(precisionWords(false)).toContain('once a day')
  })

  it('says who it is going to', () => {
    expect(scopeWords('all')).toBe('to every active group')
    expect(scopeWords('group', 'Uma 5 Lakh A')).toBe('to Uma 5 Lakh A')
    expect(scopeWords('member', 'Ravi')).toBe('to Ravi')
    expect(scopeWords('group', null)).toBe('to one group')
  })
})
