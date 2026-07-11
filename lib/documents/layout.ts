// Coordinate-based, per-company, per-format template engine. A layout is a set
// of positioned elements on an A4 canvas (794 × 1123 px @ ~96dpi). The same
// engine powers the WYSIWYG editor and the PDF renderer. Fully additive: when a
// company has no saved layout for a format, the app falls back to the built-in
// DocDesign, so nothing changes until a template is explicitly designed.

export const PAGE_W = 794
export const PAGE_H = 1123

export type ElType =
  | 'text'       // static text box
  | 'field'      // dynamic value bound to a data key
  | 'logo'       // document logo image
  | 'signature'  // signatory image
  | 'lineItems'  // the data-bound line-item table
  | 'totals'     // totals block (subtotal / tax / grand)
  | 'bank'       // bank details block
  | 'terms'      // terms & conditions
  | 'divider'    // horizontal rule
  | 'accentBar'  // the coloured top strip

export interface LayoutEl {
  id: string
  type: ElType
  x: number; y: number; w: number; h: number
  fontSize?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  color?: string          // 'accent' | hex
  text?: string           // static text ('text') — supports {{field}} tokens
  field?: string          // data key ('field')
  label?: string          // optional label shown before a field value
  columns?: { key: string; label: string; align?: 'left' | 'right' | 'center'; flex?: number }[]
}

export interface DocLayout {
  version: 1
  elements: LayoutEl[]
}

// ── Field catalog (what "Add field" offers) ─────────────────────────────────
export interface FieldDef { key: string; label: string }

const COMMON_FIELDS: FieldDef[] = [
  { key: 'doc.title', label: 'Document title' },
  { key: 'doc.number', label: 'Document number' },
  { key: 'doc.date', label: 'Date' },
  { key: 'doc.reference', label: 'Reference' },
  { key: 'company.name', label: 'Company name' },
  { key: 'company.address', label: 'Company address' },
  { key: 'company.gstin', label: 'Company GSTIN' },
  { key: 'company.phone', label: 'Company phone' },
  { key: 'company.email', label: 'Company email' },
  { key: 'party.label', label: 'Party label (Bill To / Vendor…)' },
  { key: 'party.name', label: 'Party name' },
  { key: 'party.address', label: 'Party address' },
  { key: 'party.gstin', label: 'Party GSTIN' },
  { key: 'totals.grandLabel', label: 'Grand total label' },
  { key: 'totals.grand', label: 'Grand total value' },
  { key: 'totals.inWords', label: 'Amount in words' },
]

const SLIP_FIELDS: FieldDef[] = [
  { key: 'doc.title', label: 'Title' },
  { key: 'company.name', label: 'Company name' },
  { key: 'company.address', label: 'Company address' },
  { key: 'employee.name', label: 'Employee name' },
  { key: 'employee.id', label: 'Employee ID' },
  { key: 'employee.designation', label: 'Designation' },
  { key: 'employee.pan', label: 'PAN' },
  { key: 'employee.joining', label: 'Joining date' },
  { key: 'employee.bank', label: 'Bank name' },
  { key: 'employee.account', label: 'Account number' },
  { key: 'employee.ifsc', label: 'IFSC' },
  { key: 'slip.month', label: 'Salary month' },
  { key: 'slip.paidOn', label: 'Paid on' },
  { key: 'slip.gross', label: 'Gross earnings' },
  { key: 'slip.deductions', label: 'Total deductions' },
  { key: 'slip.net', label: 'Net pay' },
  { key: 'slip.words', label: 'Net in words' },
  { key: 'slip.sourceSalary', label: 'Source salary (currency)' },
  { key: 'slip.fxRate', label: 'Exchange rate' },
]

const REIMB_EXTRA: FieldDef[] = [
  { key: 'doc.currency', label: 'Billing currency' },
  { key: 'doc.month', label: 'For the month' },
]

export function fieldsForFormat(format: string): FieldDef[] {
  if (format === 'salary_slip') return SLIP_FIELDS
  if (format === 'reimbursable') return [...COMMON_FIELDS, ...REIMB_EXTRA]
  return COMMON_FIELDS
}

// ── Default layout per format (approximates the built-in 31 design) ─────────
let _id = 0
const eid = () => `el_${Date.now().toString(36)}_${_id++}`

const GST_COLUMNS: LayoutEl['columns'] = [
  { key: 'desc', label: 'DESCRIPTION', flex: 2.6 },
  { key: 'hsn', label: 'HSN', align: 'center', flex: 0.7 },
  { key: 'qty', label: 'QTY', align: 'center', flex: 0.6 },
  { key: 'rate', label: 'RATE', align: 'right', flex: 0.9 },
  { key: 'amt', label: 'AMOUNT', align: 'right', flex: 0.9 },
]

/** A sensible starting layout for a format (used when a company has none). */
export function defaultLayout(format: string, title: string): DocLayout {
  if (format === 'salary_slip') {
    return { version: 1, elements: [
      { id: eid(), type: 'accentBar', x: 0, y: 0, w: PAGE_W, h: 8 },
      { id: eid(), type: 'logo', x: 44, y: 40, w: 208, h: 90 },
      { id: eid(), type: 'field', field: 'company.name', x: 44, y: 138, w: 340, h: 22, fontSize: 14, bold: true },
      { id: eid(), type: 'field', field: 'company.address', x: 44, y: 162, w: 340, h: 40, fontSize: 10, color: '#888' },
      { id: eid(), type: 'field', field: 'doc.title', x: 500, y: 44, w: 250, h: 28, fontSize: 20, bold: true, align: 'right', color: 'accent' },
      { id: eid(), type: 'field', field: 'slip.month', x: 500, y: 78, w: 250, h: 18, fontSize: 12, align: 'right', color: '#888' },

      // Employee block
      { id: eid(), type: 'text', text: 'EMPLOYEE', x: 44, y: 222, w: 200, h: 14, fontSize: 8, bold: true, color: '#888' },
      { id: eid(), type: 'field', field: 'employee.name', x: 44, y: 238, w: 320, h: 20, fontSize: 13, bold: true },
      { id: eid(), type: 'field', field: 'employee.designation', x: 44, y: 260, w: 320, h: 16, fontSize: 10, color: '#888' },
      { id: eid(), type: 'field', label: 'ID', field: 'employee.id', x: 44, y: 278, w: 320, h: 16, fontSize: 10, color: '#888' },
      { id: eid(), type: 'field', label: 'PAN', field: 'employee.pan', x: 44, y: 294, w: 320, h: 16, fontSize: 10, color: '#888' },
      { id: eid(), type: 'field', label: 'Joined', field: 'employee.joining', x: 44, y: 310, w: 320, h: 16, fontSize: 10, color: '#888' },

      // Paid-to block
      { id: eid(), type: 'text', text: 'PAID TO', x: 440, y: 222, w: 200, h: 14, fontSize: 8, bold: true, color: '#888' },
      { id: eid(), type: 'field', field: 'employee.bank', x: 440, y: 238, w: 310, h: 16, fontSize: 10.5 },
      { id: eid(), type: 'field', label: 'A/C', field: 'employee.account', x: 440, y: 256, w: 310, h: 16, fontSize: 10.5 },
      { id: eid(), type: 'field', label: 'IFSC', field: 'employee.ifsc', x: 440, y: 274, w: 310, h: 16, fontSize: 10.5 },
      { id: eid(), type: 'field', label: 'Paid on', field: 'slip.paidOn', x: 440, y: 298, w: 310, h: 16, fontSize: 10.5, color: '#666' },

      // Earnings + deductions (gross / total deductions are summary rows)
      { id: eid(), type: 'lineItems', x: 44, y: 355, w: 706, h: 330 },

      { id: eid(), type: 'field', label: 'NET PAY', field: 'slip.net', x: 460, y: 706, w: 290, h: 34, fontSize: 20, bold: true, align: 'right', color: 'accent' },
      { id: eid(), type: 'field', field: 'slip.words', x: 460, y: 742, w: 290, h: 30, fontSize: 10, align: 'right', color: '#888' },

      // Footer — source salary + FX rate (as on the old slip)
      { id: eid(), type: 'field', label: 'Salary', field: 'slip.sourceSalary', x: 44, y: 1000, w: 320, h: 16, fontSize: 9, color: '#888' },
      { id: eid(), type: 'field', label: 'Exchange rate', field: 'slip.fxRate', x: 44, y: 1018, w: 320, h: 16, fontSize: 9, color: '#888' },
      { id: eid(), type: 'signature', x: 560, y: 985, w: 190, h: 95 },
    ] }
  }
  // Invoice-family default (quotation, proforma, SO, DC, CN, PO, DN, tax invoice)
  return { version: 1, elements: [
    { id: eid(), type: 'accentBar', x: 0, y: 0, w: PAGE_W, h: 8 },
    { id: eid(), type: 'logo', x: 44, y: 40, w: 208, h: 90 },
    { id: eid(), type: 'field', field: 'company.name', x: 44, y: 138, w: 340, h: 22, fontSize: 14, bold: true },
    { id: eid(), type: 'field', field: 'company.address', x: 44, y: 162, w: 340, h: 46, fontSize: 10, color: '#888' },
    { id: eid(), type: 'text', text: title, x: 500, y: 44, w: 250, h: 28, fontSize: 20, bold: true, align: 'right', color: 'accent' },
    { id: eid(), type: 'field', field: 'doc.number', x: 500, y: 76, w: 250, h: 18, fontSize: 11, align: 'right', color: '#666' },
    { id: eid(), type: 'field', label: '', field: 'party.label', x: 44, y: 230, w: 200, h: 14, fontSize: 8, bold: true, color: '#aaa' },
    { id: eid(), type: 'field', field: 'party.name', x: 44, y: 246, w: 320, h: 20, fontSize: 12, bold: true },
    { id: eid(), type: 'field', field: 'party.address', x: 44, y: 268, w: 320, h: 40, fontSize: 10, color: '#888' },
    { id: eid(), type: 'field', label: 'Date', field: 'doc.date', x: 500, y: 246, w: 250, h: 16, fontSize: 10, align: 'right', color: '#666' },
    { id: eid(), type: 'lineItems', x: 44, y: 330, w: 706, h: 300, columns: GST_COLUMNS },
    { id: eid(), type: 'totals', x: 500, y: 650, w: 250, h: 110 },
    { id: eid(), type: 'field', field: 'totals.inWords', x: 44, y: 660, w: 380, h: 40, fontSize: 9, color: '#999' },
    { id: eid(), type: 'bank', x: 44, y: 980, w: 340, h: 80, fontSize: 9 },
    { id: eid(), type: 'terms', x: 44, y: 1060, w: 340, h: 50, fontSize: 8, color: '#999' },
    { id: eid(), type: 'signature', x: 560, y: 985, w: 190, h: 90 },
  ] }
}
