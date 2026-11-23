import { describe, it, expect } from 'vitest'
import {
  TEMPLATES, variablesFor, variablesForToday, linkText, safeVar, money, submissionGuide,
  daysOverdue, templateFor, OVERDUE_TEMPLATE, DEFAULT_DRAFTS,
  type Facts,
} from '@/lib/chit/reminderTemplates'
import { problems, variableNumbers } from '@/lib/whatsapp/templateSpec'
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
    // in WHEN they go, so they share a submission. The split into due and
    // overdue is about WORDING, not timing — see the overdue tests below.
    expect(TEMPLATES.reminder.name).toBe('chit_payment_due')
    expect(new Set(Object.values(TEMPLATES).map(t => t.name)).size).toBe(4)
  })

  it('has a fifth template for the overdue wording', () => {
    expect(OVERDUE_TEMPLATE.name).toBe('chit_payment_overdue')
    expect(OVERDUE_TEMPLATE.variables.at(-1)).toBe('days overdue')
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

describe('the overdue reminder', () => {
  it('counts the days past the due date', () => {
    expect(daysOverdue('2026-11-10', '2026-11-22')).toBe(12)
    expect(daysOverdue('2026-11-10', '2026-11-11')).toBe(1)
  })

  it('is zero before and on the due date', () => {
    // 'Overdue by 0 days' is not a sentence anybody should receive.
    expect(daysOverdue('2026-11-10', '2026-11-10')).toBe(0)
    expect(daysOverdue('2026-11-10', '2026-11-01')).toBe(0)
  })

  it('is zero when there is no due date to count from', () => {
    expect(daysOverdue(undefined, '2026-11-22')).toBe(0)
    expect(daysOverdue('rubbish', '2026-11-22')).toBe(0)
  })

  it('switches to the overdue template only once the date has passed', () => {
    // One template cannot say both 'due on the 10th' and 'overdue by 12
    // days': the wording is fixed at approval.
    expect(templateFor('reminder', facts(), '2026-11-05').name).toBe('chit_payment_due')
    expect(templateFor('reminder', facts(), '2026-11-22').name).toBe('chit_payment_overdue')
  })

  it('never switches the other messages', () => {
    for (const kind of ['notice', 'dues', 'winner'] as const) {
      expect(templateFor(kind, facts(), '2026-12-25').name).toBe(TEMPLATES[kind].name)
    }
  })

  it('sends the day count in place of the due date', () => {
    const vars = variablesForToday('reminder', facts(), '2026-11-22')
    expect(vars).toEqual(['Ravi Kumar', 'November 2026', '23,750', '12'])
  })

  it('sends the due date while it is still due', () => {
    expect(variablesForToday('reminder', facts(), '2026-11-05'))
      .toEqual(['Ravi Kumar', 'November 2026', '23,750', '2026-11-10'])
  })

  it('says it in the hand-sent text too', () => {
    expect(linkText('reminder', facts({ today: '2026-11-22' }))).toContain('overdue by 12 days')
    expect(linkText('reminder', facts({ today: '2026-11-22' }))).toContain('Ignore this if you have just paid')
  })

  it('gets the singular right in the hand-sent text', () => {
    expect(linkText('reminder', facts({ today: '2026-11-11' }))).toContain('overdue by 1 day.')
  })
})

describe('the wording each template starts with', () => {
  it('covers all five, including the overdue one', () => {
    expect(Object.keys(DEFAULT_DRAFTS)).toEqual(['notice', 'dues', 'winner', 'reminder', 'reminder_overdue'])
  })

  it('would all pass Meta’s published rules', () => {
    // The whole point of writing them here: a rejection costs a day and one
    // of Meta's limited edits.
    for (const [kind, d] of Object.entries(DEFAULT_DRAFTS)) {
      expect(problems(d), kind).toEqual([])
    }
  })

  it('asks for utility on every one', () => {
    for (const d of Object.values(DEFAULT_DRAFTS)) expect(d.category).toBe('UTILITY')
  })

  it('names them the same as the code that sends them', () => {
    expect(DEFAULT_DRAFTS.reminder.name).toBe(TEMPLATES.reminder.name)
    expect(DEFAULT_DRAFTS.reminder_overdue.name).toBe(OVERDUE_TEMPLATE.name)
    expect(DEFAULT_DRAFTS.notice.name).toBe(TEMPLATES.notice.name)
    expect(DEFAULT_DRAFTS.dues.name).toBe(TEMPLATES.dues.name)
    expect(DEFAULT_DRAFTS.winner.name).toBe(TEMPLATES.winner.name)
  })

  it('declares as many variables as the body uses', () => {
    for (const [kind, d] of Object.entries(DEFAULT_DRAFTS)) {
      expect(variableNumbers(d.body).length, kind).toBe(d.variables.length)
    }
  })
})

describe('the drafts and the sending code agree', () => {
  // The contract that cannot be allowed to drift: {{3}} in the approved
  // wording must be the third thing variablesFor puts in the array, or every
  // member gets a message with the figures in the wrong places.
  it('describes the variables in the same order the sender builds them', () => {
    const pairs: [keyof typeof TEMPLATES, string][] = [
      ['notice', 'notice'], ['dues', 'dues'], ['winner', 'winner'], ['reminder', 'reminder'],
    ]
    for (const [kind, draftKey] of pairs) {
      expect(DEFAULT_DRAFTS[draftKey].variables.map(v => v.label), kind)
        .toEqual([...TEMPLATES[kind].variables])
    }
    expect(DEFAULT_DRAFTS.reminder_overdue.variables.map(v => v.label))
      .toEqual([...OVERDUE_TEMPLATE.variables])
  })
})
