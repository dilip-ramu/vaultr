import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STEPS, PRESETS, addDays, stepDate, stepWords, stepProblem,
  resolveSteps, plan, sendKey, timetable, planWords,
  stepLabel, uniqueStepKey, newStep, dueDateFor, isSettledSend,
  type Step, type MemberLike, type PlanInput,
} from '@/lib/chit/reminderSchedule'

const step = (o: Partial<Step> & { key: string }): Step => ({
  kind: 'reminder', audience: 'unpaid', anchor: 'auction', offsetDays: 5, enabled: true, ...o,
})
const member = (id: string, o: Partial<MemberLike> = {}): MemberLike =>
  ({ id, name: id.toUpperCase(), phone: '9876543210', ...o })

const input = (o: Partial<PlanInput> = {}): PlanInput => ({
  auctionId: 'a1',
  anchors: { auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05', settledDate: '2026-11-05' },
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
  const anchors = { auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05', settledDate: '2026-11-07' }

  it('works off the auction', () => {
    expect(stepDate(step({ key: 'a', offsetDays: 5 }), anchors)).toBe('2026-11-10')
    expect(stepDate(step({ key: 'b', offsetDays: -3 }), anchors)).toBe('2026-11-02')
  })

  it('works off the NEXT auction', () => {
    expect(stepDate(step({ key: 'c', anchor: 'next_auction', offsetDays: -1 }), anchors)).toBe('2026-12-04')
    // The day it was RECORDED, which is often not the day it was held.
    expect(stepDate(step({ key: 'd', anchor: 'settled', offsetDays: 0 }), anchors)).toBe('2026-11-07')
    expect(stepDate(step({ key: 'e', anchor: 'settled', offsetDays: 2 }), anchors)).toBe('2026-11-09')
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
    expect(stepWords(step({ key: 'e', offsetDays: 0, anchor: 'settled' }))).toBe('as soon as the auction is recorded')
    expect(stepWords(step({ key: 'f', offsetDays: 2, anchor: 'settled' }))).toBe('2 days after the auction is recorded')
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
    // m1 won, so m1 gets the winner message and m2 gets the dues — the winner
    // is not sent both.
    const onDay = plan(input({
      today: '2026-11-05', winnerMemberId: 'm1',
      members: [member('m1'), member('m2')],
    }))
    expect(onDay.due.map(d => `${d.stepKey}:${d.memberId}`).sort())
      .toEqual(['dues:m2', 'winner:m1'])
  })

  it('skips a member who has already paid', () => {
    // The whole point: chasing somebody who paid is how a number gets reported.
    const p = plan(input({ paidMemberIds: ['m1'] }))
    expect(p.due).toEqual([])
    expect(p.skipped.some(s => s.reason === 'paid')).toBe(true)
  })

  it('still sends the dues to somebody who has paid', () => {
    // That is not chasing; it is information everybody needs.
    const p = plan(input({ today: '2026-11-05', paidMemberIds: ['m1'], winnerMemberId: 'm9' }))
    expect(p.due.map(d => d.stepKey)).toEqual(['dues'])
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
    const t = timetable(DEFAULT_STEPS, {
      auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05', settledDate: '2026-11-06',
    })
    expect(t.map(x => x.date)).toEqual([
      '2026-11-02', '2026-11-06', '2026-11-06', '2026-11-10', '2026-11-20', '2026-12-04',
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


describe('the result messages wait for the auction to be recorded', () => {
  // The whole point of the 'settled' anchor: the dues and the winner's
  // particulars cannot be written before the figures are entered, and a chit
  // auction is often entered a day or two after it is held.
  it('ships the dues and the winner message anchored to the recording', () => {
    for (const key of ['dues', 'winner']) {
      const s = DEFAULT_STEPS.find(x => x.key === key)!
      expect({ key, anchor: s.anchor, offset: s.offsetDays })
        .toEqual({ key, anchor: 'settled', offset: 0 })
    }
  })

  it('sends them the day the auction is recorded, not the day it was held', () => {
    const late = { auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05', settledDate: '2026-11-07' }
    const two = [member('m1'), member('m2')]
    expect(plan(input({ anchors: late, today: '2026-11-05', winnerMemberId: 'm1', members: two })).due).toEqual([])
    expect(plan(input({ anchors: late, today: '2026-11-07', winnerMemberId: 'm1', members: two }))
      .due.map(d => d.stepKey).sort()).toEqual(['dues', 'winner'])
  })

  it('holds them while the auction is unrecorded', () => {
    const p = plan(input({
      anchors: { auctionDate: '2026-11-05', nextAuctionDate: '2026-12-05', settledDate: null },
      today: '2026-11-05', winnerMemberId: 'm1',
    }))
    expect(p.due).toEqual([])
    expect([...new Set(p.skipped.filter(x => x.reason === 'anchor_unknown').map(x => x.stepKey))].sort())
      .toEqual(['dues', 'winner'])
  })

  // A date counted backwards from the moment of recording is already past.
  it('refuses a step before the recording', () => {
    expect(stepProblem(step({ key: 'x', anchor: 'settled', offsetDays: -1 })))
      .toBe('Nothing can go out before the auction is recorded.')
    expect(stepProblem(step({ key: 'x', anchor: 'settled', offsetDays: 0 }))).toBeNull()
  })

  it('leaves the notice and the reminders on the auction dates', () => {
    expect(DEFAULT_STEPS.find(s => s.key === 'notice')!.anchor).toBe('auction')
    expect(DEFAULT_STEPS.filter(s => s.kind === 'reminder').every(s => s.anchor !== 'settled')).toBe(true)
  })
})

describe('everybody except the winner', () => {
  // The winner gets their own message the same day. Two on one day reads as
  // not knowing who won.
  it('leaves the winner out, and says why', () => {
    const p = plan(input({
      groupSteps: [step({ key: 'dues', kind: 'dues', audience: 'except_winner', anchor: 'settled', offsetDays: 0 })],
      members: [member('m1'), member('m2'), member('m3')],
      winnerMemberId: 'm2',
      today: '2026-11-05',
    }))
    expect(p.due.map(d => d.memberId)).toEqual(['m1', 'm3'])
    expect(p.skipped.filter(s => s.reason === 'is_winner').map(s => s.memberId)).toEqual(['m2'])
  })

  it('sends to everybody in a month nobody won', () => {
    const p = plan(input({
      groupSteps: [step({ key: 'dues', kind: 'dues', audience: 'except_winner', anchor: 'settled', offsetDays: 0 })],
      members: [member('m1'), member('m2')],
      winnerMemberId: null,
      today: '2026-11-05',
    }))
    expect(p.due.map(d => d.memberId)).toEqual(['m1', 'm2'])
  })

  // It is an announcement, not a chase, so paying early does not opt you out.
  it('still reaches somebody who has paid', () => {
    const p = plan(input({
      groupSteps: [step({ key: 'dues', kind: 'dues', audience: 'except_winner', anchor: 'settled', offsetDays: 0 })],
      paidMemberIds: ['m1'],
      today: '2026-11-05',
    }))
    expect(p.due.map(d => d.memberId)).toEqual(['m1'])
  })

  it('ships the dues step that way', () => {
    expect(DEFAULT_STEPS.find(s => s.key === 'dues')!.audience).toBe('except_winner')
  })
})

describe('what counts as finished business', () => {
  // The bug this guards: every message recorded as pending while there was no
  // WhatsApp number would have been counted as done, and never sent.
  it('plans a waiting message again', () => {
    expect(isSettledSend('pending')).toBe(false)
    expect(isSettledSend('held')).toBe(false)
  })

  // A member with no usable phone number should not be retried every morning
  // for a month.
  it('leaves a sent or failed one alone', () => {
    expect(isSettledSend('sent')).toBe(true)
    expect(isSettledSend('failed')).toBe(true)
  })

  it('treats anything it does not recognise as finished', () => {
    expect(isSettledSend('')).toBe(true)
    expect(isSettledSend('PENDING')).toBe(false)
  })
})

describe('a member who asked not to be messaged', () => {
  // Not optional: on WhatsApp, members marking messages as spam costs
  // delivery for every member, not only the one who complained.
  it('is left out, and said so plainly', () => {
    const p = plan(input({ members: [member('m1', { optedOut: true }), member('m2')] }))
    expect(p.due.map(d => d.memberId)).toEqual(['m2'])
    expect(p.skipped.some(s => s.memberId === 'm1' && s.reason === 'opted_out')).toBe(true)
  })

  it('counts them in the summary', () => {
    const p = plan(input({ members: [member('m1', { optedOut: true })] }))
    expect(planWords(p)).toContain('asked not to be messaged')
  })

  // Even a notice, which is information rather than a chase.
  it('is left out of every kind of message', () => {
    const p = plan(input({
      members: [member('m1', { optedOut: true })],
      today: '2026-11-02',
    }))
    expect(p.due).toEqual([])
  })
})
