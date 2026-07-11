// Everything under the Templates hub. Rendered as tile cards on /templates.
// 'ready' entries have their own dedicated editor; the rest use the layout designer.
export interface TemplateFormat {
  slug: string
  label: string
  desc: string
  group: 'Branding' | 'Sales' | 'Purchases' | 'People'
  ready?: boolean
}

export const TEMPLATE_FORMATS: TemplateFormat[] = [
  // Branding — applies across every document
  { slug: 'accent',      label: 'Accent Colour', desc: 'One colour per company, used on every document.', group: 'Branding', ready: true },
  { slug: 'signatories', label: 'Signatories',   desc: 'Partners & proprietors, signature images and print size.', group: 'Branding', ready: true },
  { slug: 'assets',      label: 'Image Assets',  desc: 'Reusable letterheads, watermarks and stamps.', group: 'Branding', ready: true },
  { slug: 'cheque',      label: 'Cheque',        desc: 'Per-bank cheque calibration for exact-size printing.', group: 'Branding', ready: true },
  { slug: 'terms',       label: 'Terms & Conditions', desc: 'The wording printed at the foot of each document type.', group: 'Branding', ready: true },

  // Sales documents
  { slug: 'tax_invoice',      label: 'Tax Invoice',           desc: 'The GST invoice you bill customers with.', group: 'Sales' },
  { slug: 'reimbursable',     label: 'Courier / Reimbursable', desc: 'Monthly courier & reimbursement invoice.', group: 'Sales' },
  { slug: 'quotation',        label: 'Quotation',             desc: 'Priced quote sent before an order.', group: 'Sales' },
  { slug: 'proforma_gst',     label: 'Proforma',              desc: 'Proforma invoice — not a tax invoice.', group: 'Sales' },
  { slug: 'sales_order',      label: 'Sales Order',           desc: 'Confirmed customer order.', group: 'Sales' },
  { slug: 'delivery_challan', label: 'Delivery Challan',      desc: 'Goods dispatch note (customer & supplier).', group: 'Sales' },
  { slug: 'credit_note',      label: 'Credit Note',           desc: 'Reduces a previously issued invoice.', group: 'Sales' },

  // Purchase documents
  { slug: 'purchase_order', label: 'Purchase Order', desc: 'What you order from a supplier.', group: 'Purchases' },
  { slug: 'debit_note',     label: 'Debit Note',     desc: 'Reduces what you owe a supplier.', group: 'Purchases' },

  // People
  { slug: 'salary_slip', label: 'Salary Slip',         desc: 'Monthly payslip for each employee.', group: 'People' },
  { slug: 'contract',    label: 'Employment Contract', desc: 'Contract templates per designation.', group: 'People', ready: true },
]

export const TEMPLATE_GROUPS: TemplateFormat['group'][] = ['Branding', 'Sales', 'Purchases', 'People']

export function templateFormat(slug: string): TemplateFormat | undefined {
  return TEMPLATE_FORMATS.find(f => f.slug === slug)
}
