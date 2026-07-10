// Config for the issued-document types (credit note, proforma, PO, challan).
// Each maps to a template doc_type and a party side (customer or supplier).

export type DocSide = 'customer' | 'supplier'

export interface DocConfig {
  id: string                 // document type id (credit_note, debit_note, …)
  label: string
  side: DocSide
  prefix: string             // number prefix
  tax: boolean               // show/collect GST
  partyLabel: string         // what to call the counterparty
  referenceLabel?: string    // optional reference field label
}

export const DOC_CONFIGS: DocConfig[] = [
  { id: 'proforma_gst',     label: 'Proforma Invoice', side: 'customer', prefix: 'PF-', tax: true,  partyLabel: 'Customer', referenceLabel: 'Reference' },
  { id: 'credit_note',      label: 'Credit Note',      side: 'customer', prefix: 'CN-', tax: true,  partyLabel: 'Customer', referenceLabel: 'Against invoice no.' },
  { id: 'delivery_challan', label: 'Delivery Challan', side: 'customer', prefix: 'DC-', tax: false, partyLabel: 'Consignee', referenceLabel: 'Reason for transport' },
  { id: 'purchase_order',   label: 'Purchase Order',   side: 'supplier', prefix: 'PO-', tax: true,  partyLabel: 'Vendor', referenceLabel: 'Reference' },
  { id: 'debit_note',       label: 'Debit Note',       side: 'supplier', prefix: 'DN-', tax: true,  partyLabel: 'Supplier', referenceLabel: 'Against invoice no.' },
  // Supplier-side delivery challan — same doc_type as the customer one but a
  // distinct party side + number series, kept separate via party_kind.
  { id: 'delivery_challan', label: 'Delivery Challan', side: 'supplier', prefix: 'SDC-', tax: false, partyLabel: 'Supplier', referenceLabel: 'Reason for transport' },
]

/** First config with this id (side-agnostic). Prefer docConfigFor when the side
 *  is known (delivery_challan exists on both sides). */
export function docConfig(id: string): DocConfig | undefined {
  return DOC_CONFIGS.find(d => d.id === id)
}
/** Side-aware config lookup — required for delivery_challan which is shared. */
export function docConfigFor(id: string, side: DocSide): DocConfig | undefined {
  return DOC_CONFIGS.find(d => d.id === id && d.side === side) ?? docConfig(id)
}
export function configsForSide(side: DocSide): DocConfig[] {
  return DOC_CONFIGS.filter(d => d.side === side)
}

export interface DocumentRow {
  id: string
  doc_type: string
  company_id: string | null
  party_kind: string
  party_id: string | null
  party_name: string
  party_gstin: string | null
  number: string
  date: string
  reference: string | null
  subtotal: number
  cgst_amount: number
  sgst_amount: number
  total: number
  created_at: string
}
