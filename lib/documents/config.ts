// Config for the issued-document types (credit note, proforma, PO, challan).
// Each maps to a template doc_type and a party side (customer or supplier).

export type DocSide = 'customer' | 'supplier'

export interface DocConfig {
  id: string                 // matches DocType in lib/templates/schema
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
]

export function docConfig(id: string): DocConfig | undefined {
  return DOC_CONFIGS.find(d => d.id === id)
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
