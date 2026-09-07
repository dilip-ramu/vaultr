// Several bank accounts per company, one chosen per document.
//
// The rule these pin down is the one that decides where a customer's money
// goes. An invoice issued from company A must print A's account or nothing at
// all — never B's, and never a global fallback, because a customer paying the
// wrong account is not a cosmetic defect.

import { describe, it, expect } from 'vitest'
import {
  selectAccount, toBankFields, accountLabel, EMPTY_BANK,
  type CompanyBankAccount,
} from '@/lib/companies/bankAccounts'

const A = 'company-a'
const B = 'company-b'

const acct = (over: Partial<CompanyBankAccount>): CompanyBankAccount => ({
  id: 'x', company_id: A, label: null, bank_name: 'HDFC Bank', account_name: 'Acme Exports',
  account_number: '50100999888777', ifsc: 'HDFC0000123', swift_code: null, branch: null,
  is_default: false, is_active: true, sort_order: 0,
  ...over,
})

const HDFC   = acct({ id: 'a1', company_id: A, is_default: true, bank_name: 'HDFC Bank', account_number: '50100999888777' })
const EXPORT = acct({ id: 'a2', company_id: A, label: 'Export account', bank_name: 'ICICI', account_number: '000111222333' })
const CLOSED = acct({ id: 'a3', company_id: A, label: 'Old account', is_active: false, account_number: '999888777666' })
const OTHER  = acct({ id: 'b1', company_id: B, is_default: true, bank_name: 'Indian Overseas Bank', account_number: '111100001111' })

const ALL = [HDFC, EXPORT, CLOSED, OTHER]

describe('choosing which account a document prints', () => {
  it('uses the account the document names', () => {
    expect(selectAccount(ALL, A, 'a2')!.id).toBe('a2')
  })

  it('falls back to the company default when none is named', () => {
    expect(selectAccount(ALL, A, null)!.id).toBe('a1')
  })

  it('NEVER reaches into another company, even when asked to', () => {
    // The exact failure this feature replaces: one entity's invoice showing
    // another entity's account number.
    expect(selectAccount(ALL, A, 'b1')!.id).toBe('a1')
    expect(selectAccount(ALL, A, 'b1')!.company_id).toBe(A)
  })

  it('returns nothing rather than guessing when a company has no accounts', () => {
    expect(selectAccount(ALL, 'company-with-none', null)).toBeNull()
    expect(selectAccount([], A, null)).toBeNull()
  })

  it('returns nothing when no company is named', () => {
    expect(selectAccount(ALL, null, 'a1')).toBeNull()
  })

  it('reprints an old document with the closed account it was issued on', () => {
    // Reprinting an invoice must reproduce it, not quietly restate it with
    // today's account.
    expect(selectAccount(ALL, A, 'a3')!.id).toBe('a3')
  })

  it('falls back to the default when the named account is gone entirely', () => {
    expect(selectAccount(ALL, A, 'deleted-id')!.id).toBe('a1')
  })

  it('has no default to fall back on if none is marked', () => {
    const noDefault = [acct({ id: 'n1', is_default: false })]
    expect(selectAccount(noDefault, A, null)).toBeNull()
  })
})

describe('how an account is rendered', () => {
  it('joins bank and branch into the printed bank line', () => {
    const f = toBankFields(acct({ bank_name: 'HDFC Bank', branch: 'Tiruppur' }))
    expect(f.bank_name).toBe('HDFC Bank, Tiruppur')
    expect(f.bank_account_number).toBe('50100999888777')
  })

  it('gives empty fields for no account, so nothing is printed', () => {
    expect(toBankFields(null)).toEqual(EMPTY_BANK)
  })

  it('prefers the label in the picker', () => {
    expect(accountLabel(EXPORT)).toBe('Export account')
  })

  it('shows only the last four digits when there is no label', () => {
    const shown = accountLabel(HDFC)
    expect(shown).toContain('8777')
    // The full number is not something a picker needs to display.
    expect(shown).not.toContain('50100999888777')
  })
})
