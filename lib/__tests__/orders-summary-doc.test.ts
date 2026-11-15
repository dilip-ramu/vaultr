// The one-page summary a supplier opens first.

import { describe, it, expect } from 'vitest'
import { orderSummaryDocModel, type SummaryInput } from '@/lib/orders/summaryDoc'

const base = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  orderNumber: 'ORD-26-0001',
  orderDate: '18 Aug 2026',
  accent: '#1F5C3A',
  companyName: 'Pengvin Clothing',
  lines: [{
    item: 'Polo navy melange',
    description: '180 GSM single jersey, bio-washed',
    qty: 0,
    costRate: 310,
    sizes: [{ label: 'S', qty: 200 }, { label: 'M', qty: 400 }, { label: 'L', qty: 400 }, { label: 'XL', qty: 200 }],
  }],
  ...over,
})

describe('building the summary', () => {
  it('takes the quantity from the sizes, not from the line', () => {
    const m = orderSummaryDocModel(base())
    expect(m.rows[0].cells.qty).toBe('1,200')
    expect(m.grandValue).toBe('₹3,72,000')
  })

  it('uses the typed quantity when a line has no sizes', () => {
    const m = orderSummaryDocModel(base({ lines: [{ item: 'Rib', qty: 85, costRate: 420 }] }))
    expect(m.rows[0].cells.qty).toBe('85')
    expect(m.rows[0].cells.sizes).toBe('—')
  })

  it('puts the spec under the style name so it is not squeezed into a column', () => {
    expect(orderSummaryDocModel(base()).rows[0].cells.desc)
      .toBe('Polo navy melange\n180 GSM single jersey, bio-washed')
  })

  it('leaves the style name alone when there is no spec', () => {
    const m = orderSummaryDocModel(base({ lines: [{ item: 'Rib', qty: 10, costRate: 1, description: '   ' }] }))
    expect(m.rows[0].cells.desc).toBe('Rib')
  })

  it('adds a total row only when there is more than one line to total', () => {
    expect(orderSummaryDocModel(base()).rows).toHaveLength(1)
    const two = orderSummaryDocModel(base({ lines: [
      { item: 'A', qty: 10, costRate: 100 },
      { item: 'B', qty: 5, costRate: 200 },
    ] }))
    expect(two.rows).toHaveLength(3)
    expect(two.rows[2]).toMatchObject({ strong: true, cells: { qty: '15', value: '2,000' } })
    expect(two.grandValue).toBe('₹2,000')
  })

  it('shows the PO number, cut-off date and ETD when they exist', () => {
    const m = orderSummaryDocModel(base({ poNumber: 'PNGN-PO260002', cutoffDate: '25 Aug 2026', etd: '08 Sep 2026' }))
    expect(m.meta?.map(x => x.label)).toEqual(['Date', 'Purchase order', 'Cut-off date', 'ETD'])
  })

  it('leaves out what has not been set rather than printing an empty label', () => {
    expect(orderSummaryDocModel(base()).meta?.map(x => x.label)).toEqual(['Date'])
  })

  it('says plainly that it is not a tax invoice', () => {
    expect(orderSummaryDocModel(base()).subNote).toContain('Not a tax invoice')
  })

  it('names the supplier when there is one, and has no party box when there is not', () => {
    expect(orderSummaryDocModel(base({ supplierName: 'Bharathi Fab Tex' })).parties[0])
      .toMatchObject({ label: 'SUPPLIER', name: 'Bharathi Fab Tex' })
    expect(orderSummaryDocModel(base()).parties).toEqual([])
  })

  it('survives an order with no lines at all', () => {
    const m = orderSummaryDocModel(base({ lines: [] }))
    expect(m.rows).toEqual([])
    expect(m.grandValue).toBe('₹0')
  })
})

describe('the packing on the summary sheet', () => {
  const row = (label: string, boxes: string, contents: string, style = '') =>
    ({ label, boxes, lines: [{ contents, style }], note: '4 pcs/box · 80 pcs' })

  it('carries the packing rows through as a table of their own', () => {
    const m = orderSummaryDocModel(base({
      packing: [row('Box 1', '20 boxes', 'S-1, M-2, L-2, XL-1')],
      cartons: 20,
    }))
    expect(m.packing).toHaveLength(1)
    expect(m.packing?.[0].lines[0].contents).toBe('S-1, M-2, L-2, XL-1')
  })

  it('says the box total under it', () => {
    const m = orderSummaryDocModel(base({ packing: [row('Box 1', '1 box', 'S-1')], cartons: 1 }))
    expect(m.packingNote).toBe('Total 1 box.')
  })

  it('states the over-shipment only when one was agreed', () => {
    const agreed = orderSummaryDocModel(base({ packing: [row('Box 1', '20 boxes', 'S-1')], cartons: 20, tolerancePct: 5 }))
    expect(agreed.packingNote).toBe('Total 20 boxes. Over-shipment allowed: 5% as agreed.')

    // Printing "0% allowed" invites an argument about whether that was
    // the agreement.
    const none = orderSummaryDocModel(base({ packing: [row('Box 1', '20 boxes', 'S-1')], cartons: 20, tolerancePct: 0 }))
    expect(none.packingNote).toBe('Total 20 boxes.')
  })

  it('shows the box total beside the piece total', () => {
    const m = orderSummaryDocModel(base({ packing: [row('Box 1', '1 box', 'S-1')], cartons: 1 }))
    expect(m.totals?.map(t => t.label)).toEqual(['Total pieces', 'Total cartons'])
  })

  it('says nothing about packing when none has been set', () => {
    const m = orderSummaryDocModel(base())
    expect(m.packing).toBeUndefined()
    expect(m.packingNote).toBeUndefined()
    expect(m.totals?.map(t => t.label)).toEqual(['Total pieces'])
  })
})
