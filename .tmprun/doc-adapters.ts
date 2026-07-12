import { describe, it, expect } from './shim'
import { taxInvoiceToModel, issuedDocToModel, type InvoiceSettings } from '../lib/documents/adapters'
import type { DocModel } from '../lib/documents/model'

const settings: InvoiceSettings = {
  company_name: 'Lullabee',
  company_address: '4/603, Kurunji Nagar\nTiruppur- 641605',
  company_gstin: '33AAMFL2572J1Z4',
  company_phone: '9876543210',
  company_email: 'hi@lullabee.in',
  bank_account_name: 'Lullabee',
  bank_account_number: '50100123456789',
  bank_ifsc: 'HDFC0000123',
  bank_name: 'HDFC Bank',
  swift_code: 'HDFCINBB',
  terms_conditions: 'Payment within 30 days.',
}

const refs = { logoUrl: null, signatureUrl: null, signatureSize: null, accent: '#1F5C3A' }

const taxInvoice = {
  invoice_number: 'L-2600012', invoice_date: '2026-07-11', due_date: '2026-08-10',
  customer_name: 'Amaravathi Garments Mfg Co', customer_address: 'NEW NO.18, 4TH CROSS STREET',
  customer_gstin: '33AANFA7615E1ZN', customer_state: 'Tamil Nadu',
  subtotal: 823869, cgst_rate: 9, sgst_rate: 9, cgst_amount: 74148.21, sgst_amount: 74148.21,
  total: 972165.42, status: 'sent',
}
const taxLines = [
  { description: 'Courier charges', awb: '12345', client_name: 'Acme', hsn_sac: '996812', qty: 1203, rate: 435, amount: 523305 },
  { description: 'Handling', hsn_sac: '996813', qty: 1242, rate: 242, amount: 300564 },
]

const doc = {
  number: 'L-PI260001', date: '2026-07-11', reference: 'PO-99',
  party_name: 'Amaravathi Garments Mfg Co', party_address: 'NEW NO.18, 4TH CROSS STREET',
  party_gstin: '33AANFA7615E1ZN', party_state: 'Tamil Nadu',
  subtotal: 823869, cgst_amount: 74148.21, sgst_amount: 74148.21, total: 972165.42,
}
const docLines = [
  { item: 'test', hsn_sac: '123456', qty: 1203, rate: 435, amount: 523305, gst_rate: 18 },
  { item: 'test 1', hsn_sac: '214124', qty: 1242, rate: 242, amount: 300564, gst_rate: 18 },
]
const meta = {
  title: 'Proforma Invoice', partyLabel: 'Customer', tax: true,
  statusLabel: 'PROFORMA', statusTone: 'grey' as const,
}

const models: [string, DocModel][] = [
  ['taxInvoiceToModel', taxInvoiceToModel(taxInvoice, taxLines, settings, refs)],
  ['issuedDocToModel', issuedDocToModel(doc, docLines, settings, meta, refs)],
]

describe.each(models)('%s', (_name, model) => {
  // THE BUG: the table rendered r.cells['desc'] while the adapter wrote
  // cells['item'] — so the description column came out blank on every proforma,
  // PO, quote, SO, challan and note. Every declared column must have a cell.
  it('every declared column has a matching key in every row', () => {
    const keys = model.columns.map(c => c.key)
    for (const row of model.rows) {
      for (const k of keys) {
        expect(Object.keys(row.cells), `row is missing the "${k}" cell`).toContain(k)
      }
    }
  })

  it('the first column carries the description text and is not blank', () => {
    const first = model.columns[0].key
    expect(first).toBe('desc')
    for (const row of model.rows) expect(row.cells[first].trim()).not.toBe('')
  })

  it('exposes both GSTINs to the template engine', () => {
    expect(model.fields?.['company.gstin']).toBe('33AAMFL2572J1Z4')
    expect(model.fields?.['party.gstin']).toBe('33AANFA7615E1ZN')
  })

  it('does not duplicate the GSTIN inside the address field', () => {
    expect(model.fields?.['party.address'] ?? '').not.toMatch(/GSTIN/i)
    expect(model.fields?.['company.address'] ?? '').not.toMatch(/GSTIN/i)
  })

  it('spells out the bank account number rather than dumping a bare number', () => {
    const bank = (model.bankLines ?? []).join(' | ')
    expect(bank).toContain('Account Number: 50100123456789')
    expect(bank).toContain('IFSC: HDFC0000123')
  })

  it('states the amount in words', () => {
    expect((model.fields?.['totals.inWords'] ?? '').length).toBeGreaterThan(0)
  })
})

describe('taxInvoiceToModel — courier details', () => {
  const model = taxInvoiceToModel(taxInvoice, taxLines, settings, refs)

  it('folds AWB and client into the description instead of adding columns', () => {
    expect(model.columns.map(c => c.key)).toEqual(['desc', 'hsn', 'qty', 'rate', 'amt'])
    expect(model.rows[0].cells.desc).toContain('Acme')
    expect(model.rows[0].cells.desc).toContain('AWB 12345')
  })

  it('never reads DRAFT — a saved invoice is an issued invoice', () => {
    const draft = taxInvoiceToModel({ ...taxInvoice, status: 'draft' }, taxLines, settings, refs)
    expect(draft.status?.label.toUpperCase()).not.toBe('DRAFT')
  })

  it('switches to IGST when there is no CGST/SGST', () => {
    const igst = taxInvoiceToModel(
      { ...taxInvoice, cgst_amount: 0, sgst_amount: 0, total: 972165.42 }, taxLines, settings, refs,
    )
    expect(igst.totals?.map(t => t.label)).toContain('IGST')
  })
})
