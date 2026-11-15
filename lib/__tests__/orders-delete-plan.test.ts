// Deleting an order takes its paperwork and leaves the money. And it refuses
// outright once money has moved.

import { describe, it, expect } from 'vitest'
import { planOrderDelete, deleteSummary, type DeletePlanInput } from '@/lib/orders/deletePlan'

const empty: DeletePlanInput = { documents: [], invoices: [], bills: [], transactions: [] }
const plan = (over: Partial<DeletePlanInput> = {}) => planOrderDelete({ ...empty, ...over })

const docs = [
  { id: 'd1', doc_type: 'sales_order', number: 'PNGN-SO260011' },
  { id: 'd2', doc_type: 'purchase_order', number: 'PNGN-PO260002' },
]

describe('what goes with the order', () => {
  it('takes the paperwork it raised', () => {
    const p = plan({ documents: docs })
    expect(p.documents.map(d => d.label)).toEqual(['Sales Order PNGN-SO260011', 'Purchase Order PNGN-PO260002'])
    expect(p.canDelete).toBe(true)
  })

  it('names a document type it does not recognise rather than failing', () => {
    expect(plan({ documents: [{ id: 'x', doc_type: 'odd_thing', number: 'X1' }] }).documents[0].label)
      .toBe('odd thing X1')
  })

  it('counts the files on the order', () => {
    expect(plan({ fileCount: 3 }).fileCount).toBe(3)
  })

  it('is happy to delete an order with nothing attached', () => {
    expect(plan()).toMatchObject({ canDelete: true, documents: [], kept: [] })
  })
})

describe('what stays behind', () => {
  it('keeps invoices, bills and bank entries, and says so', () => {
    const p = plan({
      invoices: [{ id: 'i1', invoice_number: 'INV-1' }],
      bills: [{ id: 'b1', invoice_number: 'BILL-1' }, { id: 'b2' }],
      transactions: [],
    })
    expect(p.kept).toEqual([
      { label: 'customer invoice', count: 1 },
      { label: 'supplier bill', count: 2 },
    ])
  })

  it('lets an unpaid invoice and an unpaid bill through', () => {
    const p = plan({
      invoices: [{ id: 'i1', invoice_number: 'INV-1', paid_amount: 0, status: 'sent' }],
      bills: [{ id: 'b1', is_paid: false }],
    })
    expect(p.canDelete).toBe(true)
  })
})

describe('when it refuses', () => {
  it('stops for an invoice with payment against it', () => {
    const p = plan({ invoices: [{ id: 'i1', invoice_number: 'INV-1', paid_amount: 25000 }] })
    expect(p.canDelete).toBe(false)
    expect(p.blockers).toEqual([{ label: 'Invoice INV-1', reason: 'has payment against it' }])
  })

  it('stops for an invoice merely marked paid, even with no amount recorded', () => {
    const p = plan({ invoices: [{ id: 'i1', invoice_number: 'INV-1', status: 'paid' }] })
    expect(p.canDelete).toBe(false)
    expect(p.blockers[0].reason).toBe('is marked paid')
  })

  it('stops for a part-paid invoice', () => {
    expect(plan({ invoices: [{ id: 'i1', status: 'partial' }] }).canDelete).toBe(false)
  })

  it('stops for a supplier bill marked paid', () => {
    const p = plan({ bills: [{ id: 'b1', invoice_number: 'BILL-9', is_paid: true }] })
    expect(p.blockers).toEqual([{ label: 'Supplier bill BILL-9', reason: 'is marked paid' }])
  })

  it('stops for any bank entry at all — a transaction IS the money', () => {
    const p = plan({ transactions: [{ id: 't1', amount: 500 }] })
    expect(p.canDelete).toBe(false)
    expect(p.blockers[0]).toEqual({ label: '1 bank entry', reason: 'filed against this order' })
  })

  it('counts several bank entries in one blocker rather than listing them all', () => {
    const p = plan({ transactions: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] })
    expect(p.blockers[0].label).toBe('3 bank entries')
  })

  it('names everything in the way, not just the first thing', () => {
    const p = plan({
      invoices: [{ id: 'i1', invoice_number: 'INV-1', paid_amount: 1 }],
      bills: [{ id: 'b1', invoice_number: 'B-1', is_paid: true }],
      transactions: [{ id: 't1' }],
    })
    expect(p.blockers).toHaveLength(3)
  })

  it('does not stop for a document that has merely been sent', () => {
    // Deleting the paperwork is the point. A purchase order emailed to a
    // supplier is exactly what you want gone when the order falls through.
    expect(plan({ documents: docs }).canDelete).toBe(true)
  })
})

describe('the line on the confirmation', () => {
  it('says what goes', () => {
    expect(deleteSummary(plan({ documents: docs, fileCount: 2 })))
      .toBe('Deletes this order, 2 documents and 2 files.')
  })

  it('reads properly with one of each', () => {
    expect(deleteSummary(plan({ documents: [docs[0]], fileCount: 1 })))
      .toBe('Deletes this order, 1 document and 1 file.')
  })

  it('reads properly with nothing attached', () => {
    expect(deleteSummary(plan())).toBe('Deletes this order.')
  })
})
