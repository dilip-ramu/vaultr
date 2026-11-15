// Money moving on an order. Each of these becomes a real bank entry, so the
// arithmetic and the direction are both worth being sure about.

import { describe, it, expect } from 'vitest'
import {
  direction, kindLabel, kindHint, paymentProblem, paymentTransaction,
  paymentTotals, supplierBalance, partyBalance, balanceWords, PAYMENT_KINDS,
  type PaymentInput,
} from '@/lib/orders/payments'

const good: PaymentInput = {
  kind: 'advance', party: 'supplier', amount: 100000, date: '2026-11-15',
  accountId: 'acc-1', partyName: 'Bharathi Fab Tex', reference: 'NEFT 8812',
}

describe('which way the money goes', () => {
  it('pays the supplier out of the account', () => {
    expect(direction('advance', 'supplier')).toBe('out')
    expect(direction('settlement', 'supplier')).toBe('out')
  })

  it('takes the customer in', () => {
    expect(direction('advance', 'customer')).toBe('in')
    expect(direction('settlement', 'customer')).toBe('in')
  })

  it('reverses whichever way that party normally goes for a refund', () => {
    expect(direction('refund', 'supplier')).toBe('in')
    expect(direction('refund', 'customer')).toBe('out')
  })

  it('names every kind on both sides, in the words of that side', () => {
    for (const k of PAYMENT_KINDS) {
      for (const party of ['supplier', 'customer'] as const) {
        expect(kindLabel(k.key, party).length).toBeGreaterThan(3)
        expect(kindHint(k.key, party).length).toBeGreaterThan(10)
      }
      expect(kindLabel(k.key, 'supplier')).not.toBe(kindLabel(k.key, 'customer'))
    }
  })
})

describe('refusing to post nonsense', () => {
  it('lets a good payment through', () => {
    expect(paymentProblem(good)).toBe(null)
  })

  it('insists on an account, because the money comes out of one', () => {
    expect(paymentProblem({ ...good, accountId: '' })).toBe('Pick the account the money moves through')
  })

  it('insists on an amount above zero', () => {
    expect(paymentProblem({ ...good, amount: 0 })).toBe('Enter an amount above zero')
    expect(paymentProblem({ ...good, amount: -500 })).toBe('Enter an amount above zero')
    expect(paymentProblem({ ...good, amount: NaN })).toBe('Enter an amount above zero')
  })

  it('insists on a date', () => {
    expect(paymentProblem({ ...good, date: '' })).toBe('Pick a date')
  })

  it('refuses a kind it does not know', () => {
    expect(paymentProblem({ ...good, kind: 'nonsense' as never })).toBe('Pick what kind of payment this is')
  })

  it('insists on knowing which side of the order this is', () => {
    expect(paymentProblem({ ...good, party: undefined })).toBe('Is this the customer or the supplier?')
  })
})

describe('the bank entry a payment is', () => {
  it('takes an advance out of the account', () => {
    expect(paymentTransaction(good, 'ORD-26-0004')).toEqual({
      account_id: 'acc-1', type: 'expense', amount: 100000, date: '2026-11-15',
      name: 'Advance to Bharathi Fab Tex — ORD-26-0004',
      notes: 'NEFT 8812',
    })
  })

  it('puts a supplier refund back in', () => {
    const t = paymentTransaction({ ...good, kind: 'refund' }, 'ORD-26-0004')
    expect(t.type).toBe('income')
    expect(t.name).toBe('Refund from Bharathi Fab Tex — ORD-26-0004')
  })

  it('brings money from the customer IN', () => {
    const t = paymentTransaction({ ...good, party: 'customer', partyName: 'Northwind Apparel' }, 'ORD-1')
    expect(t.type).toBe('income')
    expect(t.name).toBe('Advance from Northwind Apparel — ORD-1')
  })

  it('sends a refund to the customer back OUT', () => {
    const t = paymentTransaction({ ...good, party: 'customer', kind: 'refund', partyName: 'Northwind Apparel' }, 'ORD-1')
    expect(t.type).toBe('expense')
    expect(t.name).toBe('Refund to Northwind Apparel — ORD-1')
  })

  it('names a settlement a payment', () => {
    expect(paymentTransaction({ ...good, kind: 'settlement' }, 'ORD-1').name)
      .toBe('Payment to Bharathi Fab Tex — ORD-1')
  })

  it('still names the order when there is no party', () => {
    expect(paymentTransaction({ ...good, partyName: null }, 'ORD-1').name).toBe('Advance — ORD-1')
  })

  it('joins the reference and the note', () => {
    expect(paymentTransaction({ ...good, note: 'part payment' }, 'ORD-1').notes).toBe('NEFT 8812 · part payment')
  })

  it('leaves the notes empty rather than writing an empty string', () => {
    expect(paymentTransaction({ ...good, reference: null, note: null }, 'ORD-1').notes).toBe(null)
  })

  it('settles the amount to the paisa', () => {
    expect(paymentTransaction({ ...good, amount: 1000.005 }, 'ORD-1').amount).toBe(1000.01)
  })
})

describe('where the order stands', () => {
  const rows = [
    { kind: 'advance' as const, party: 'supplier' as const, amount: 100000 },
    { kind: 'settlement' as const, party: 'supplier' as const, amount: 250000 },
    { kind: 'refund' as const, party: 'supplier' as const, amount: 5000 },
  ]

  it('adds the kinds up separately', () => {
    expect(paymentTotals(rows)).toEqual({ gross: 350000, advances: 100000, refunds: 5000, net: 345000 })
  })

  it('keeps the two sides of the order apart', () => {
    const mixed = [
      ...rows,
      { kind: 'advance' as const, party: 'customer' as const, amount: 900000 },
    ]
    expect(paymentTotals(mixed, 'supplier').net).toBe(345000)
    expect(paymentTotals(mixed, 'customer').net).toBe(900000)
  })

  it('treats a row with no party as the supplier, as the old ones are', () => {
    expect(paymentTotals([{ kind: 'advance', amount: 1000 }], 'supplier').net).toBe(1000)
  })

  it('copes with nothing paid yet', () => {
    expect(paymentTotals([])).toEqual({ gross: 0, advances: 0, refunds: 0, net: 0 })
  })

  it('measures what is owed against the BILLS, not the agreed cost', () => {
    // Until the supplier invoices, nothing is owed however much the order
    // says it will come to.
    expect(supplierBalance(500000, rows)).toBe(155000)
  })

  it('shows an advance paid before any bill as money they are holding', () => {
    expect(supplierBalance(0, [{ kind: 'advance', amount: 100000 }])).toBe(-100000)
    expect(balanceWords(-100000)).toBe('paid in advance')
  })

  it('says settled when it is settled, give or take a paisa', () => {
    expect(balanceWords(0)).toBe('Settled')
    expect(balanceWords(0.004)).toBe('Settled')
  })

  it('says what is still to pay', () => {
    expect(balanceWords(155000)).toBe('still to pay')
  })

  it('words the customer side as collecting, not paying', () => {
    expect(balanceWords(155000, 'customer')).toBe('still to collect')
    expect(balanceWords(-50000, 'customer')).toBe('received in advance')
  })

  it('measures the customer side against the invoices', () => {
    const received = [{ kind: 'advance' as const, party: 'customer' as const, amount: 900000 }]
    expect(partyBalance(2000000, received, 'customer')).toBe(1100000)
  })
})
