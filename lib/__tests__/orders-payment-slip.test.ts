import { describe, it, expect } from 'vitest'
import { paymentSlipDocModel, paymentSlipFilename, type PaymentSlipInput } from '@/lib/orders/paymentSlip'

const base = (over: Partial<PaymentSlipInput> = {}): PaymentSlipInput => ({
  number: 'PS-004', kind: 'advance', amount: 100000, date: '15 Nov 2026',
  partyName: 'Bharathi Fab Tex Private Limited',
  accountName: 'HDFC Current · 5678',
  reference: 'NEFT 8812',
  orderNumber: 'ORD-26-0004', customerPoNo: 'PNG/2026/144',
  companyName: 'Pengvin Clothing', accent: '#1F5C3A',
  ...over,
})

describe('the slip for money going out', () => {
  it('calls itself a payment slip and says who was paid', () => {
    const m = paymentSlipDocModel(base())
    expect(m.title).toBe('PAYMENT SLIP')
    expect(m.parties[0]).toMatchObject({ label: 'PAID TO', name: 'Bharathi Fab Tex Private Limited' })
    expect(m.grandLabel).toBe('PAID')
  })

  it('puts the amount in words, which is the point of a slip', () => {
    expect(paymentSlipDocModel(base()).inWords).toBe('Indian Rupee One Lakh Only')
  })

  it('names the account on the face of it, so it ties to the bank statement', () => {
    expect(paymentSlipDocModel(base()).meta?.map(x => x.label)).toEqual(['Date', 'Order', 'Reference', 'Paid from'])
  })

  it('says plainly that it is not a tax invoice', () => {
    expect(paymentSlipDocModel(base()).subNote).toContain('Not a tax invoice')
  })

  it('spells out what the payment was against', () => {
    expect(paymentSlipDocModel(base()).rows[0].cells.what)
      .toBe('Advance against order ORD-26-0004\nBuyer reference PNG/2026/144')
  })

  it('adds the note when there is one', () => {
    expect(paymentSlipDocModel(base({ note: '30% on order confirmation' })).rows[0].cells.what)
      .toContain('30% on order confirmation')
  })
})

describe('the slip for money coming back', () => {
  it('becomes a receipt and turns the wording round', () => {
    const m = paymentSlipDocModel(base({ kind: 'refund' }))
    expect(m.title).toBe('RECEIPT')
    expect(m.parties[0].label).toBe('RECEIVED FROM')
    expect(m.grandLabel).toBe('RECEIVED')
    expect(m.meta?.some(x => x.label === 'Received into')).toBe(true)
  })
})

describe('odds and ends', () => {
  it('leaves out what has not been given rather than printing an empty label', () => {
    const m = paymentSlipDocModel(base({ reference: null, accountName: null, customerPoNo: null }))
    expect(m.meta?.map(x => x.label)).toEqual(['Date', 'Order'])
    expect(m.rows[0].cells.what).toBe('Advance against order ORD-26-0004')
  })

  it('has no party box when nobody was named', () => {
    expect(paymentSlipDocModel(base({ partyName: null })).parties).toEqual([])
  })

  it('names the file the way somebody will look for it', () => {
    expect(paymentSlipFilename({ kind: 'advance', orderNumber: 'ORD-26-0004', number: 'PS-004' }))
      .toBe('Payment ORD-26-0004 PS-004')
    expect(paymentSlipFilename({ kind: 'refund', orderNumber: 'ORD-26-0004', number: 'PS-005' }))
      .toBe('Receipt ORD-26-0004 PS-005')
  })

  it('strips characters a file system will refuse', () => {
    expect(paymentSlipFilename({ kind: 'advance', orderNumber: 'A/B', number: 'x' })).toBe('Payment A-B x')
  })
})

describe('the customer side of the slip', () => {
  it('is a receipt when the customer paid us', () => {
    const m = paymentSlipDocModel(base({ party: 'customer', kind: 'settlement', partyName: 'Northwind Apparel' }))
    expect(m.title).toBe('RECEIPT')
    expect(m.parties[0].label).toBe('RECEIVED FROM')
    expect(m.rows[0].cells.what).toContain('Payment against order')
  })

  it('is a payment slip when we refunded the customer', () => {
    expect(paymentSlipDocModel(base({ party: 'customer', kind: 'refund' })).title).toBe('PAYMENT SLIP')
  })

  it('names the file by which way the money went, not by the party', () => {
    expect(paymentSlipFilename({ kind: 'settlement', party: 'customer', orderNumber: 'O1', number: 'x' }))
      .toBe('Receipt O1 x')
    expect(paymentSlipFilename({ kind: 'refund', party: 'customer', orderNumber: 'O1', number: 'x' }))
      .toBe('Payment O1 x')
  })
})
