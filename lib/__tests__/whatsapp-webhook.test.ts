import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifyChallenge, signatureOk, parseEvents, betterStatus,
  matchMemberByPhone, looksLikePaid, looksLikeStop,
} from '@/lib/whatsapp/webhook'

const payload = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1', changes: [{ field: 'messages', value }] }],
})

describe('the subscription handshake', () => {
  it('echoes the challenge when the token matches', () => {
    expect(verifyChallenge({ mode: 'subscribe', token: 'abc', challenge: '42' }, 'abc')).toBe('42')
  })

  // The url is guessable, so a wrong or missing token must not be waved
  // through — otherwise anybody could subscribe their own listener.
  it('refuses a wrong token, a missing token and a wrong mode', () => {
    expect(verifyChallenge({ mode: 'subscribe', token: 'nope', challenge: '42' }, 'abc')).toBeNull()
    expect(verifyChallenge({ mode: 'subscribe', token: null, challenge: '42' }, 'abc')).toBeNull()
    expect(verifyChallenge({ mode: 'unsubscribe', token: 'abc', challenge: '42' }, 'abc')).toBeNull()
  })

  it('refuses everything when no token is configured', () => {
    expect(verifyChallenge({ mode: 'subscribe', token: 'abc', challenge: '42' }, null)).toBeNull()
  })
})

describe('proving a request came from Meta', () => {
  const secret = 'app-secret'
  const raw = '{"hello":"world"}'
  const good = `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`

  it('accepts a correctly signed body', () => {
    expect(signatureOk(raw, good, secret)).toBe(true)
  })

  it('accepts the hex without the prefix', () => {
    expect(signatureOk(raw, good.slice(7), secret)).toBe(true)
  })

  // A fake 'read' or a fake reply would be worse than no webhook at all.
  it('refuses a tampered body, a wrong secret and a missing header', () => {
    expect(signatureOk('{"hello":"there"}', good, secret)).toBe(false)
    expect(signatureOk(raw, good, 'other-secret')).toBe(false)
    expect(signatureOk(raw, null, secret)).toBe(false)
    expect(signatureOk(raw, good, null)).toBe(false)
  })

  it('refuses nonsense in the header without throwing', () => {
    expect(signatureOk(raw, 'sha256=zzzz', secret)).toBe(false)
    expect(signatureOk(raw, 'sha256=', secret)).toBe(false)
  })
})

describe('reading a payload', () => {
  it('picks up a delivery report', () => {
    const { statuses } = parseEvents(payload({
      statuses: [{ id: 'wamid.1', status: 'delivered', recipient_id: '919876543210', timestamp: '1764000000' }],
    }))
    expect(statuses).toHaveLength(1)
    expect(statuses[0].messageId).toBe('wamid.1')
    expect(statuses[0].status).toBe('delivered')
    expect(statuses[0].to).toBe('919876543210')
    expect(statuses[0].at).toContain('2025-11-24')
  })

  it('keeps what Meta says about a failure', () => {
    const { statuses } = parseEvents(payload({
      statuses: [{
        id: 'wamid.2', status: 'failed', recipient_id: '919876543210',
        errors: [{ code: 131026, title: 'Message undeliverable' }],
      }],
    }))
    expect(statuses[0].error).toBe('Message undeliverable')
  })

  it('picks up a typed reply', () => {
    const { messages } = parseEvents(payload({
      messages: [{ id: 'wamid.in', from: '919876543210', type: 'text', text: { body: 'paid today' }, timestamp: '1764000000' }],
    }))
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe('paid today')
    expect(messages[0].from).toBe('919876543210')
  })

  it('reads a button and a list answer as its label', () => {
    const { messages } = parseEvents(payload({
      messages: [
        { id: 'a', from: '91', type: 'button', button: { text: 'Already paid' } },
        { id: 'b', from: '91', type: 'interactive', interactive: { button_reply: { title: 'Will pay Friday' } } },
      ],
    }))
    expect(messages.map(m => m.body)).toEqual(['Already paid', 'Will pay Friday'])
  })

  // There is nothing to read in a voice note, but the fact that they answered
  // at all is worth keeping.
  it('notes an answer with no text in it', () => {
    const { messages } = parseEvents(payload({
      messages: [{ id: 'c', from: '91', type: 'audio', audio: { id: 'x' } }],
    }))
    expect(messages[0].body).toBe('[audio]')
  })

  it('takes several events in one request', () => {
    const r = parseEvents({
      entry: [
        { changes: [{ value: { statuses: [{ id: 's1', status: 'read', recipient_id: '91' }] } }] },
        { changes: [{ value: { messages: [{ id: 'm1', from: '91', type: 'text', text: { body: 'ok' } }] } }] },
      ],
    })
    expect(r.statuses).toHaveLength(1)
    expect(r.messages).toHaveLength(1)
  })

  // A webhook that throws gets retried and then switched off by Meta, so
  // anything unrecognised is ignored instead.
  it('ignores rubbish rather than throwing', () => {
    for (const junk of [null, undefined, {}, { entry: 'no' }, { entry: [{}] }, { entry: [{ changes: [{}] }] }]) {
      expect(parseEvents(junk)).toEqual({ statuses: [], messages: [] })
    }
    expect(parseEvents(payload({ statuses: [{ id: 'x', status: 'invented' }] })).statuses).toEqual([])
    expect(parseEvents(payload({ messages: [{ from: '91', type: 'text' }] })).messages).toEqual([])
  })
})

describe('a status only ever moves forwards', () => {
  it('advances through the three steps', () => {
    expect(betterStatus('sent', 'delivered')).toBe('delivered')
    expect(betterStatus('delivered', 'read')).toBe('read')
  })

  // 'delivered' can land after 'read' on a slow connection.
  it('does not go back', () => {
    expect(betterStatus('read', 'delivered')).toBe('read')
    expect(betterStatus('read', 'sent')).toBe('read')
  })

  it('takes a failure after a send, but not after a read', () => {
    expect(betterStatus('sent', 'failed')).toBe('failed')
    expect(betterStatus('read', 'failed')).toBe('read')
  })

  it('upgrades a row that was only waiting', () => {
    expect(betterStatus('pending', 'delivered')).toBe('delivered')
    expect(betterStatus('held', 'sent')).toBe('sent')
  })
})

describe('whose reply it is', () => {
  const members = [
    { id: 'm1', phone: '9876543210' },
    { id: 'm2', phone: '98765 43211' },
    { id: 'm3', phone: null },
  ]

  it('matches on the last ten digits, country code or not', () => {
    expect(matchMemberByPhone('919876543210', members)?.id).toBe('m1')
    expect(matchMemberByPhone('+91 98765 43211', members)?.id).toBe('m2')
  })

  it('has no opinion when nobody matches', () => {
    expect(matchMemberByPhone('919999999999', members)).toBeNull()
    expect(matchMemberByPhone('', members)).toBeNull()
    expect(matchMemberByPhone('12345', members)).toBeNull()
  })

  // Being told 'somebody on this number said paid' is useful. Being told the
  // wrong name is not.
  it('refuses to guess when two members share a number', () => {
    const shared = [{ id: 'a', phone: '9876543210' }, { id: 'b', phone: '919876543210' }]
    expect(matchMemberByPhone('919876543210', shared)).toBeNull()
  })
})

describe('what a reply seems to say', () => {
  it('spots a claim to have paid', () => {
    for (const s of ['paid', 'Paid sir', 'payment done', 'done', 'transferred today', 'credited']) {
      expect({ s, paid: looksLikePaid(s) }).toEqual({ s, paid: true })
    }
  })

  // 'not paid yet' contains the word 'paid'. Without the negative check the
  // flag would mark exactly the people who said they had NOT paid.
  it('does not read a question, a promise or a denial as a payment', () => {
    for (const s of ['how much', 'please extend', 'I will pay next week', 'not paid yet',
      'no sir', 'will pay tomorrow', "haven't paid", 'ok']) {
      expect({ s, paid: looksLikePaid(s) }).toEqual({ s, paid: false })
    }
  })

  it('spots somebody asking to be left alone', () => {
    expect(looksLikeStop('STOP')).toBe(true)
    expect(looksLikeStop(' stop ')).toBe(true)
    expect(looksLikeStop('unsubscribe')).toBe(true)
    expect(looksLikeStop('stop sending me this and tell me the amount')).toBe(false)
  })
})

describe('a picture or a file', () => {
  // WhatsApp sends an id, never the file, so the id is what must survive.
  it('keeps the id, the kind and the type of an image', () => {
    const { messages } = parseEvents(payload({
      messages: [{
        id: 'wamid.img', from: '919876543210', type: 'image',
        image: { id: '1234567890', mime_type: 'image/jpeg', sha256: 'x' },
      }],
    }))
    expect(messages[0].mediaId).toBe('1234567890')
    expect(messages[0].mediaKind).toBe('image')
    expect(messages[0].mediaMime).toBe('image/jpeg')
  })

  it('uses the caption as the words, when there is one', () => {
    const { messages } = parseEvents(payload({
      messages: [{
        id: 'a', from: '91', type: 'image',
        image: { id: '1', mime_type: 'image/jpeg', caption: 'paid today' },
      }],
    }))
    expect(messages[0].body).toBe('paid today')
  })

  // A payment screenshot usually arrives with nothing written on it.
  it('says what it is when there is no caption', () => {
    const { messages } = parseEvents(payload({
      messages: [{ id: 'a', from: '91', type: 'image', image: { id: '1' } }],
    }))
    expect(messages[0].body).toBe('[image]')
    expect(messages[0].mediaId).toBe('1')
  })

  it('handles a document the same way', () => {
    const { messages } = parseEvents(payload({
      messages: [{
        id: 'a', from: '91', type: 'document',
        document: { id: '9', mime_type: 'application/pdf', caption: 'receipt' },
      }],
    }))
    expect(messages[0]).toMatchObject({ mediaKind: 'document', mediaId: '9', body: 'receipt' })
  })

  it('leaves a plain text message with no media on it', () => {
    const { messages } = parseEvents(payload({
      messages: [{ id: 'a', from: '91', type: 'text', text: { body: 'hello' } }],
    }))
    expect(messages[0].mediaId).toBeUndefined()
  })

  // An id-less media message would give a link to nothing.
  it('ignores media with no id', () => {
    const { messages } = parseEvents(payload({
      messages: [{ id: 'a', from: '91', type: 'image', image: { mime_type: 'image/jpeg' } }],
    }))
    expect(messages[0].mediaId).toBeUndefined()
    expect(messages[0].body).toBe('[image]')
  })
})
