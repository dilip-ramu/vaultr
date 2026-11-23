import { describe, it, expect } from 'vitest'
import {
  buildThreads, preview, searchThreads, dayLabel, statusLabel,
  type InboxRow, type OutRow,
} from '@/lib/chit/conversations'

const inbox = (o: Partial<InboxRow> = {}): InboxRow => ({
  id: 'i1', member_id: 'm1', body: 'paid', received_at: '2026-11-24T10:00:00Z',
  member: { name: 'Ravi', member_code: 'M-014' }, ...o,
})
const out = (o: Partial<OutRow> = {}): OutRow => ({
  id: 'o1', member_id: 'm1', body: 'Hello Ravi, Rs 23,750 is due.',
  status: 'delivered', sent_at: '2026-11-24T09:00:00Z',
  member: { name: 'Ravi' }, ...o,
})

describe('both sides of one conversation', () => {
  it('merges them in time order', () => {
    const [t] = buildThreads([inbox()], [out()])
    expect(t.messages.map(m => m.dir)).toEqual(['out', 'in'])
    expect(t.messages[0].text).toContain('23,750')
    expect(t.lastAt).toBe('2026-11-24T10:00:00Z')
  })

  it('keeps one thread per member', () => {
    const threads = buildThreads(
      [inbox({ id: 'a' }), inbox({ id: 'b', member_id: 'm2', member: { name: 'Selvam' } })],
      [out()])
    expect(threads).toHaveLength(2)
    expect(threads.map(t => t.name).sort()).toEqual(['Ravi', 'Selvam'])
  })

  it('counts what has not been read, and puts those first', () => {
    const threads = buildThreads([
      inbox({ id: 'a', member_id: 'm2', member: { name: 'Old' }, handled: true, received_at: '2026-11-24T12:00:00Z' }),
      inbox({ id: 'b', handled: false, received_at: '2026-11-24T08:00:00Z' }),
    ], [])
    expect(threads[0].name).toBe('Ravi')
    expect(threads[0].unread).toBe(1)
    expect(threads[1].unread).toBe(0)
  })

  // The 24-hour window to reply runs from the last thing THEY sent, never
  // from something the app sent afterwards.
  it('tracks the last message from the member', () => {
    const [t] = buildThreads(
      [inbox({ received_at: '2026-11-24T10:00:00Z' })],
      [out({ sent_at: '2026-11-24T23:00:00Z' })])
    expect(t.lastInboundAt).toBe('2026-11-24T10:00:00Z')
  })

  // A row with no member belongs to nobody and would make a nameless thread.
  it('drops anything with no member', () => {
    expect(buildThreads([inbox({ member_id: null })], [out({ member_id: null })])).toEqual([])
  })

  // Rows written before the words were stored.
  it('says what an old message was rather than quoting words nobody kept', () => {
    const [t] = buildThreads([], [out({ body: null, kind: 'reminder' })])
    expect(t.messages[0].text).toBe('(reminder)')
  })

  it('carries a picture through', () => {
    const [t] = buildThreads([inbox({ body: '[image]', media_id: '9', media_kind: 'image' })], [])
    expect(t.messages[0].mediaId).toBe('9')
    expect(t.messages[0].mediaKind).toBe('image')
  })

  it('takes the chits from the map it is given', () => {
    const [t] = buildThreads([inbox()], [], { m1: ['UC G3', 'Uma 5 Lakh A'] })
    expect(t.groups).toEqual(['UC G3', 'Uma 5 Lakh A'])
  })
})

describe('the list column', () => {
  it('shows the last thing said, and who said it', () => {
    const [t] = buildThreads([inbox({ body: 'paid today' })], [out()])
    expect(preview(t)).toBe('paid today')

    const [t2] = buildThreads([], [out({ body: 'Noted, thank you' })])
    expect(preview(t2)).toBe('You: Noted, thank you')
  })

  it('shortens a long one', () => {
    const [t] = buildThreads([inbox({ body: 'x'.repeat(200) })], [])
    expect(preview(t, 20)).toHaveLength(20)
    expect(preview(t, 20).endsWith('…')).toBe(true)
  })

  it('describes a picture with no words', () => {
    const [t] = buildThreads([inbox({ body: '', media_kind: 'image', media_id: '1' })], [])
    expect(preview(t)).toBe('[image]')
  })
})

describe('finding a conversation', () => {
  const threads = buildThreads([
    inbox(),
    inbox({ id: 'b', member_id: 'm2', from_phone: '919000000001', body: 'will pay friday', member: { name: 'Selvam', member_code: 'M-003' } }),
  ], [], { m1: ['UC G3'], m2: ['Uma 5 Lakh A'] })

  it('matches a name, a member number, a phone, a chit or the words', () => {
    expect(searchThreads(threads, 'selv').map(t => t.name)).toEqual(['Selvam'])
    expect(searchThreads(threads, 'M-014').map(t => t.name)).toEqual(['Ravi'])
    expect(searchThreads(threads, '9000000001').map(t => t.name)).toEqual(['Selvam'])
    expect(searchThreads(threads, 'uc g3').map(t => t.name)).toEqual(['Ravi'])
    expect(searchThreads(threads, 'friday').map(t => t.name)).toEqual(['Selvam'])
  })

  it('returns everything for an empty search', () => {
    expect(searchThreads(threads, '  ')).toHaveLength(2)
  })
})

describe('the small print on a message', () => {
  const now = new Date('2026-11-24T12:00:00Z')

  it('separates the days the way a person reads them', () => {
    expect(dayLabel('2026-11-24T08:00:00Z', now)).toBe('Today')
    expect(dayLabel('2026-11-23T08:00:00Z', now)).toBe('Yesterday')
    expect(dayLabel('2026-11-01T08:00:00Z', now)).toContain('Nov')
    expect(dayLabel('rubbish', now)).toBe('')
  })

  it('says the delivery state in words, not ticks', () => {
    expect(statusLabel('read')).toBe('read')
    expect(statusLabel('held')).toBe('waiting for a detail')
    expect(statusLabel(null)).toBe('')
  })
})
