import { describe, it, expect } from 'vitest'
import {
  TEMPLATES, variablesFor, linkText, safeVar, money, submissionGuide,
  type Facts,
} from '@/lib/chit/reminderTemplates'
import { sendProblem } from '@/lib/whatsapp/cloud'

const facts = (o: Partial<Facts> = {}): Facts => ({
  memberName: 'Ravi Kumar', month: 'November 2026',
  chitValue: 500000, installment: 25000,
  auctionDate: '2026-11-05', auctionTime: '6:30 PM',
  amountDue: 23750, dueDate: '2026-11-10',
  bidAmount: 60000, netPayout: 425000, ...o,
})

describe('four templates for six messages', () => {
  it('shares one template across all three payment reminders', () => {
    // Meta approves templates, not schedules: the three reminders differ only
    // in when they go, so there is one submission, not three.
    expect(TEMPLATES.reminder.name).toBe('chit_payment_reminder')
    expect(new Set(Object.values(TEMPLATES).map(t => t.name)).size).toBe(4)
  })

  it('declares what each placeholder means, in order', () => {
    expect(TEMPLATES.dues.variables).toEqual(['member name', 'month', 'amount due', 'due date'])
  })

  it('prints a line that can be pasted into the Meta submission', () => {
    expect(submissionGuide('dues'))
      .toBe('chit_dues (en) — {{1}} member name, {{2}} month, {{3}} amount due, {{4}} due date')
  })
})

describe('making a value safe for a variable', () => {
  it('flattens line breaks, which Meta rejects', () => {
    expect(safeVar('Ravi\nKumar')).toBe('Ravi Kumar')
    expect(safeVar('a\t\tb')).toBe('a b')
  })

  it('turns empty into a dash rather than letting the send be rejected', () => {
    expect(safeVar('')).toBe('-')
    expect(safeVar(null)).toBe('-')
    expect(safeVar('   ')).toBe('-')
  })

  it('writes rupees the way they read in a sentence', () => {
    expect(money(23750)).toBe('23,750')
    expect(money(500000)).toBe('5,00,000')
    expect(money(NaN)).toBe('0')
  })
})

describe('the variables for each message', () => {
  it('fills the notice with the auction details', () => {
    expect(variablesFor('notice', facts()))
      .toEqual(['Ravi Kumar', 'November 2026', '5,00,000', '25,000', '2026-11-05', '6:30 PM'])
  })

  it('says the time is as announced when none is set', () => {
    expect(variablesFor('notice', facts({ auctionTime: null }))?.[5]).toBe('as announced')
  })

  it('fills the dues with this member’s own figure', () => {
    expect(variablesFor('dues', facts())).toEqual(['Ravi Kumar', 'November 2026', '23,750', '2026-11-10'])
  })

  it('fills the winner message with the bid and what they are paid', () => {
    expect(variablesFor('winner', facts()))
      .toEqual(['Ravi Kumar', 'November 2026', '60,000', '4,25,000', '2026-11-05'])
  })

  it('uses the same shape for a reminder as for the dues', () => {
    expect(variablesFor('reminder', facts())).toEqual(variablesFor('dues', facts()))
  })

  it('refuses to send rather than send a dash where a figure belongs', () => {
    // A winner message with no payout, or dues with no amount, is not worth
    // sending at all.
    expect(variablesFor('winner', facts({ netPayout: undefined }))).toBeNull()
    expect(variablesFor('dues', facts({ amountDue: undefined }))).toBeNull()
    expect(variablesFor('reminder', facts({ dueDate: undefined }))).toBeNull()
    expect(variablesFor('notice', facts({ auctionDate: undefined }))).toBeNull()
  })

  it('sends a zero amount, because owing nothing is a figure', () => {
    expect(variablesFor('dues', facts({ amountDue: 0 }))?.[2]).toBe('0')
  })

  it('produces variables Meta will accept', () => {
    for (const kind of ['notice', 'dues', 'winner', 'reminder'] as const) {
      const vars = variablesFor(kind, facts())!
      expect(sendProblem({ to: '919876543210', template: TEMPLATES[kind].name, language: 'en', variables: vars })).toBeNull()
    }
  })

  it('still produces an acceptable send from a messy member name', () => {
    const vars = variablesFor('dues', facts({ memberName: '  Ravi\nKumar  ' }))!
    expect(vars[0]).toBe('Ravi Kumar')
    expect(sendProblem({ to: '919876543210', template: 'chit_dues', language: 'en', variables: vars })).toBeNull()
  })
})

describe('the text for a message sent by hand', () => {
  it('uses the first name and states the figure', () => {
    expect(linkText('dues', facts())).toContain('Hi Ravi,')
    expect(linkText('dues', facts())).toContain('₹23,750')
  })

  it('congratulates the winner and says what they are paid', () => {
    const t = linkText('winner', facts())
    expect(t).toContain('congratulations')
    expect(t).toContain('₹4,25,000')
  })

  it('lets somebody off who has just paid', () => {
    // A reminder crossing a payment is the commonest way to annoy a member
    // who did nothing wrong.
    expect(linkText('reminder', facts())).toContain('ignore this if you have just paid')
  })

  it('copes with a member with one name', () => {
    expect(linkText('dues', facts({ memberName: 'Ravi' }))).toContain('Hi Ravi,')
  })
})
