// Which of your own bank accounts a document prints.
//
// These accounts are the rows on the Accounts page — the same ones whose
// balances you reconcile — tagged to a company. Nothing is copied, so an
// account number exists in exactly one place.
//
// The rule below decides where a customer sends money. An invoice issued from
// company A must print A's account or nothing at all; never B's, and never a
// global fallback.

import { describe, it, expect } from 'vitest'
import {
  selectAccount, toBankFields, accountLabel, EMPTY_BANK,
  type BillingAccount,
} from '@/lib/companies/bankAccounts'

const A = 'company-a'
const B = 'company-b'

const acct = (over: Partial<BillingAccount>): BillingAccount => ({
  id: 'x', company_id: A, name: 'HDFC Current', account_number: '50100999888777',
  ifsc_code: 'HDFC0000123', swift_code: null, branch: null,
  account_holder: 'Acme Exports', is_active: true,
  ...over,
})

const HDFC   = acct({ id: 'a1' })
const EXPORT = acct({ id: 'a2', name: 'ICICI Export', account_number: '000111222333' })
const CLOSED = acct({ id: 'a3', name: 'Old account', account_number: '999888777666', is_active: false })
const OTHER  = acct({ id: 'b1', company_id: B, name: 'Indian Overseas Bank', account_number: '111100001111' })

const ALL = [HDFC, EXPORT, CLOSED, OTHER]
const DEFAULT_A = 'a1'

describe('choosing which account a document prints', () => {
  it('uses the account the document names', () => {
    expect(selectAccount(ALL, A, 'a2', DEFAULT_A)!.id).toBe('a2')
  })

  it('falls back to the company default when none is named', () => {
    expect(selectAccount(ALL, A, null, DEFAULT_A)!.id).toBe('a1')
  })

  it('NEVER reaches into another company, even when asked to', () => {
    // The exact failure this replaces: one entity's invoice showing another
    // entity's account number.
    expect(selectAccount(ALL, A, 'b1', DEFAULT_A)!.id).toBe('a1')
    expect(selectAccount(ALL, A, 'b1', DEFAULT_A)!.company_id).toBe(A)
  })

  it('will not use another company’s account even as a default', () => {
    // A stale default pointing at a reassigned account must not leak.
    expect(selectAccount(ALL, A, null, 'b1')).toBeNull()
  })

  it('returns nothing rather than guessing when a company has none', () => {
    expect(selectAccount(ALL, 'company-with-none', null, null)).toBeNull()
    expect(selectAccount([], A, null, DEFAULT_A)).toBeNull()
  })

  it('returns nothing when no company is named', () => {
    expect(selectAccount(ALL, null, 'a1', DEFAULT_A)).toBeNull()
  })

  it('reprints an old document on the closed account it was issued with', () => {
    // Reprinting must reproduce the document, not restate it with today's
    // account.
    expect(selectAccount(ALL, A, 'a3', DEFAULT_A)!.id).toBe('a3')
  })

  it('falls back to the default when the named account is gone', () => {
    expect(selectAccount(ALL, A, 'deleted-id', DEFAULT_A)!.id).toBe('a1')
  })

  it('prints nothing when the company has accounts but no default set', () => {
    expect(selectAccount(ALL, A, null, null)).toBeNull()
  })
})

describe('how an account is rendered on a document', () => {
  it('joins the account name and branch into the bank line', () => {
    const f = toBankFields(acct({ name: 'HDFC Bank', branch: 'Tiruppur' }))
    expect(f.bank_name).toBe('HDFC Bank, Tiruppur')
    expect(f.bank_account_number).toBe('50100999888777')
    expect(f.bank_ifsc).toBe('HDFC0000123')
  })

  it('uses the account holder as the account name', () => {
    expect(toBankFields(HDFC).bank_account_name).toBe('Acme Exports')
  })

  it('gives empty fields for no account, so nothing prints', () => {
    expect(toBankFields(null)).toEqual(EMPTY_BANK)
  })

  it('shows only the last four digits in the picker', () => {
    const shown = accountLabel(HDFC)
    expect(shown).toContain('8777')
    expect(shown).not.toContain('50100999888777')
  })
})
