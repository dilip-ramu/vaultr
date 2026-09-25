// Handing someone their access.
//
// These messages carry a password or a single-use link into WhatsApp. When one
// is wrong the failure is silent — the person simply cannot get in, and says so
// days later — so the wording is asserted rather than eyeballed.

import { describe, it, expect } from 'vitest'
import { adminHandoverMessage, memberInviteMessage, firstName, durationWords } from '@/lib/chit/handover'
import { phoneKey, findMemberByPhone, type LookupMember } from '@/lib/chit/memberLookup'

describe('the message that carries a new login', () => {
  const msg = adminHandoverMessage({
    name: 'Lokesh Subramanian', email: 'lokesh@example.com',
    password: 'Kanchi2026x', role: 'partner', appUrl: 'https://inex-mu.vercel.app',
  })

  it('carries everything needed to sign in, and nothing more', () => {
    expect(msg).toContain('https://inex-mu.vercel.app')
    expect(msg).toContain('lokesh@example.com')
    expect(msg).toContain('Kanchi2026x')
  })

  it('greets them by first name, not by their full name or their email', () => {
    expect(msg.startsWith('Hi Lokesh,')).toBe(true)
  })

  it('tells them to change the password, because somebody else chose it', () => {
    expect(msg).toContain('set your own password')
    expect(msg).toContain('delete this message')
  })

  it('says what the role actually lets them do', () => {
    expect(adminHandoverMessage({ name: 'A', email: 'a@b.c', password: 'p', role: 'partner', appUrl: 'u' }))
      .toContain('run the chit')
    expect(adminHandoverMessage({ name: 'A', email: 'a@b.c', password: 'p', role: 'collector', appUrl: 'u' }))
      .toContain('record payments')
    expect(adminHandoverMessage({ name: 'A', email: 'a@b.c', password: 'p', role: 'viewer', appUrl: 'u' }))
      .toContain('Nothing can be changed')
  })

  it('still reads properly when there is no name on file', () => {
    const m = adminHandoverMessage({ name: null, email: 'a@b.c', password: 'p', role: 'viewer', appUrl: 'u' })
    expect(m.startsWith('Hi there,')).toBe(true)
    expect(m).not.toContain('null')
  })

  it('never leaves a double blank line from a missing piece', () => {
    const m = adminHandoverMessage({ name: 'A', email: 'a@b.c', password: 'p', role: 'unknown-role', appUrl: 'u' })
    expect(m).not.toContain('\n\n\n')
  })
})

describe('the message that carries a portal link', () => {
  const msg = memberInviteMessage({ name: 'Asha Rani', url: 'https://x.test/m/enter?t=abc', expiresInWords: '7 days' })

  it('contains the link and how long it lasts', () => {
    expect(msg).toContain('https://x.test/m/enter?t=abc')
    expect(msg).toContain('7 days')
  })

  it('tells them what to expect, so the PIN prompt is not a surprise', () => {
    expect(msg).toContain('4-digit PIN')
  })

  it('asks them not to forward it', () => {
    expect(msg.toLowerCase()).toContain('not forward')
  })
})

describe('how long things last, in words', () => {
  it('prefers the largest sensible unit', () => {
    expect(durationWords(30)).toBe('30 minutes')
    expect(durationWords(60)).toBe('1 hour')
    expect(durationWords(120)).toBe('2 hours')
    expect(durationWords(1440)).toBe('1 day')
    expect(durationWords(7 * 1440)).toBe('7 days')
  })
})

describe('first names', () => {
  it('takes the first word and copes with nothing at all', () => {
    expect(firstName('  Lokesh   Subramanian ')).toBe('Lokesh')
    expect(firstName('')).toBeNull()
    expect(firstName(null)).toBeNull()
  })
})

/* ── Finding a member by the number they type ────────────────────────────── */

describe('phone numbers', () => {
  it('reduces every way a number can be written to the same ten digits', () => {
    for (const written of ['9876543210', '+91 98765 43210', '098765-43210', '(91) 9876543210', '91 9876 543 210']) {
      expect(phoneKey(written)).toBe('9876543210')
    }
  })

  it('refuses something too short to be a number', () => {
    expect(phoneKey('12345')).toBeNull()
    expect(phoneKey('')).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })
})

describe('matching a member to the number they typed', () => {
  const members: LookupMember[] = [
    { id: 'a', name: 'Asha', phone: '+91 98765 43210', portal_enabled: true, is_active: true },
    { id: 'b', name: 'Bala', phone: '9123456780', portal_enabled: true, is_active: true },
    { id: 'c', name: 'Chitra', phone: '9000000001', portal_enabled: false, is_active: true },
    { id: 'd', name: 'Deepa', phone: '9000000002', portal_enabled: true, is_active: false },
  ]

  it('finds the one member whose number matches, however it was typed', () => {
    const r = findMemberByPhone(members, '098765 43210')
    expect(r.kind).toBe('found')
    expect(r.kind === 'found' && r.member.name).toBe('Asha')
  })

  it('does not find a member whose portal access is off', () => {
    expect(findMemberByPhone(members, '9000000001').kind).toBe('none')
  })

  it('does not find an inactive member', () => {
    expect(findMemberByPhone(members, '9000000002').kind).toBe('none')
  })

  it('refuses to guess when two members share a number', () => {
    const shared: LookupMember[] = [
      { id: 'x', name: 'Husband', phone: '9111111111', portal_enabled: true, is_active: true },
      { id: 'y', name: 'Wife', phone: '+919111111111', portal_enabled: true, is_active: true },
    ]
    const r = findMemberByPhone(shared, '9111111111')
    expect(r.kind).toBe('ambiguous')
    // Showing one of them the other's dues is the one outcome worth failing to avoid.
    expect(r.kind === 'ambiguous' && r.count).toBe(2)
  })

  it('returns nothing for a number nobody has', () => {
    expect(findMemberByPhone(members, '9999999999').kind).toBe('none')
  })

  it('is not fooled by a partial match', () => {
    // Same last 9 digits, different 10th.
    expect(findMemberByPhone(members, '8876543210').kind).toBe('none')
  })
})
