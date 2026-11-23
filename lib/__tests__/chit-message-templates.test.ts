import { describe, it, expect } from 'vitest'
import {
  compile, normalizeToken, fieldsUsed, insertToken, toDraft, previewOf,
  templateProblems, canSubmit, renderVariables, slugFromLabel, uniqueName,
  blankTemplate, duplicateOf, templateById, stepWarning, fromNumbered,
  matchStepsToLibrary, STARTER_LIBRARY,
  type MessageTemplate,
} from '@/lib/chit/messageTemplates'
import type { Facts } from '@/lib/chit/messageFields'
import type { Audience } from '@/lib/chit/reminderSchedule'

const tpl = (o: Partial<MessageTemplate> = {}): MessageTemplate => ({
  id: 't1', label: 'Test message', name: 'chit_test', language: 'en',
  category: 'UTILITY', audience: 'all',
  body: 'Hello {{member_name}}, your subscription for {{month}} is Rs {{amount_due}}. Thank you.',
  footer: null, status: 'DRAFT', editTimes: [],
  ...o,
})

const facts = (o: Partial<Facts> = {}): Facts => ({
  memberName: 'Ravi', month: 'November 2026', amountDue: 23750,
  groupName: 'Uma 5 Lakh A', installment: 25000, chitValue: 500000,
  auctionDate: '2026-11-05', auctionTime: '6:30 PM', dueDate: '2026-11-15',
  bidAmount: 60000, netPayout: 425000, bankName: 'HDFC Bank',
  accountEnding: '987654324321', today: '2026-11-20',
  ...o,
})

describe('writing with names, submitting with numbers', () => {
  it('numbers the tokens in the order they appear', () => {
    const c = compile('Hi {{member_name}}, Rs {{amount_due}} for {{month}}.')
    expect(c.text).toBe('Hi {{1}}, Rs {{2}} for {{3}}.')
    expect(c.fields.map(f => f.id)).toEqual(['member_name', 'amount_due', 'month'])
    expect(c.unknown).toEqual([])
  })

  // This is the point of the whole design: moving a sentence cannot produce
  // the out-of-order numbering Meta rejects.
  it('renumbers when the wording is rearranged', () => {
    const a = compile('For {{month}}, Rs {{amount_due}} is due, {{member_name}}.')
    expect(a.text).toBe('For {{1}}, Rs {{2}} is due, {{3}}.')
    expect(a.fields.map(f => f.id)).toEqual(['month', 'amount_due', 'member_name'])
  })

  it('accepts a name written with spaces or capitals', () => {
    expect(normalizeToken(' Member Name ')).toBe('member_name')
    expect(compile('Hi {{Member Name}}.').fields.map(f => f.id)).toEqual(['member_name'])
  })

  it('gives the same field two numbers when it is used twice', () => {
    const c = compile('{{member_name}} — this is for {{member_name}} only.')
    expect(c.text).toBe('{{1}} — this is for {{2}} only.')
    expect(c.fields.map(f => f.id)).toEqual(['member_name', 'member_name'])
  })

  it('leaves a token it does not know exactly as written', () => {
    const c = compile('Hi {{nickname}}, hello.')
    expect(c.text).toBe('Hi {{nickname}}, hello.')
    expect(c.unknown).toEqual(['nickname'])
  })

  it('reports a body with no tokens as having none', () => {
    expect(fieldsUsed('No details at all.')).toEqual([])
  })

  it('inserts a token at the cursor', () => {
    expect(insertToken('Hello , welcome.', 6, 'member_name')).toBe('Hello {{member_name}}, welcome.')
    expect(insertToken('abc', 99, 'month')).toBe('abc{{month}}')
    expect(insertToken('abc', -5, 'month')).toBe('{{month}}abc')
  })
})

describe('what goes to Meta', () => {
  it('carries the numbered body and one example per number', () => {
    const d = toDraft(tpl())
    expect(d.body).toBe('Hello {{1}}, your subscription for {{2}} is Rs {{3}}. Thank you.')
    expect(d.variables.map(v => v.label)).toEqual(['member name', 'month', 'amount due'])
    expect(d.variables.every(v => v.sample.trim() !== '')).toBe(true)
  })

  it('shows the message as a member will read it', () => {
    expect(previewOf(tpl())).toBe('Hello Ravi, your subscription for November 2026 is Rs 23,750. Thank you.')
  })
})

describe('what is wrong with it', () => {
  it('passes a well-written message', () => {
    expect(templateProblems(tpl())).toEqual([])
    expect(canSubmit(tpl())).toBe(true)
  })

  it('asks for a name you will recognise', () => {
    const p = templateProblems(tpl({ label: '  ' }))
    expect(p.some(x => x.message.includes('recognise'))).toBe(true)
  })

  it('names a token it does not understand', () => {
    const p = templateProblems(tpl({ body: 'Hello {{nickname}}, thank you.' }))
    expect(p.some(x => x.message.includes('no detail called "nickname"'))).toBe(true)
  })

  // Somebody who has used WhatsApp Manager will reach for {{1}} out of habit.
  it('explains that numbers are not written by hand', () => {
    const p = templateProblems(tpl({ body: 'Hello {{1}}, thank you.' }))
    expect(p.some(x => x.message.includes('numbering is done for you'))).toBe(true)
  })

  it('stops a winner detail in a message to everybody', () => {
    const p = templateProblems(tpl({
      body: 'Hello {{member_name}}, your bid of Rs {{bid_amount}} has been recorded today.',
    }))
    expect(p.some(x => x.message.includes('only exists for the auction winner'))).toBe(true)
  })

  it('allows the same detail once the audience matches', () => {
    expect(templateProblems(tpl({
      audience: 'winner',
      body: 'Hello {{member_name}}, your bid of Rs {{bid_amount}} has been recorded today.',
    }))).toEqual([])
  })

  it('refuses a detail in the footer, which is the same for everybody', () => {
    const p = templateProblems(tpl({ footer: 'For {{month}}' }))
    expect(p.some(x => x.message.includes('cannot carry a detail'))).toBe(true)
  })

  // Meta's own rules still apply, and they come from templateSpec.
  it("still catches Meta's rules", () => {
    const p = templateProblems(tpl({ body: '{{member_name}} owes Rs {{amount_due}} this month now' }))
    expect(p.some(x => x.message.includes('cannot START with a variable'))).toBe(true)
    expect(templateProblems(tpl({ name: 'Chit Test' }))
      .some(x => x.message.includes('lowercase'))).toBe(true)
  })

  it('every message the app ships with passes', () => {
    for (const t of STARTER_LIBRARY) {
      expect({ label: t.label, problems: templateProblems(t) })
        .toEqual({ label: t.label, problems: [] })
    }
  })
})

describe('filling one in for a member', () => {
  it('gives the values in the order the message uses them', () => {
    expect(renderVariables(tpl(), facts()).values).toEqual(['Ravi', 'November 2026', '23,750'])
  })

  it('reports what it does not know instead of guessing', () => {
    const r = renderVariables(tpl(), facts({ amountDue: null }))
    expect(r.missing).toEqual(['amount_due'])
  })

  it('fills in a winner message, bank and all', () => {
    const winner = STARTER_LIBRARY.find(t => t.audience === 'winner')!
    const r = renderVariables(winner, facts())
    expect(r.missing).toEqual([])
    expect(r.values).toContain('HDFC Bank')
    expect(r.values).toContain('4321')
  })

  it('will not fill in an overdue message before anything is overdue', () => {
    const overdue = STARTER_LIBRARY.find(t => t.name === 'chit_payment_overdue')!
    expect(renderVariables(overdue, facts({ today: '2026-11-10' })).missing).toEqual(['days_overdue'])
    expect(renderVariables(overdue, facts({ today: '2026-11-25' })).missing).toEqual([])
  })
})

describe('naming', () => {
  it('makes a Meta name from a label', () => {
    expect(slugFromLabel('Auction notice')).toBe('chit_auction_notice')
    expect(slugFromLabel('Second reminder!!')).toBe('chit_second_reminder')
    expect(slugFromLabel('   ')).toBe('chit')
  })

  it('avoids a name already taken', () => {
    expect(uniqueName('Auction notice', ['chit_auction_notice'])).toBe('chit_auction_notice_2')
    expect(uniqueName('Auction notice', ['chit_auction_notice', 'chit_auction_notice_2']))
      .toBe('chit_auction_notice_3')
  })

  it('starts a blank message that is not yet submittable', () => {
    const b = blankTemplate(['chit_new_message'])
    expect(b.id).toBe('')
    expect(b.name).toBe('chit_new_message_2')
    expect(b.status).toBe('DRAFT')
    expect(templateProblems(b).length).toBeGreaterThan(0)
  })

  it('copies one as a fresh draft under its own name', () => {
    const d = duplicateOf(tpl({ status: 'APPROVED', editTimes: ['2026-01-01'] }), ['chit_test'])
    expect(d.id).toBe('')
    expect(d.label).toBe('Test message (copy)')
    expect(d.name).not.toBe('chit_test')
    expect(d.status).toBe('DRAFT')
    expect(d.editTimes).toEqual([])
  })
})

describe('the one a step points at', () => {
  const library = [tpl({ id: 'a' }), tpl({ id: 'b', archived: true })]

  it('finds it by id', () => {
    expect(templateById(library, 'a')?.id).toBe('a')
  })

  it('will not use an archived one', () => {
    expect(templateById(library, 'b')).toBeUndefined()
    expect(templateById(library, null)).toBeUndefined()
  })
})

describe('warning before the day arrives', () => {
  const step = { audience: 'unpaid' as const, templateId: 'a', offsetDays: 5, anchor: 'auction' }

  it('asks for a message when none is chosen', () => {
    expect(stepWarning({ ...step, templateId: null }, undefined, 10)).toContain('Choose which message')
  })

  it('refuses an archived one', () => {
    expect(stepWarning(step, tpl({ archived: true, audience: 'unpaid' }), 10)).toContain('archived')
  })

  it('notices the message is written for somebody else', () => {
    expect(stepWarning(step, tpl({ audience: 'winner' }), 10)).toContain('written for the winner')
  })

  // The mistake this exists for: an overdue message scheduled before the
  // subscription is even due would count zero days and never be sent.
  it('catches an overdue message scheduled too early', () => {
    const overdue = tpl({ audience: 'unpaid', body: 'Hello {{member_name}}, overdue by {{days_overdue}} days now.' })
    expect(stepWarning({ ...step, offsetDays: 5 }, overdue, 10)).toContain('nothing would be sent')
    expect(stepWarning({ ...step, offsetDays: 15 }, overdue, 10)).toBeNull()
  })

  it('asks when the subscription falls due if it is not set', () => {
    const overdue = tpl({ audience: 'unpaid', body: 'Hello {{member_name}}, overdue by {{days_overdue}} days now.' })
    expect(stepWarning({ ...step, offsetDays: 15 }, overdue, null)).toContain('falls due')
  })

  it('says nothing about an ordinary step', () => {
    expect(stepWarning(step, tpl({ audience: 'unpaid' }), 10)).toBeNull()
  })
})

describe('reading back a message stored the old way', () => {
  it('turns numbers back into names using their labels', () => {
    const body = 'Hello {{1}}, your subscription for {{2}} of Rs {{3}} is due on {{4}}.'
    const labels = ['member name', 'month', 'amount outstanding', 'due date']
    expect(fromNumbered(body, labels))
      .toBe('Hello {{member_name}}, your subscription for {{month}} of Rs {{amount_due}} is due on {{due_date}}.')
  })

  it('knows the words the old templates used', () => {
    expect(fromNumbered('Rs {{1}} to you.', ['amount payable to you']))
      .toBe('Rs {{net_payout}} to you.')
  })

  // Better a number left on screen than a sentence quietly changed.
  it('leaves a number alone when nothing says what it meant', () => {
    expect(fromNumbered('Hello {{1}}, {{2}} here.', ['member name']))
      .toBe('Hello {{member_name}}, {{2}} here.')
  })

  it('leaves a message already written with names untouched', () => {
    const named = 'Hello {{member_name}}, thank you.'
    expect(fromNumbered(named, [])).toBe(named)
  })
})

describe('matching an old schedule to the library', () => {
  const library = [
    tpl({ id: 'n', name: 'chit_auction_notice', audience: 'all' }),
    tpl({ id: 'd', name: 'chit_dues', audience: 'all' }),
    tpl({ id: 'w', name: 'chit_winner', audience: 'winner' }),
    tpl({ id: 'r', name: 'chit_payment_due', audience: 'unpaid' }),
  ]
  type Bare = { kind: string; audience: Audience; templateId?: string | null }
  const steps: Bare[] = [
    { kind: 'notice', audience: 'all' },
    { kind: 'dues', audience: 'all' },
    { kind: 'winner', audience: 'winner' },
    { kind: 'reminder', audience: 'unpaid' },
  ]

  it('points each step at the message written for its job', () => {
    expect(matchStepsToLibrary(steps, library).map(s => s.templateId))
      .toEqual(['n', 'd', 'w', 'r'])
  })

  it('never overwrites a choice already made', () => {
    const chosen: Bare[] = [{ kind: 'reminder', audience: 'unpaid', templateId: 'w' }]
    expect(matchStepsToLibrary(chosen, library)[0].templateId).toBe('w')
  })

  it('leaves a step blank when there is nothing to point it at', () => {
    expect(matchStepsToLibrary(steps, [])[0].templateId).toBeUndefined()
  })

  it('ignores archived and unsaved messages', () => {
    const only = [tpl({ id: '', name: 'chit_dues' }), tpl({ id: 'x', name: 'chit_dues', archived: true })]
    expect(matchStepsToLibrary([steps[1]], only)[0].templateId).toBeUndefined()
  })

  it('falls back to the audience when no name matches', () => {
    const odd = [tpl({ id: 'z', name: 'chit_my_own_words', audience: 'unpaid' })]
    expect(matchStepsToLibrary([steps[3]], odd)[0].templateId).toBe('z')
  })
})
