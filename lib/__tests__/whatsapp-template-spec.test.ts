import { describe, it, expect } from 'vitest'
import {
  problems, canSubmit, preview, variableNumbers, createPayload, createUrl,
  statusWords, editsLeft, type TemplateDraft,
} from '@/lib/whatsapp/templateSpec'

const draft = (o: Partial<TemplateDraft> = {}): TemplateDraft => ({
  name: 'chit_payment_overdue',
  language: 'en',
  category: 'UTILITY',
  body: 'Hi {{1}}, your {{2}} chit subscription of Rs {{3}} is now overdue by {{4}} days. Please pay at the earliest.',
  variables: [
    { label: 'member name', sample: 'Ravi' },
    { label: 'month', sample: 'November' },
    { label: 'amount', sample: '23,750' },
    { label: 'days overdue', sample: '12' },
  ],
  ...o,
})

describe('a good draft', () => {
  it('passes', () => {
    expect(problems(draft())).toEqual([])
    expect(canSubmit(draft())).toBe(true)
  })

  it('previews with the example values in place', () => {
    expect(preview(draft())).toContain('Hi Ravi, your November chit subscription of Rs 23,750 is now overdue by 12 days')
  })

  it('reads the variable numbers in the order they appear', () => {
    expect(variableNumbers('a {{1}} b {{2}}')).toEqual([1, 2])
    expect(variableNumbers('no variables')).toEqual([])
  })
})

describe('the name', () => {
  it('must be lowercase, digits and underscores', () => {
    expect(problems(draft({ name: 'Chit Payment' })).some(p => p.field === 'name')).toBe(true)
    expect(problems(draft({ name: 'chit-payment' })).some(p => p.field === 'name')).toBe(true)
    expect(problems(draft({ name: 'chit_payment_2' }))).toEqual([])
  })

  it('cannot be empty', () => {
    expect(problems(draft({ name: '  ' })).some(p => p.message.includes('Give it a name'))).toBe(true)
  })
})

describe('what Meta calls a dangling parameter', () => {
  it('refuses a body that starts with a variable', () => {
    const p = problems(draft({
      body: '{{1}}, your subscription is overdue by {{2}} days now.',
      variables: [{ label: 'name', sample: 'Ravi' }, { label: 'days', sample: '5' }],
    }))
    expect(p.some(x => x.message.includes('cannot START'))).toBe(true)
  })

  it('refuses a body that ends with a variable', () => {
    const p = problems(draft({
      body: 'Hi there, the amount still outstanding on your chit is Rs {{1}}',
      variables: [{ label: 'amount', sample: '500' }],
    }))
    expect(p.some(x => x.message.includes('cannot END'))).toBe(true)
  })
})

describe('variable numbering', () => {
  it('refuses them out of order, which Meta rejects', () => {
    const p = problems(draft({
      body: 'Hi {{1}}, your {{2}} dues of {{5}} are overdue by {{4}} days today.',
      variables: [1, 2, 3, 4].map(n => ({ label: `v${n}`, sample: String(n) })),
    }))
    expect(p.some(x => x.message.includes('must run 1, 2, 3'))).toBe(true)
  })

  it('refuses a gap', () => {
    const p = problems(draft({
      body: 'Hi {{1}}, you owe {{3}} rupees on your chit this month please pay.',
      variables: [{ label: 'a', sample: 'Ravi' }, { label: 'b', sample: '10' }],
    }))
    expect(p.some(x => x.message.includes('must run 1, 2, 3'))).toBe(true)
  })

  it('notices a mismatch between the body and the described variables', () => {
    const p = problems(draft({ variables: draft().variables.slice(0, 2) }))
    expect(p.some(x => x.field === 'variables' && x.message.includes('but 2'))).toBe(true)
  })

  it('notices an unmatched brace', () => {
    const p = problems(draft({ body: 'Hi {{1}, your dues are overdue. Please pay soon today.' }))
    expect(p.some(x => x.message.includes('missing its pair'))).toBe(true)
  })
})

describe('too many variables for the message', () => {
  it('warns on a body that is mostly placeholders', () => {
    const p = problems(draft({
      body: 'Hi {{1}} {{2}} {{3}} {{4}} now.',
      variables: [1, 2, 3, 4].map(n => ({ label: `v${n}`, sample: String(n) })),
    }))
    expect(p.some(x => x.message.includes('Too many variables'))).toBe(true)
  })

  it('accepts a properly worded message with the same count', () => {
    expect(problems(draft())).toEqual([])
  })
})

describe('the example values', () => {
  it('are required, because Meta asks for them', () => {
    const vars = draft().variables.map((v, i) => i === 1 ? { ...v, sample: '' } : v)
    expect(problems(draft({ variables: vars })).some(x => x.message.includes('needs an example'))).toBe(true)
  })

  it('cannot contain the characters Meta rejects', () => {
    const vars = draft().variables.map((v, i) => i === 2 ? { ...v, sample: '₹500 #1' } : v)
    expect(problems(draft({ variables: vars })).some(x => x.message.includes('# $ and %'))).toBe(true)
  })

  it('cannot contain a line break', () => {
    const vars = draft().variables.map((v, i) => i === 0 ? { ...v, sample: 'Ravi\nKumar' } : v)
    expect(problems(draft({ variables: vars })).some(x => x.message.includes('no line breaks'))).toBe(true)
  })
})

describe('the footer', () => {
  it('cannot hold variables', () => {
    expect(problems(draft({ footer: 'From {{1}}' })).some(x => x.field === 'footer')).toBe(true)
  })

  it('cannot be long', () => {
    expect(problems(draft({ footer: 'x'.repeat(61) })).some(x => x.message.includes('60 characters'))).toBe(true)
  })

  it('is fine as plain text', () => {
    expect(problems(draft({ footer: 'Sri Uma Chits' }))).toEqual([])
  })
})

describe('the create request', () => {
  it('is shaped the way Meta expects, with the example values', () => {
    expect(createPayload(draft({ footer: 'Sri Uma Chits' }))).toEqual({
      name: 'chit_payment_overdue',
      language: 'en',
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: draft().body,
          example: { body_text: [['Ravi', 'November', '23,750', '12']] },
        },
        { type: 'FOOTER', text: 'Sri Uma Chits' },
      ],
    })
  })

  it('sends no example block for a template with no variables', () => {
    const p = createPayload(draft({ body: 'Your chit statement is attached.', variables: [] })) as
      { components: Record<string, unknown>[] }
    expect(p.components[0].example).toBeUndefined()
  })

  it('addresses the business account', () => {
    expect(createUrl('123', 'v21.0')).toBe('https://graph.facebook.com/v21.0/123/message_templates')
  })
})

describe('what a status means', () => {
  it('says review takes up to a day', () => {
    expect(statusWords('PENDING')).toContain('up to 24 hours')
  })

  it('warns when Meta gave it a dearer category than was asked for', () => {
    // The business is responsible for checking this, and marketing costs
    // roughly 7.5x utility.
    expect(statusWords('APPROVED', 'MARKETING', 'UTILITY')).toContain('costs more per message')
  })

  it('says plainly when it is approved as asked', () => {
    expect(statusWords('APPROVED', 'UTILITY', 'UTILITY')).toBe('Approved and ready to send.')
  })

  it('explains a pause', () => {
    expect(statusWords('PAUSED')).toContain('marked it as spam')
  })
})

describe('edits left on an approved template', () => {
  const now = new Date('2026-11-20T12:00:00Z')

  it('allows one a day and ten a month', () => {
    expect(editsLeft([], now)).toEqual({ in24h: 1, in30d: 10 })
  })

  it('counts today’s edit against the daily limit', () => {
    expect(editsLeft(['2026-11-20T09:00:00Z'], now)).toEqual({ in24h: 0, in30d: 9 })
  })

  it('forgets an edit older than the window', () => {
    expect(editsLeft(['2026-10-01T09:00:00Z'], now)).toEqual({ in24h: 1, in30d: 10 })
  })

  it('never goes below zero', () => {
    const many = Array.from({ length: 15 }, (_, i) => `2026-11-${String(i + 5).padStart(2, '0')}T09:00:00Z`)
    expect(editsLeft(many, now).in30d).toBe(0)
  })
})
