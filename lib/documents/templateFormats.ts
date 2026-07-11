// Formats shown as tabs under the Templates hub. 'cheque' has a working editor
// (per-bank calibration); the rest are placeholders until the per-company
// editable designer is built.
export interface TemplateFormat { slug: string; label: string; ready?: boolean }

export const TEMPLATE_FORMATS: TemplateFormat[] = [
  { slug: 'cheque',           label: 'Cheque', ready: true },
  { slug: 'tax_invoice',      label: 'Tax Invoice' },
  { slug: 'quotation',        label: 'Quotation' },
  { slug: 'proforma_gst',     label: 'Proforma' },
  { slug: 'sales_order',      label: 'Sales Order' },
  { slug: 'delivery_challan', label: 'Delivery Challan' },
  { slug: 'credit_note',      label: 'Credit Note' },
  { slug: 'purchase_order',   label: 'Purchase Order' },
  { slug: 'debit_note',       label: 'Debit Note' },
  { slug: 'salary_slip',      label: 'Salary Slip' },
]

export function templateFormat(slug: string): TemplateFormat | undefined {
  return TEMPLATE_FORMATS.find(f => f.slug === slug)
}
