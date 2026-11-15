// Money moving on an order. Each of these becomes a real bank entry, so the
// arithmetic and the direction are both worth being sure about.

import { describe, it, expect } from 'vitest'
import {
  direction, kindLabel, paymentProblem, paymentTransaction,
  paymentTotals, supplierBalance, balanceWords, PAYMENT_KINDS,
  type PaymentInput,
} from '@/lib/orders/payments'

const good: PaymentInput = {
  kind: 'advance', amount: 100000, date: '2026-11-15',
  accountId: 'acc-1', partyName: 'Bharathi Fab Tex', reference: 'NEFT 8812',
}

describe('which way the money goes', () => {
  it('sends an advance and a settlement out', () => {
    expect(direction('advance')).toBe('out')
    expect(direction('settlement')).toBe('out')
  })

  it('brings a refund in', () => {
    expect(direction('refund')).toBe('in')
  })

  it('names every kind it offers', () => {
    for (const k of PAYMENT_KINDS) {
      expect(kindLabel(k.key)).toBe(k.label)
      expect(k.hint.length).toBeGreaterThan(10)
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
})

describe('the bank entry a payment is', () => {
  it('takes an advance out of the account', () => {
    expect(paymentTransaction(good, 'ORD-26-0004')).toEqual({
      account_id: 'acc-1', type: 'expense', amount: 100000, date: '2026-11-15',
      name: 'Advance to Bharathi Fab Tex — ORD-26-0004',
      notes: 'NEFT 8812',
    })
  })

  it('puts a refund back in', () => {
    const t = paymentTransaction({ ...good, kind: 'refund' }, 'ORD-26-0004')
    expect(t.type).toBe('income')
    expect(t.name).toBe('Refund from Bharathi Fab Tex — ORD-26-0004')
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
    { kind: 'advance' as const, amount: 100000 },
    { kind: 'settlement' as const, amount: 250000 },
    { kind: 'refund' as const, amount: 5000 },
  ]

  it('adds the kinds up separately', () => {
    expect(paymentTotals(rows)).toEqual({ paidOut: 350000, advances: 100000, refunds: 5000, net: 345000 })
  })

  it('copes with nothing paid yet', () => {
    expect(paymentTotals([])).toEqual({ paidOut: 0, advances: 0, refunds: 0, net: 0 })
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
})
