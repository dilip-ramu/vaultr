// What the person sees when an email will not send.
//
// The real failure that prompted this: a 401 whose body was Brevo prose,
// truncated at 200 characters, so the screen read "...add the new IP address in
// this link: h". Twice, months apart, with a different IP each time — which is
// the whole point. The address changes on every cold start, so the advice
// "approve this IP" is advice that guarantees a third occurrence.

import { describe, it, expect } from 'vitest'
import { explainEmailFailure } from '@/lib/payroll/emailError'

const REAL_BODY = '{"message":"We have detected you are using an unrecognised IP address '
  + '54.196.253.137. If you performed this action make sure to add the new IP address in this link: h'

describe('the IP block', () => {
  const r = explainEmailFailure(401, REAL_BODY)

  it('names the address that was blocked', () => {
    expect(r.message).toContain('54.196.253.137')
  })

  it('says why approving it would not help', () => {
    // Without this the obvious next move is to approve the IP, and it happens
    // again on the next cold start.
    expect(r.message).toContain('different address')
    expect(r.message).toContain('will not stop it happening again')
  })

  it('gives the exact path, and the exact button, that does fix it', () => {
    // Brevo has two toggles on that page. Naming the wrong one sends somebody
    // to switch off something that was not the problem.
    expect(r.message).toContain('Settings')
    expect(r.message).toContain('Security')
    expect(r.message).toContain('Authorized IPs')
    expect(r.message).toContain('Deactivate for API keys')
  })

  it('says which of the two toggles matters, and why', () => {
    expect(r.message).toContain('REST API')
    expect(r.message).toContain('SMTP keys can stay')
  })

  it('says plainly that nothing in the app is broken', () => {
    expect(r.message).toContain('Nothing needs changing in Inex')
    expect(r.needsProviderSetting).toBe(true)
  })

  it('does not paste the provider’s half-sentence back at the reader', () => {
    expect(r.message).not.toContain('this link: h')
  })

  it('recognises the American spelling too', () => {
    const us = explainEmailFailure(401, 'unrecognized IP address 10.0.0.1 blah')
    expect(us.message).toContain('10.0.0.1')
    expect(us.needsProviderSetting).toBe(true)
  })

  it('still helps when no address could be parsed out', () => {
    const vague = explainEmailFailure(401, 'We have detected you are using an unrecognised IP address')
    expect(vague.message).toContain('Deactivate for API keys')
    expect(vague.message).not.toContain('()')
  })
})

describe('the other ways a send fails', () => {
  it('points a plain 401 at the key and the sender address', () => {
    const r = explainEmailFailure(401, '{"message":"Key not found"}')
    expect(r.message).toContain('BREVO_API_KEY')
    expect(r.message).toContain('verified')
  })

  it('tells you to wait when rate limited, not to go changing settings', () => {
    const r = explainEmailFailure(429, 'too many requests')
    expect(r.message).toContain('Wait a minute')
    expect(r.needsProviderSetting).toBe(false)
  })

  it('says a 500 is their end, so nobody goes hunting here', () => {
    const r = explainEmailFailure(503, 'bad gateway')
    expect(r.message).toContain('their end')
    expect(r.message).toContain('Nothing is wrong here')
  })

  it('keeps something concrete for an error it does not know', () => {
    const r = explainEmailFailure(400, 'attachment too large: 12MB exceeds limit')
    expect(r.message).toContain('400')
    expect(r.message).toContain('attachment too large')
  })

  it('never returns an empty message', () => {
    for (const s of [400, 401, 403, 404, 429, 500, 503]) {
      expect(explainEmailFailure(s, '').message.length).toBeGreaterThan(10)
    }
  })
})
