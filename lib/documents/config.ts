// Config for the issued-document types (credit note, proforma, PO, challan).
// Each maps to a template doc_type and a party side (customer or supplier).

export type DocSide = 'customer' | 'supplier'

export interface DocConfig {
  id: string                 // document type id (credit_note, debit_note, …)
  label: string
  side: DocSide
  code: string               // type code in the number, e.g. PO, CN, DN, PI, DC, SO
  tax: boolean               // show/collect GST
  partyLabel: string         // what to call the counterparty
  referenceLabel?: string    // optional reference field label
}

export const DOC_CONFIGS: DocConfig[] = [
  { id: 'quotation',        label: 'Quotation',        side: 'customer', code: 'QT',  tax: true,  partyLabel: 'Customer', referenceLabel: 'Enquiry ref' },
  { id: 'proforma_gst',     label: 'Proforma Invoice', side: 'customer', code: 'PI',  tax: true,  partyLabel: 'Customer', referenceLabel: 'Reference' },
  { id: 'credit_note',      label: 'Credit Note',      side: 'customer', code: 'CN',  tax: true,  partyLabel: 'Customer', referenceLabel: 'Against invoice no.' },
  { id: 'sales_order',      label: 'Sales Order',      side: 'customer', code: 'SO',  tax: true,  partyLabel: 'Customer', referenceLabel: 'Buyer PO ref' },
  { id: 'delivery_challan', label: 'Delivery Challan', side: 'customer', code: 'DC',  tax: false, partyLabel: 'Consignee', referenceLabel: 'Reason for transport' },
  { id: 'purchase_order',   label: 'Purchase Order',   side: 'supplier', code: 'PO',  tax: true,  partyLabel: 'Vendor', referenceLabel: 'Reference' },
  { id: 'debit_note',       label: 'Debit Note',       side: 'supplier', code: 'DN',  tax: true,  partyLabel: 'Supplier', referenceLabel: 'Against invoice no.' },
  // Supplier-side delivery challan — same doc_type as the customer one but a
  // distinct party side + number series (SDC), kept separate via party_kind.
  { id: 'delivery_challan', label: 'Delivery Challan', side: 'supplier', code: 'SDC', tax: false, partyLabel: 'Supplier', referenceLabel: 'Reason for transport' },
]

/** The head of a document number: {PREFIX}-{CODE}{YY} (plus the 2-digit year). */
export function docNumberHead(companyPrefix: string, code: string): { head: string; yy: string } {
  const p = (companyPrefix || '').trim().replace(/[-\s]+$/, '').toUpperCase() || 'DOC'
  const yy = String(new Date().getFullYear()).slice(-2)
  return { head: `${p}-${code}${yy}`, yy }
}

/** Build a document number: {PREFIX}-{CODE}{YY}{NNNN}, e.g. C-PO260001.
 *  `existingNumbers` are the numbers already used for this company + doc side,
 *  so the running number is per-company and resets each calendar year. */
export function buildDocNumber(companyPrefix: string, code: string, existingNumbers: string[]): string {
  const p = (companyPrefix || '').trim().replace(/[-\s]+$/,'').toUpperCase() || 'DOC'
  const yy = String(new Date().getFullYear()).slice(-2)
  const head = `${p}-${code}${yy}`
  const used = existingNumbers
    .filter(n => typeof n === 'string' && n.startsWith(head))
    .map(n => parseInt(n.slice(head.length), 10))
    .filter(n => Number.isFinite(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${head}${String(next).padStart(4, '0')}`
}

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
