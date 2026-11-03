// A document prints in the currency it was raised in. Getting this wrong
// means sending a buyer a price with the wrong symbol on it.

import { describe, it, expect } from 'vitest'
import { issuedDocToModel, type InvoiceSettings } from '@/lib/documents/adapters'

const settings: InvoiceSettings = { company_name: 'Pengvin Clothing', company_gstin: '33ABCDE1234F1Z5' }
const refs = { accent: '#1F5C3A', logoUrl: null, signatureUrl: null }
const meta = {
  title: 'Sales Order', partyLabel: 'Customer', tax: true,
  statusLabel: 'ORDER', statusTone: 'blue' as const,
}
const lines = [{ item: 'Polo', hsn_sac: '6105', qty: 1200, rate: 32, amount: 38400, gst_rate: 0 }]

const doc = (over: Record<string, unknown> = {}) => ({
  doc_type: 'sales_order', number: 'SO-1', date: '2026-08-18',
  party_name: 'Northwind Apparel LLC',
  subtotal: 48000, cgst_amount: 0, sgst_amount: 0, total: 48000,
  ...over,
})

describe('a document in the customer currency', () => {
  it('prints dollars, grouped the Western way', () => {
    const m = issuedDocToModel(doc({ currency: 'USD', subtotal: 1234567, total: 1234567 }), lines, settings, meta, refs)
    expect(m.grandValue).toBe('$1,234,567')
  })

  it('says the amount in that currency, in words', () => {
    const m = issuedDocToModel(doc({ currency: 'USD' }), lines, settings, meta, refs)
    expect(m.inWords).toBe('US Dollar Forty-Eight Thousand Only')
  })

  it('still prints rupees when nothing says otherwise', () => {
    const m = issuedDocToModel(doc({ subtotal: 1234567, total: 1234567 }), lines, settings, meta, refs)
    expect(m.grandValue).toBe('₹12,34,567')
    expect(m.inWords).toContain('Rupee')
  })

  it('groups a rupee document the Indian way and a dollar one the Western way', () => {
    const inr = issuedDocToModel(doc({ currency: 'INR', subtotal: 4281600, total: 4281600 }), lines, settings, meta, refs)
    const usd = issuedDocToModel(doc({ currency: 'USD', subtotal: 4281600, total: 4281600 }), lines, settings, meta, refs)
    expect(inr.grandValue).toBe('₹42,81,600')
    expect(usd.grandValue).toBe('$4,281,600')
  })
})

describe('tax lines', () => {
  it('shows no tax line at all on a zero-rated export', () => {
    const m = issuedDocToModel(doc({ currency: 'USD' }), lines, settings, meta, refs)
    expect(m.totals?.map(t => t.label)).toEqual(['Taxable value'])
  })

  it('still shows CGST and SGST on a normal domestic document', () => {
    const m = issuedDocToModel(
      doc({ subtotal: 100000, cgst_amount: 9000, sgst_amount: 9000, total: 118000 }),
      lines, settings, meta, refs)
    expect(m.totals?.map(t => t.label)).toEqual(['Taxable value', 'CGST', 'SGST'])
  })

  it('still shows IGST when the tax is inter-state', () => {
    const m = issuedDocToModel(
      doc({ subtotal: 100000, cgst_amount: 0, sgst_amount: 0, total: 118000 }),
      lines, settings, meta, refs)
    expect(m.totals?.map(t => t.label)).toEqual(['Taxable value', 'IGST'])
  })
})

describe('a purchase order', () => {
  it('is in rupees even when the job it belongs to is in dollars', () => {
    // The supplier is paid in rupees whatever the customer pays in. The
    // document carries its own currency, so this is simply INR.
    const m = issuedDocToModel(
      doc({ doc_type: 'purchase_order', currency: 'INR', subtotal: 3620000, total: 3620000 }),
      lines, settings, { ...meta, title: 'Purchase Order', partyLabel: 'Vendor' }, refs)
    expect(m.grandValue).toBe('₹36,20,000')
  })
})
