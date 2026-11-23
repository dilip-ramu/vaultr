import { describe, it, expect } from 'vitest'
import {
  cloudConfig, sendProblem, templatePayload, sendUrl, isRetryable, sendTemplate,
  type TemplateSend,
} from '@/lib/whatsapp/cloud'

const send = (o: Partial<TemplateSend> = {}): TemplateSend => ({
  to: '919876543210', template: 'chit_dues', language: 'en',
  variables: ['Ravi', 'November', '5,000', '5th'], ...o,
})

describe('configuration', () => {
  it('is null until a business number is registered', () => {
    // Not an error: there is simply nothing to send with yet.
    expect(cloudConfig({})).toBeNull()
    expect(cloudConfig({ WHATSAPP_TOKEN: 't' })).toBeNull()
    expect(cloudConfig({ WHATSAPP_PHONE_NUMBER_ID: '1' })).toBeNull()
  })

  it('reads the number, the token and the API version', () => {
    expect(cloudConfig({ WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_TOKEN: 't', WHATSAPP_API_VERSION: 'v22.0' }))
      .toEqual({ phoneNumberId: '1', token: 't', version: 'v22.0' })
  })

  it('defaults the version rather than failing', () => {
    expect(cloudConfig({ WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_TOKEN: 't' })?.version).toBe('v21.0')
  })
})

describe('what Meta will reject, caught before sending', () => {
  it('accepts a complete send', () => {
    expect(sendProblem(send())).toBeNull()
  })

  it('refuses a bare 10-digit number, which would reach a stranger', () => {
    // 9876543210 without the 91 is a valid number somewhere else. This is the
    // one mistake that sends a member's dues to the wrong person.
    expect(sendProblem(send({ to: '9876543210' }))).toContain('not a phone number')
    expect(sendProblem(send({ to: '+91 98765 43210' }))).toContain('not a phone number')
    expect(sendProblem(send({ to: '919876543210' }))).toBeNull()
  })

  it('refuses an empty variable, which Meta rejects outright', () => {
    expect(sendProblem(send({ variables: ['Ravi', '', '5,000'] }))).toContain('Variable 2 is empty')
    expect(sendProblem(send({ variables: ['Ravi', '   '] }))).toContain('Variable 2 is empty')
  })

  it('refuses a variable with a line break in it', () => {
    // This is why the chit messages had to be restructured: their emoji-and-
    // newline layout cannot go inside a template variable.
    expect(sendProblem(send({ variables: ['Ravi\nKumar'] }))).toContain('line break')
    expect(sendProblem(send({ variables: ['Ravi\tKumar'] }))).toContain('line break')
  })

  it('refuses a variable longer than Meta allows', () => {
    expect(sendProblem(send({ variables: ['x'.repeat(1025)] }))).toContain('too long')
  })

  it('refuses a missing template name or language', () => {
    expect(sendProblem(send({ template: ' ' }))).toContain('No template name')
    expect(sendProblem(send({ language: '' }))).toContain('No template language')
  })
})

describe('the payload', () => {
  it('is exactly what Meta expects for a template with variables', () => {
    expect(templatePayload(send({ variables: ['Ravi', 'November'] }))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'chit_dues',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [{ type: 'text', text: 'Ravi' }, { type: 'text', text: 'November' }],
        }],
      },
    })
  })

  it('sends no components at all for a template with no variables', () => {
    const p = templatePayload(send({ variables: [] })) as { template: { components: unknown[] } }
    expect(p.template.components).toEqual([])
  })

  it('addresses the right number and version', () => {
    expect(sendUrl({ phoneNumberId: '555', token: 't', version: 'v21.0' }))
      .toBe('https://graph.facebook.com/v21.0/555/messages')
  })
})

describe('which failures are worth retrying', () => {
  it('retries a rate limit and a server fault', () => {
    expect(isRetryable(429)).toBe(true)
    expect(isRetryable(500)).toBe(true)
    expect(isRetryable(503)).toBe(true)
  })

  it('does not retry a rejection', () => {
    // A bad number or an unapproved template fails the same way forever, and
    // retrying it burns the member's patience and Meta's quality rating.
    expect(isRetryable(400)).toBe(false)
    expect(isRetryable(401)).toBe(false)
    expect(isRetryable(403)).toBe(false)
  })
})

describe('sending', () => {
  it('says so plainly when there is no number yet, without calling anything', async () => {
    const r = await sendTemplate(send(), null)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('not configured')
      expect(r.retryable).toBe(false)
    }
  })

  it('refuses a bad send before it reaches the network', async () => {
    const r = await sendTemplate(send({ to: 'nope' }), { phoneNumberId: '1', token: 't', version: 'v21.0' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryable).toBe(false)
  })
})
