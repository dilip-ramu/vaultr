// Document chain logic. A document can be CONVERTED into a downstream document
// or a tax invoice, and credit/debit notes ADJUST an invoice. All additive —
// courier / reimbursable / supplier bundling are untouched.

export type LinkKind = 'document' | 'recoverable_invoice' | 'supplier_invoice'

export interface ConvertTarget {
  type: string                 // target doc_type, or 'tax_invoice' / 'supplier_bill'
  label: string
  kind: 'document' | 'invoice' | 'bill' // document | tax invoice | supplier bill
}

/** What each document type can be converted into. Start anywhere; every path
 *  leads toward a tax invoice (payment) or a note. */
export const CONVERT_MAP: Record<string, ConvertTarget[]> = {
  quotation: [
    { type: 'sales_order', label: 'Sales Order', kind: 'document' },
    { type: 'proforma_gst', label: 'Proforma Invoice', kind: 'document' },
    { type: 'tax_invoice', label: 'Tax Invoice', kind: 'invoice' },
  ],
  sales_order: [
    { type: 'proforma_gst', label: 'Proforma Invoice', kind: 'document' },
    { type: 'delivery_challan', label: 'Delivery Challan', kind: 'document' },
    { type: 'tax_invoice', label: 'Tax Invoice', kind: 'invoice' },
  ],
  proforma_gst: [
    { type: 'delivery_challan', label: 'Delivery Challan', kind: 'document' },
    { type: 'tax_invoice', label: 'Tax Invoice', kind: 'invoice' },
  ],
  delivery_challan: [
    { type: 'tax_invoice', label: 'Tax Invoice', kind: 'invoice' },
  ],
  // Buy side: a PO becomes a supplier bill (draft) you then reconcile.
  purchase_order: [
    { type: 'supplier_bill', label: 'Supplier Bill', kind: 'bill' },
  ],
}

export function convertTargets(docType: string): ConvertTarget[] {
  return CONVERT_MAP[docType] ?? []
}

/** Human status label + tone for a document's lifecycle status. */
export function statusMeta(status: string): { label: string; tone: 'grey' | 'amber' | 'green' | 'blue' } {
  switch (status) {
    case 'converted': return { label: 'Converted', tone: 'green' }
    case 'closed':    return { label: 'Closed', tone: 'green' }
    case 'sent':      return { label: 'Sent', tone: 'blue' }
    case 'accepted':  return { label: 'Accepted', tone: 'blue' }
    case 'cancelled': return { label: 'Cancelled', tone: 'grey' }
    default:          return { label: 'Open', tone: 'amber' }
  }
}
