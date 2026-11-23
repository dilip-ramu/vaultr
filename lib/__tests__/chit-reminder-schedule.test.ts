import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STEPS, PRESETS, addDays, stepDate, stepWords, stepProblem,
  resolveSteps, plan, sendKey, timetable, planWords,
  stepLabel, uniqueStepKey, newStep, dueDateFor,
  type Step, type MemberLike, type PlanInput,
} from '@/lib/chit/reminderSchedule'

const step = (o: Partial<Step> & { key: string }): Step => ({
  kind: 'reminder', audience: 'unpaid', anchor: 'auction', offsetDays: 5, enabled: true, ...o,
})
const member = (id: string, o: Partial<MemberLike> = {}): MemberLike =>
  ({ id, name: id.toUpperCase(), phone: '9876543210', ...o })

const input = (o: Partial<PlanInput> = {}): PlanInput => ({
  auctionId: 'a1',
  anchors: { auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05' },
  groupSteps: DEFAULT_STEPS,
  members: [member('m1')],
  today: '2026-11-10',
  ...o,
})

describe('dates', () => {
  it('adds days without a timezone shifting it', () => {
    expect(addDays('2026-11-05', 5)).toBe('2026-11-10')
    expect(addDays('2026-11-05', -3)).toBe('2026-11-02')
    expect(addDays('2026-11-05', 0)).toBe('2026-11-05')
  })

  it('crosses a month and a year end', () => {
    expect(addDays('2026-11-25', 10)).toBe('2026-12-05')
    expect(addDays('2026-12-28', 5)).toBe('2027-01-02')
    expect(addDays('2027-01-02', -5)).toBe('2026-12-28')
  })

  it('handles a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('refuses what is not a date', () => {
    expect(addDays('nonsense', 1)).toBeNull()
    expect(addDays('', 1)).toBeNull()
  })
})

describe('when a step falls', () => {
  const anchors = { auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05' }

  it('works off the auction', () => {
    expect(stepDate(step({ key: 'a', offsetDays: 5 }), anchors)).toBe('2026-11-10')
    expect(stepDate(step({ key: 'b', offsetDays: -3 }), anchors)).toBe('2026-11-02')
  })

  it('works off the NEXT auction', () => {
    expect(stepDate(step({ key: 'c', anchor: 'next_auction', offsetDays: -1 }), anchors)).toBe('2026-12-04')
  })

  it('waits when the next auction is not known yet', () => {
    // Better nothing than a message dated off a guess.
    expect(stepDate(step({ key: 'c', anchor: 'next_auction' }), { auctionDate: '2026-11-05' })).toBeNull()
  })
})

describe('saying it in words', () => {
  it('reads the way somebody would say it', () => {
    expect(stepWords(step({ key: 'a', offsetDays: 0, anchor: 'auction' }))).toBe('on auction day')
    expect(stepWords(step({ key: 'b', offsetDays: -3 }))).toBe('3 days before the auction')
    expect(stepWords(step({ key: 'c', offsetDays: 5 }))).toBe('5 days after the auction')
    expect(stepWords(step({ key: 'd', offsetDays: -1, anchor: 'next_auction' }))).toBe('1 day before the next auction')
  })

  it('gets the singular right', () => {
    expect(stepWords(step({ key: 'e', offsetDays: 1 }))).toBe('1 day after the auction')
  })
})

describe('what can be saved', () => {
  it('allows a sensible offset', () => {
    expect(stepProblem(step({ key: 'a', offsetDays: 15 }))).toBeNull()
  })

  it('refuses half days and wild offsets', () => {
    expect(stepProblem(step({ key: 'a', offsetDays: 1.5 }))).toContain('whole days')
    expect(stepProblem(step({ key: 'b', offsetDays: 90 }))).toContain('within 60 days')
    expect(stepProblem(step({ key: 'c', offsetDays: -90 }))).toContain('within 60 days')
  })
})

describe('whose schedule applies', () => {
  it('uses the group when the member has none', () => {
    expect(resolveSteps(DEFAULT_STEPS, null)).toBe(DEFAULT_STEPS)
    expect(resolveSteps(DEFAULT_STEPS, [])).toBe(DEFAULT_STEPS)
  })

  it('REPLACES the group with the member’s own, never merging', () => {
    // Two schedules layered on each other cannot be reasoned about at the
    // moment a message goes out at the wrong time.
    const mine = [step({ key: 'only-this' })]
    expect(resolveSteps(DEFAULT_STEPS, mine)).toBe(mine)
    expect(resolveSteps(DEFAULT_STEPS, mine)).toHaveLength(1)
  })
})

describe('who gets messaged today', () => {
  it('sends the 5-day reminder on the fifth day', () => {
    const p = plan(input({ today: '2026-11-10' }))
    expect(p.due.map(d => d.stepKey)).toEqual(['remind-1'])
  })

  it('sends nothing on a day no step falls on', () => {
    expect(plan(input({ today: '2026-11-11' })).due).toEqual([])
  })

  it('sends the notice before the auction and the dues on the day', () => {
    expect(plan(input({ today: '2026-11-02' })).due.map(d => d.stepKey)).toEqual(['notice'])
    const onDay = plan(input({ today: '2026-11-05', winnerMemberId: 'm1' }))
    expect(onDay.due.map(d => d.stepKey).sort()).toEqual(['dues', 'winner'])
  })

  it('skips a member who has already paid', () => {
    // The whole point: chasing somebody who paid is how a number gets reported.
    const p = plan(input({ paidMemberIds: ['m1'] }))
    expect(p.due).toEqual([])
    expect(p.skipped.some(s => s.reason === 'paid')).toBe(true)
  })

  it('still sends the notice and the dues to somebody who has paid', () => {
    // Those are not chasing; they are information everybody needs.
    const p = plan(input({ today: '2026-11-05', paidMemberIds: ['m1'], winnerMemberId: 'm1' }))
    expect(p.due.map(d => d.stepKey).sort()).toEqual(['dues', 'winner'])
  })

  it('sends the winner particulars only to the winner', () => {
    const p = plan(input({
      today: '2026-11-05',
      members: [member('m1'), member('m2')],
      winnerMemberId: 'm2',
    }))
    expect(p.due.filter(d => d.stepKey === 'winner').map(d => d.memberId)).toEqual(['m2'])
  })

  it('sends no winner particulars before the auction has a winner', () => {
    const p = plan(input({ today: '2026-11-05', winnerMemberId: null }))
    expect(p.due.some(d => d.stepKey === 'winner')).toBe(false)
  })

  it('skips a member with no phone number, and says so', () => {
    const p = plan(input({ members: [member('m1', { phone: null })] }))
    expect(p.due).toEqual([])
    expect(p.skipped.some(s => s.reason === 'no_phone')).toBe(true)
  })

  it('never sends the same message twice', () => {
    const key = sendKey('a1', 'm1', 'remind-1')
    const p = plan(input({ sentKeys: [key] }))
    expect(p.due).toEqual([])
    expect(p.skipped.some(s => s.reason === 'already_sent')).toBe(true)
  })

  it('keys a send by auction, member and step, so a new month sends again', () => {
    expect(sendKey('a1', 'm1', 'remind-1')).toBe('a1:m1:remind-1')
    expect(plan(input({ auctionId: 'a2', sentKeys: [sendKey('a1', 'm1', 'remind-1')] })).due).toHaveLength(1)
  })

  it('skips a disabled step', () => {
    const steps = DEFAULT_STEPS.map(s => s.key === 'remind-1' ? { ...s, enabled: false } : s)
    expect(plan(input({ groupSteps: steps })).due).toEqual([])
  })

  it('honours a member’s own schedule over the group’s', () => {
    const quiet = plan(input({ members: [member('m1', { steps: PRESETS.gentle })] }))
    expect(quiet.due).toEqual([])

    const pushy = plan(input({
      today: '2026-11-06',
      members: [member('m1', { steps: PRESETS.persistent })],
    }))
    expect(pushy.due.map(d => d.stepKey)).toEqual(['remind-0'])
  })

  it('waits on a step anchored to an auction that is not scheduled yet', () => {
    const p = plan(input({ today: '2026-12-04', anchors: { auctionDate: '2026-11-05' } }))
    expect(p.due).toEqual([])
    expect(p.skipped.some(s => s.reason === 'anchor_unknown')).toBe(true)
  })

  it('plans a whole group at once', () => {
    const p = plan(input({
      members: [member('m1'), member('m2'), member('m3', { phone: null }), member('m4')],
      paidMemberIds: ['m4'],
    }))
    expect(p.due.map(d => d.memberId)).toEqual(['m1', 'm2'])
  })
})

describe('the timetable for a month', () => {
  it('lists every step in the order it happens', () => {
    const t = timetable(DEFAULT_STEPS, { auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05' })
    expect(t.map(x => x.date)).toEqual([
      '2026-11-02', '2026-11-05', '2026-11-05', '2026-11-10', '2026-11-20', '2026-12-04',
    ])
  })

  it('puts a step with no date at the end rather than dropping it', () => {
    const t = timetable(DEFAULT_STEPS, { auctionDate: '2026-11-05' })
    expect(t.at(-1)?.date).toBeNull()
  })
})

describe('the line the screen shows', () => {
  it('counts who is being messaged and why the rest are not', () => {
    const p = plan(input({
      members: [member('m1'), member('m2'), member('m3', { phone: null }), member('m4')],
      paidMemberIds: ['m4'],
    }))
    expect(planWords(p)).toBe('2 to message · 1 has paid · 1 with no phone number')
  })

  it('says why there is nothing to do', () => {
    expect(planWords(plan(input({ paidMemberIds: ['m1'] }))))
      .toBe('Nothing to send today — 1 member has paid.')
    expect(planWords(plan(input({ today: '2026-11-11' })))).toBe('Nothing to send today.')
  })
})


describe('a schedule you can add to', () => {
  it('names a step after its message, or after its kind', () => {
    expect(stepLabel(step({ key: 'x', label: 'Second push' }))).toBe('Second push')
    expect(stepLabel(step({ key: 'x', kind: 'notice' }))).toBe('Auction notice')
    expect(stepLabel(step({ key: 'x', label: '   ' }))).toBe('Payment reminder')
  })

  // A key is what the log is written against. Reusing one would make an old
  // send look like today's and stop the new step going out at all.
  it('never reuses a key', () => {
    const existing = [step({ key: 'step-1' }), step({ key: 'step-2' })]
    expect(uniqueStepKey(existing)).toBe('step-3')
    expect(uniqueStepKey([])).toBe('step-1')
  })

  it('adds a step that is ready to use', () => {
    const s = newStep(DEFAULT_STEPS)
    expect(s.key).toBe('step-1')
    expect(s.enabled).toBe(true)
    expect(s.templateId).toBeNull()
    expect(stepProblem(s)).toBeNull()
  })

  it('takes what you give it', () => {
    const s = newStep([], { offsetDays: 20, audience: 'all', templateId: 'abc' })
    expect(s.offsetDays).toBe(20)
    expect(s.audience).toBe('all')
    expect(s.templateId).toBe('abc')
  })

  it('plans a schedule of any length', () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) =>
      step({ key: `r-${i}`, offsetDays: n }))
    const result = plan(input({ groupSteps: many, today: '2026-11-08' }))
    expect(result.due).toHaveLength(1)
    expect(result.due[0].stepKey).toBe('r-2')
  })
})

describe('when the subscription falls due', () => {
  it('counts the days from the auction when they are set', () => {
    expect(dueDateFor('2026-11-05', '2026-12-05', 10)).toBe('2026-11-15')
    expect(dueDateFor('2026-11-05', '2026-12-05', 0)).toBe('2026-11-05')
  })

  // The latest it could possibly be owed is the next auction, so that is the
  // honest fallback rather than a number nobody chose.
  it('falls back to the next auction', () => {
    expect(dueDateFor('2026-11-05', '2026-12-05', null)).toBe('2026-12-05')
    expect(dueDateFor('2026-11-05', null, null)).toBeNull()
  })
})

describe('what to send, and which message', () => {
  it('carries the message the step points at', () => {
    const r = plan(input({
      groupSteps: [step({ key: 'r1', offsetDays: 5, templateId: 'tpl-9' })],
      today: '2026-11-10',
    }))
    expect(r.due[0].templateId).toBe('tpl-9')
  })

  it('says so plainly when no message was chosen', () => {
    const r = plan(input({
      groupSteps: [step({ key: 'r1', offsetDays: 5 })],
      today: '2026-11-10',
    }))
    expect(r.due[0].templateId).toBeNull()
  })
})
