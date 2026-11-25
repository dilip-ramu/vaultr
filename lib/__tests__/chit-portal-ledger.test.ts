import { describe, it, expect } from 'vitest'
import { ledgerRows, ledgerTotals, type LedgerInput } from '@/lib/chit/portalLedger'

const input = (o: Partial<LedgerInput> = {}): LedgerInput => ({
  receivables: [], collections: [], auctions: [], installment: 25000, ...o,
})

describe('a chit that was already running when it was entered', () => {
  // The bug: the passbook was built from receivables alone, so a group with
  // collections and no receivables showed the member nothing — months of
  // their own payments, invisible.
  it('shows months that were paid but never billed', () => {
    const rows = ledgerRows(input({
      collections: [
        { month_number: 1, amount: 24000, paid_date: '2026-04-06' },
        { month_number: 2, amount: 23500, paid_date: '2026-05-06' },
      ],
      auctions: [
        { month_number: 1, dividend_per_member: 1000 },
        { month_number: 2, dividend_per_member: 1500 },
      ],
    }))
    expect(rows.map(r => r.monthNumber)).toEqual([1, 2])
    expect(rows[0]).toMatchObject({ dueAmount: 24000, paidAmount: 24000, status: 'PAID' })
    expect(rows[1]).toMatchObject({ dueAmount: 23500, paidAmount: 23500, status: 'PAID' })
  })

  it('shows a month that was auctioned but not yet paid', () => {
    const rows = ledgerRows(input({ auctions: [{ month_number: 3, dividend_per_member: 2000 }] }))
    expect(rows[0]).toMatchObject({ monthNumber: 3, dueAmount: 23000, paidAmount: null, status: 'PENDING' })
  })

  it('falls back to the plain subscription with no auction to go on', () => {
    const rows = ledgerRows(input({ collections: [{ month_number: 1, amount: 25000 }] }))
    expect(rows[0].dueAmount).toBe(25000)
  })
})

describe('where a month was billed, the bill stands', () => {
  // It is what the member was actually told, whatever the arithmetic says.
  it('uses the billed figure over a calculated one', () => {
    const rows = ledgerRows(input({
      receivables: [{ month_number: 1, amount: 20000, due_date: '2026-04-15', status: 'PENDING' }],
      auctions: [{ month_number: 1, dividend_per_member: 1000 }],
    }))
    expect(rows[0]).toMatchObject({ dueAmount: 20000, dueDate: '2026-04-15' })
  })

  it('keeps a decision somebody made', () => {
    const rows = ledgerRows(input({
      receivables: [{ month_number: 1, amount: 24000, status: 'WAIVED' }],
    }))
    expect(rows[0].status).toBe('WAIVED')
  })

  // The collection is the fact; the status is a label that can lag behind it.
  it('calls a billed month paid once the money is in', () => {
    const rows = ledgerRows(input({
      receivables: [{ month_number: 1, amount: 24000, status: 'PENDING' }],
      collections: [{ month_number: 1, amount: 24000 }],
    }))
    expect(rows[0].status).toBe('PAID')
  })

  it('says part paid, which the old passbook could not', () => {
    const rows = ledgerRows(input({
      receivables: [{ month_number: 1, amount: 24000 }],
      collections: [{ month_number: 1, amount: 10000 }],
    }))
    expect(rows[0]).toMatchObject({ status: 'PARTIAL', paidAmount: 10000 })
  })
})

describe('the months, in order and without repeats', () => {
  it('merges all three sources once each', () => {
    const rows = ledgerRows(input({
      receivables: [{ month_number: 2, amount: 1 }],
      collections: [{ month_number: 1, amount: 1 }, { month_number: 2, amount: 1 }],
      auctions: [{ month_number: 3 }, { month_number: 1 }],
    }))
    expect(rows.map(r => r.monthNumber)).toEqual([1, 2, 3])
  })

  it('ignores a month number that makes no sense', () => {
    expect(ledgerRows(input({ collections: [{ month_number: 0, amount: 1 }] }))).toEqual([])
  })

  it('has nothing to show for a chit with nothing in it', () => {
    expect(ledgerRows(input())).toEqual([])
  })
})

describe('the totals under the passbook', () => {
  const rows = ledgerRows(input({
    collections: [{ month_number: 1, amount: 24000 }, { month_number: 2, amount: 10000 }],
    auctions: [
      { month_number: 1, dividend_per_member: 1000 },
      { month_number: 2, dividend_per_member: 1500 },
      { month_number: 3, dividend_per_member: 2000 },
    ],
  }))

  it('adds up what is owed and what went in', () => {
    const t = ledgerTotals(rows)
    // 24,000 + 23,500 + 23,000 billed; 34,000 paid.
    expect(t.due).toBe(70500)
    expect(t.paid).toBe(34000)
    expect(t.outstanding).toBe(36500)
    expect(t.monthsPaid).toBe(1)
  })

  it('leaves a waived month out of what is owed', () => {
    const waived = ledgerRows(input({
      receivables: [{ month_number: 1, amount: 24000, status: 'WAIVED' }],
    }))
    expect(ledgerTotals(waived).due).toBe(0)
  })
})
