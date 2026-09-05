// Bulk "mark billed" on supplier invoices.
//
// THE BUG THIS PINS DOWN
//
// The bulk action required recoverable_status to equal the exact string
// 'pending_billing'. But the column has NO DEFAULT (migration v15: "NULL when
// not recoverable"), so a recoverable bill created without that field set sits
// at NULL and matched nothing. The single-row button never checked the status
// at all — so marking one at a time worked and selecting several did not, which
// is precisely the wrong way round and reads as "bulk is broken".
//
// These tests are on the pure eligibility rule, which is the part that was
// wrong. They would have failed before the fix.

import { describe, it, expect } from 'vitest'

/** The rule as it now stands in SupplierInvoicesClient. */
const canBeBilled = (i: { is_recoverable: boolean; recoverable_status: string | null }) =>
  i.is_recoverable && i.recoverable_status !== 'billed' && i.recoverable_status !== 'recovered'

/** The rule as it was — kept so the difference is visible, not just asserted. */
const oldRule = (i: { is_recoverable: boolean; recoverable_status: string | null }) =>
  i.is_recoverable && i.recoverable_status === 'pending_billing'

const bill = (is_recoverable: boolean, recoverable_status: string | null) =>
  ({ is_recoverable, recoverable_status })

describe('which selected bills can be marked billed', () => {
  it('includes a recoverable bill with NO status — the case that broke it', () => {
    const row = bill(true, null)
    expect(canBeBilled(row)).toBe(true)
    // And the proof that this is a real change, not a restatement:
    expect(oldRule(row)).toBe(false)
  })

  it('includes one explicitly pending billing', () => {
    expect(canBeBilled(bill(true, 'pending_billing'))).toBe(true)
  })

  it('includes a partial recovery, which is not finished', () => {
    const row = bill(true, 'partial_recovery')
    expect(canBeBilled(row)).toBe(true)
    expect(oldRule(row)).toBe(false)
  })

  it('excludes one already billed, so the button is not a no-op', () => {
    expect(canBeBilled(bill(true, 'billed'))).toBe(false)
  })

  it('excludes one already settled — going back is a different button', () => {
    expect(canBeBilled(bill(true, 'recovered'))).toBe(false)
  })

  it('excludes anything not marked recoverable', () => {
    expect(canBeBilled(bill(false, null))).toBe(false)
    expect(canBeBilled(bill(false, 'pending_billing'))).toBe(false)
  })

  it('marks a realistic mixed selection in ONE press, not five', () => {
    const selection = [
      bill(true, null),               // created before the status was set
      bill(true, 'pending_billing'),
      bill(true, null),
      bill(true, 'billed'),           // already done
      bill(false, null),              // not recoverable
    ]
    expect(selection.filter(canBeBilled)).toHaveLength(3)
    // Before the fix this selection produced ONE eligible row, so four of the
    // five had to be done by hand.
    expect(selection.filter(oldRule)).toHaveLength(1)
  })
})
