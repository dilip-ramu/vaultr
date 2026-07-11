import { describe, it, expect } from 'vitest'
import {
  buildGstr1, buildGstr3b, buildHsnSummary, buildDocSummary, sectionFor, isInterState,
  toFilingPeriod, gstr1Csv, B2CL_THRESHOLD,
  type GstCompany, type OutwardSupply, type InwardSupply,
} from '@/lib/gst/returns'
import { printPath } from '@/lib/gst/returns'
import { stateCodeFromGstin, isValidGstin, stateCodeFromName } from '@/lib/gst/states'

// Tamil Nadu (33). Every fixture below is measured against this.
const company: GstCompany = { id: 'c1', name: 'Lullabee', gstin: '33AAMFL2572J1Z4', stateCode: '33' }

const TN_GSTIN = '33AANFA7615E1ZN'   // same state  → CGST + SGST
const KA_GSTIN = '29AABCU9603R1ZM'   // Karnataka   → IGST

const MONTH = '2026-07'

function invoice(over: Partial<OutwardSupply> = {}): OutwardSupply {
  const taxable = over.taxable ?? 1000
  const cgst = over.cgst ?? 90, sgst = over.sgst ?? 90, igst = over.igst ?? 0
  return {
    id: 'i1', kind: 'invoice', source: 'tax_invoice', number: 'L-2600001', date: `${MONTH}-11`,
    partyName: 'Amaravathi', partyGstin: TN_GSTIN,
    taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst,
    lines: [{ hsn: '996812', description: 'Courier', qty: 1, taxable, rate: 18, cgst, sgst, igst }],
    ...over,
  }
}

function bill(over: Partial<InwardSupply> = {}): InwardSupply {
  return {
    id: 'b1', supplierName: 'DHL', supplierGstin: TN_GSTIN, number: 'DHL-1', date: `${MONTH}-05`,
    taxable: 1000, cgst: 90, sgst: 90, igst: 0, itcEligible: true, reverseCharge: false,
    ...over,
  }
}

describe('GSTIN parsing', () => {
  it('reads the state out of a GSTIN — the first two digits ARE the state', () => {
    expect(stateCodeFromGstin(TN_GSTIN)).toBe('33')
    expect(stateCodeFromGstin(KA_GSTIN)).toBe('29')
  })

  it('rejects junk rather than silently treating it as registered', () => {
    expect(isValidGstin('33AANFA7615E1ZN')).toBe(true)
    expect(isValidGstin('NOTAGSTIN')).toBe(false)
    expect(isValidGstin('')).toBe(false)
    expect(isValidGstin(null)).toBe(false)
    expect(stateCodeFromGstin('99XXXXX0000X1Z1')).toBeNull()   // 99 is not a state
  })

  it('falls back to the address when there is no GSTIN', () => {
    expect(stateCodeFromName('Tamil Nadu')).toBe('33')
    expect(stateCodeFromName('tamilnadu')).toBe('33')
    expect(stateCodeFromName('Nowhere')).toBeNull()
  })
})

describe('intra vs inter-state', () => {
  it('trusts the tax actually charged over the addresses', () => {
    // Recorded as IGST → it WAS an inter-state supply, whatever the GSTIN says.
    expect(isInterState(invoice({ cgst: 0, sgst: 0, igst: 180 }), company)).toBe(true)
    expect(isInterState(invoice({ cgst: 90, sgst: 90, igst: 0 }), company)).toBe(false)
  })

  it('falls back to comparing states when no tax was charged', () => {
    const nil = { taxable: 1000, cgst: 0, sgst: 0, igst: 0, total: 1000 }
    expect(isInterState(invoice({ ...nil, partyGstin: KA_GSTIN }), company)).toBe(true)
    expect(isInterState(invoice({ ...nil, partyGstin: TN_GSTIN }), company)).toBe(false)
  })
})

describe('GSTR-1 classification', () => {
  it('files a registered buyer under B2B', () => {
    expect(sectionFor(invoice({ partyGstin: TN_GSTIN }), company)).toBe('b2b')
  })

  it('files a small unregistered supply under B2CS', () => {
    expect(sectionFor(invoice({ partyGstin: null }), company)).toBe('b2cs')
  })

  it('files a large inter-state unregistered supply under B2CL', () => {
    const big = invoice({
      partyGstin: null, partyState: 'Karnataka',
      taxable: 300000, cgst: 0, sgst: 0, igst: 54000, total: 354000,
    })
    expect(big.total).toBeGreaterThan(B2CL_THRESHOLD)
    expect(sectionFor(big, company)).toBe('b2cl')
  })

  it('keeps a large INTRA-state unregistered supply in B2CS — the threshold is inter-state only', () => {
    const big = invoice({
      partyGstin: null, partyState: 'Tamil Nadu',
      taxable: 300000, cgst: 27000, sgst: 27000, igst: 0, total: 354000,
    })
    expect(sectionFor(big, company)).toBe('b2cs')
  })

  it('files notes separately by whether the buyer is registered', () => {
    expect(sectionFor(invoice({ kind: 'credit_note', partyGstin: TN_GSTIN }), company)).toBe('cdnr')
    expect(sectionFor(invoice({ kind: 'credit_note', partyGstin: null }), company)).toBe('cdnur')
    expect(sectionFor(invoice({ kind: 'debit_note', partyGstin: TN_GSTIN }), company)).toBe('cdnr')
  })

  it('treats a malformed GSTIN as unregistered, and says so', () => {
    const r = buildGstr1([invoice({ partyGstin: 'RUBBISH' })], company, MONTH)
    expect(r.rows[0].section).toBe('b2cs')
    expect(r.rows[0].gstin).toBeNull()
    expect(r.warnings.join(' ')).toContain('not a valid GSTIN')
  })
})

describe('GSTR-1 totals', () => {
  it('only includes documents dated in the period', () => {
    const r = buildGstr1(
      [invoice({ id: 'a', number: 'A', date: '2026-07-31' }), invoice({ id: 'b', number: 'B', date: '2026-08-01' })],
      company, MONTH,
    )
    expect(r.rows.map(x => x.number)).toEqual(['A'])
  })

  it('subtracts a credit note from the liability and adds a debit note', () => {
    const r = buildGstr1([
      invoice({ id: 'a', number: 'A' }),                                        // +1000 taxable, +180 tax
      invoice({ id: 'b', number: 'B', kind: 'credit_note', againstNumber: 'A' }), // −1000, −180
      invoice({ id: 'c', number: 'C', kind: 'debit_note', againstNumber: 'A' }),  // +1000, +180
    ], company, MONTH)
    expect(r.totals.taxable).toBe(1000)
    expect(r.totals.cgst + r.totals.sgst).toBe(180)
  })

  it('flags a note that is not linked to the invoice it adjusts', () => {
    const r = buildGstr1([invoice({ kind: 'credit_note', againstNumber: null })], company, MONTH)
    expect(r.warnings.join(' ')).toContain('not linked to an original invoice')
  })

  it('formats the period the way the portal wants', () => {
    expect(toFilingPeriod('2026-07')).toBe('072026')
  })
})

describe('HSN summary', () => {
  it('rolls up by HSN and rate, netting credit notes off', () => {
    const rows = buildHsnSummary([
      invoice({ id: 'a' }),
      invoice({ id: 'b' }),
      invoice({ id: 'c', kind: 'credit_note' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].hsn).toBe('996812')
    expect(rows[0].taxable).toBe(1000)      // 1000 + 1000 − 1000
    expect(rows[0].cgst).toBe(90)
  })

  it('separates the same HSN at different rates', () => {
    const five = invoice({
      id: 'x',
      lines: [{ hsn: '996812', qty: 1, taxable: 1000, rate: 5, cgst: 25, sgst: 25, igst: 0 }],
    })
    expect(buildHsnSummary([invoice(), five])).toHaveLength(2)
  })

  it('never drops a supply that has no line detail', () => {
    const rows = buildHsnSummary([invoice({ lines: [] })])
    expect(rows).toHaveLength(1)
    expect(rows[0].hsn).toBe('UNSPECIFIED')
    expect(rows[0].taxable).toBe(1000)
    expect(rows[0].rate).toBe(18)           // inferred from the tax charged
  })
})

describe('documents issued (table 13)', () => {
  it('reports the serial range and count per document type', () => {
    const docs = buildDocSummary([
      invoice({ id: 'a', number: 'L-2600001' }),
      invoice({ id: 'b', number: 'L-2600003' }),
      invoice({ id: 'c', number: 'L-CN260001', kind: 'credit_note' }),
    ])
    const inv = docs.find(d => d.nature.startsWith('Invoices'))!
    expect(inv.from).toBe('L-2600001')
    expect(inv.to).toBe('L-2600003')
    expect(inv.count).toBe(2)
    expect(inv.cancelled).toBe(0)   // numbers are never reused, so never cancelled
    expect(docs.find(d => d.nature === 'Credit notes')!.count).toBe(1)
  })
})

describe('GSTR-3B', () => {
  it('reconciles: 3.1(a) equals the GSTR-1 totals for the same month', () => {
    const supplies = [
      invoice({ id: 'a', number: 'A' }),
      invoice({ id: 'b', number: 'B', kind: 'credit_note', againstNumber: 'A' }),
      invoice({ id: 'c', number: 'C', partyGstin: KA_GSTIN, cgst: 0, sgst: 0, igst: 180, total: 1180 }),
    ]
    const one = buildGstr1(supplies, company, MONTH)
    const b = buildGstr3b(supplies, [], company, MONTH)
    expect(b.outward.taxable).toBe(one.totals.taxable)
    expect(b.outward.cgst).toBe(one.totals.cgst)
    expect(b.outward.sgst).toBe(one.totals.sgst)
    expect(b.outward.igst).toBe(one.totals.igst)
  })

  it('claims credit only on eligible bills', () => {
    const b = buildGstr3b([], [
      bill({ id: '1' }),
      bill({ id: '2', itcEligible: false }),
    ], company, MONTH)
    expect(b.itc.cgst).toBe(90)
    expect(b.itc.sgst).toBe(90)
  })

  it('claims nothing on a bill with no GST breakup, and warns', () => {
    const b = buildGstr3b([], [bill({ taxable: 0, cgst: 0, sgst: 0, igst: 0 })], company, MONTH)
    expect(b.itc.cgst).toBe(0)
    expect(b.warnings.join(' ')).toContain('no GST breakup')
  })

  it('nets output tax against credit, per head', () => {
    const b = buildGstr3b([invoice()], [bill({ cgst: 40, sgst: 40 })], company, MONTH)
    expect(b.net.cgst).toBe(50)      // 90 charged − 40 claimed
    expect(b.net.sgst).toBe(50)
    expect(b.net.total).toBe(100)
  })

  it('reports a credit carried forward when input exceeds output', () => {
    const b = buildGstr3b([invoice()], [bill({ cgst: 200, sgst: 200 })], company, MONTH)
    expect(b.net.total).toBeLessThan(0)
  })

  it('reports reverse-charge inward supplies separately', () => {
    const b = buildGstr3b([], [bill({ reverseCharge: true })], company, MONTH)
    expect(b.reverseCharge.taxable).toBe(1000)
  })

  it('refuses to pretend a company without a GSTIN can file', () => {
    const b = buildGstr3b([], [], { ...company, gstin: null }, MONTH)
    expect(b.warnings.join(' ')).toContain('no GSTIN')
  })
})

describe('exports', () => {
  const r = buildGstr1([
    invoice({ id: 'a', number: 'A' }),
    invoice({ id: 'b', number: 'B', kind: 'credit_note', againstNumber: 'A', againstDate: `${MONTH}-11` }),
  ], company, MONTH)

  it('writes a CSV with one row per document and a header', () => {
    const lines = gstr1Csv(r).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Section')
    expect(lines[1]).toContain('B2B')
  })

  it('escapes commas in party names rather than breaking the CSV', () => {
    const csv = gstr1Csv(buildGstr1([invoice({ partyName: 'Acme, Inc' })], company, MONTH))
    expect(csv).toContain('"Acme, Inc"')
    expect(csv.split('\n')).toHaveLength(2)
  })
})

describe('print routes', () => {
  it('points each document at the route that renders its PDF', () => {
    expect(printPath({ source: 'tax_invoice', id: 'x' })).toBe('/recoverables/invoices/x/print')
    expect(printPath({ source: 'reimbursable', id: 'x' })).toBe('/reimbursables/invoices/x/print')
    expect(printPath({ source: 'document', id: 'x' })).toBe('/documents/x/print')
  })

  it('carries the id and source through onto every return row, so nothing is unreachable', () => {
    const r = buildGstr1([
      invoice({ id: 'a', number: 'A' }),
      invoice({ id: 'b', number: 'B', kind: 'credit_note', source: 'document', againstNumber: 'A' }),
    ], company, MONTH)
    expect(r.rows.map(x => x.id)).toEqual(['a', 'b'])
    expect(r.rows.map(x => x.source)).toEqual(['tax_invoice', 'document'])
  })
})
