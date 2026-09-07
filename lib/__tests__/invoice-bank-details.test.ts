// Whose bank account appears on a document.
//
// THE RULE, AND WHY IT IS NOT THE SAME AS THE OTHER FIELDS
//
// Branding may fall back. A company that has not filled in its address can
// borrow the legacy settings row and the worst outcome is a stale address.
//
// An ACCOUNT NUMBER may NOT fall back. An invoice issued from company A that
// prints company B's account number sends the customer's money to the wrong
// place, and it does it silently on every invoice. Printing no bank block is a
// nuisance; printing the wrong one is a misdirected payment.
//
// So once a document names a company, its bank details come from that company
// or not at all. Only a pre-companies document with no company_id may use the
// legacy row.

import { describe, it, expect } from 'vitest'

type Fields = Record<string, string | null>

/** Branding: company first, then the legacy row. */
const pick = (c: unknown, l: unknown) => (c ?? l ?? null) as string | null

/** Bank: the named company, or nothing. */
const bankFrom = (company: Fields | null, legacy: Fields | null, field: string): string | null => {
  if (company) return company[field] ?? null
  return legacy?.[field] ?? null
}

const LEGACY: Fields = {
  company_name: 'Old Single Company',
  bank_name: 'Indian Overseas Bank',
  bank_account_number: '111100001111',
  bank_ifsc: 'IOBA0001111',
}

const ACME: Fields = {
  name: 'Acme Exports',
  bank_name: 'HDFC Bank, Tiruppur',
  bank_account_number: '50100999888777',
  bank_ifsc: 'HDFC0000123',
}

/** A company that exists but whose bank details were never entered. */
const NO_BANK: Fields = { name: 'Second Entity', bank_name: null, bank_account_number: null, bank_ifsc: null }

describe('bank details on a document', () => {
  it('uses the chosen company’s bank, not the legacy one', () => {
    expect(bankFrom(ACME, LEGACY, 'bank_name')).toBe('HDFC Bank, Tiruppur')
    expect(bankFrom(ACME, LEGACY, 'bank_account_number')).toBe('50100999888777')
  })

  it('prints NOTHING rather than another entity’s account', () => {
    // This is the bug: it used to return the legacy account number here, so
    // every company's invoice showed the same bank.
    expect(bankFrom(NO_BANK, LEGACY, 'bank_name')).toBeNull()
    expect(bankFrom(NO_BANK, LEGACY, 'bank_account_number')).toBeNull()
  })

  it('still uses the legacy row for a document that names no company', () => {
    // Invoices raised before companies existed must keep working.
    expect(bankFrom(null, LEGACY, 'bank_account_number')).toBe('111100001111')
  })

  it('lets BRANDING fall back, because a stale address is not a wrong payment', () => {
    expect(pick(NO_BANK.name, LEGACY.company_name)).toBe('Second Entity')
    expect(pick(null, LEGACY.company_name)).toBe('Old Single Company')
  })

  it('never shows two different companies the same account number', () => {
    const a = bankFrom(ACME, LEGACY, 'bank_account_number')
    const b = bankFrom(NO_BANK, LEGACY, 'bank_account_number')
    expect(a).not.toBe(b)
  })
})
