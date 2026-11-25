import { describe, it, expect } from 'vitest'
import {
  EDITABLE_FIELDS, SENSITIVE_FIELDS, profileProblems, normalizePatch,
  changedFields, changeWords, type EditableField,
} from '@/lib/chit/memberProfile'

describe('what a member may change', () => {
  // Their name, phone and member number are how the operator and the app
  // identify them. A phone number changed by whoever is holding the phone is
  // an account takeover.
  it('does not offer the three that identify them', () => {
    for (const locked of ['name', 'phone', 'member_code']) {
      expect(EDITABLE_FIELDS).not.toContain(locked as EditableField)
    }
  })

  it('offers their own details and their bank', () => {
    expect(EDITABLE_FIELDS).toContain('address')
    expect(EDITABLE_FIELDS).toContain('bank_account_number')
  })

  it('refuses anything not on the list', () => {
    const p = profileProblems({ phone: '9' } as Record<string, string>)
    expect(p[0].message).toContain('not something you can change')
  })
})

describe('what they typed', () => {
  it('accepts sensible values', () => {
    expect(profileProblems({
      aadhaar: '1234 5678 4321', pan: 'abcde1234k',
      bank_ifsc: 'hdfc0001234', bank_account_number: '50100123454321',
      address: '12 Kumaran Road, Tiruppur',
    })).toEqual([])
  })

  // Clearing a field filled in by mistake is a correction, not an error.
  it('allows a field to be emptied', () => {
    expect(profileProblems({ pan: '', aadhaar: '   ' })).toEqual([])
  })

  // A wrong number stored confidently is worse than a blank one.
  it('refuses something that cannot be what it claims to be', () => {
    expect(profileProblems({ aadhaar: '12345' })[0].message).toContain('12 digits')
    expect(profileProblems({ pan: 'ABC123' })[0].message).toContain('ABCDE1234F')
    expect(profileProblems({ bank_ifsc: 'HDFC123' })[0].message).toContain('HDFC0001234')
    expect(profileProblems({ bank_account_number: '12ab' })[0].message).toContain('6 to 20 digits')
    expect(profileProblems({ address: 'x'.repeat(301) })[0].message).toContain('300')
  })

  it('reports every fault at once', () => {
    expect(profileProblems({ pan: 'nope', aadhaar: '1' })).toHaveLength(2)
  })

  it('stores the two codes the way they are printed', () => {
    expect(normalizePatch({ pan: ' abcde1234k ', bank_ifsc: 'hdfc 0001234' }))
      .toEqual({ pan: 'ABCDE1234K', bank_ifsc: 'HDFC0001234' })
  })
})

describe('the record of what changed', () => {
  const before = {
    address: '12 Kumaran Road', pan: 'ABCDE1234K',
    bank_account_number: '50100123454321', bank_ifsc: 'HDFC0001234',
  }

  // Saving a form without touching it should leave no trail, or the trail
  // becomes noise and stops being read.
  it('records nothing when nothing changed', () => {
    expect(changedFields(before, { address: '12 Kumaran Road', pan: 'abcde1234k' })).toEqual([])
  })

  it('keeps what it was as well as what it is', () => {
    const [change] = changedFields(before, { address: '45 Palladam Road' })
    expect(change).toEqual({
      field: 'address', from: '12 Kumaran Road', to: '45 Palladam Road', sensitive: false,
    })
  })

  // A payout goes to whatever is on file, so this is the one to notice.
  it('marks a bank change as the sensitive one', () => {
    const [change] = changedFields(before, { bank_account_number: '50100999999999' })
    expect(change.sensitive).toBe(true)
    expect(SENSITIVE_FIELDS).toContain('bank_ifsc')
  })

  it('says it in one line for the operator', () => {
    expect(changeWords([])).toBe('Nothing changed.')
    expect(changeWords(changedFields(before, { bank_account_number: '50100999999999' })))
      .toBe('Account number changed.')
    expect(changeWords(changedFields(before, {
      bank_account_number: '50100999999999', bank_ifsc: 'ICIC0004321', address: 'New place',
    }))).toBe('Address, Account number and IFSC code changed.')
  })
})
