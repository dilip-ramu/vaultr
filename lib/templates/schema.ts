// ── Document template schema (Feature: fully-customisable templates) ────────
// A template is a JSON document: a theme + an ordered list of blocks. One HTML
// renderer draws any schema, so the block editor's preview matches print
// output exactly. Block props are a generic bag so blocks can gain options
// without a schema migration; the renderer reads known keys with defaults.

export type DocType =
  | 'gst_invoice'
  | 'reimbursable_invoice'
  | 'salary_slip'
  // GST-compliant line-item documents that reuse the invoice engine
  | 'credit_note'
  | 'proforma_gst'
  | 'purchase_order'
  | 'delivery_challan'

export interface DocTheme {
  /** #RRGGBB accent for headers, totals, rules. */
  accent: string
  font: 'sans' | 'serif'
  /** 100 = default size; scales the whole document's font sizes. */
  fontScalePct: number
  /** Page padding in millimetres (print). */
  pageMarginMm: number
}

export type BlockType =
  | 'header' | 'companyInfo' | 'billTo' | 'meta' | 'supply'
  | 'lineItems' | 'totals' | 'amountWords' | 'bank' | 'terms' | 'signature'
  // reimbursable-invoice blocks
  | 'rHeader' | 'rParties' | 'rMeta' | 'rLineItems' | 'rTotals' | 'rBank' | 'rSignature'
  // salary-slip blocks
  | 'sHeader' | 'sEmployee' | 'sEarnings' | 'sNet' | 'sBank' | 'sFooter'
  | 'text' | 'divider' | 'spacer'

export interface Block {
  id: string
  type: BlockType
  visible: boolean
  props: Record<string, unknown>
}

export interface DocumentSchema {
  version: 1
  docType: DocType
  theme: DocTheme
  blocks: Block[]
}

export interface ColumnDef { key: string; label: string; visible: boolean; align?: 'left' | 'right' }
export interface FieldDef  { key: string; label: string; visible: boolean }

let _n = 0
export function blockId(): string {
  _n += 1
  return `b_${Date.now().toString(36)}_${_n.toString(36)}`
}

export const DEFAULT_ACCENT = '#2A7A50'

// Which block types a user can add per document type (for the editor palette).
export const ADDABLE_BLOCKS: Record<DocType, BlockType[]> = {
  gst_invoice:          ['text', 'divider', 'spacer'],
  reimbursable_invoice: ['text', 'divider', 'spacer'],
  salary_slip:          ['text', 'divider', 'spacer'],
  credit_note:          ['text', 'divider', 'spacer'],
  proforma_gst:         ['text', 'divider', 'spacer'],
  purchase_order:       ['text', 'divider', 'spacer'],
  delivery_challan:     ['text', 'divider', 'spacer'],
}

/** All document types the Templates hub exposes, with labels. */
export const DOC_TYPES: { id: DocType; label: string; short: string }[] = [
  { id: 'gst_invoice',          label: 'GST tax invoice',   short: 'GST invoice' },
  { id: 'proforma_gst',         label: 'Proforma invoice',  short: 'proforma invoice' },
  { id: 'credit_note',          label: 'Credit note',       short: 'credit note' },
  { id: 'delivery_challan',     label: 'Delivery challan',  short: 'delivery challan' },
  { id: 'purchase_order',       label: 'Purchase order',    short: 'purchase order' },
  { id: 'reimbursable_invoice', label: 'Reimbursable invoice', short: 'reimbursable invoice' },
  { id: 'salary_slip',          label: 'Salary slip',       short: 'salary slip' },
]

export const BLOCK_LABELS: Record<BlockType, string> = {
  header: 'Header', companyInfo: 'Company info', billTo: 'Bill to', meta: 'Invoice meta',
  supply: 'Place of supply', lineItems: 'Line items', totals: 'Totals',
  amountWords: 'Amount in words', bank: 'Bank details', terms: 'Terms & conditions',
  signature: 'Signature',
  rHeader: 'Header', rParties: 'Bill from / to', rMeta: 'Invoice meta',
  rLineItems: 'Line items', rTotals: 'Totals', rBank: 'Bank details', rSignature: 'Signature',
  sHeader: 'Header', sEmployee: 'Employee details', sEarnings: 'Earnings & deductions',
  sNet: 'Net payable', sBank: 'Bank details', sFooter: 'Footer',
  text: 'Text', divider: 'Divider', spacer: 'Spacer',
}

const INVOICE_COLUMNS: ColumnDef[] = [
  { key: 'sno',    label: '#',                 visible: true,  align: 'left' },
  { key: 'item',   label: 'Item & Description', visible: true, align: 'left' },
  { key: 'hsn',    label: 'HSN/SAC',           visible: true,  align: 'left' },
  { key: 'qty',    label: 'Qty',               visible: true,  align: 'right' },
  { key: 'rate',   label: 'Rate',              visible: true,  align: 'right' },
  { key: 'cgst',   label: 'CGST',              visible: true,  align: 'right' },
  { key: 'sgst',   label: 'SGST',              visible: true,  align: 'right' },
  { key: 'amount', label: 'Amount',            visible: true,  align: 'right' },
]

const INVOICE_META: FieldDef[] = [
  { key: 'invoice_date', label: 'Invoice Date', visible: true },
  { key: 'terms',        label: 'Terms',        visible: true },
  { key: 'due_date',     label: 'Due Date',     visible: true },
]

const INVOICE_TOTALS: FieldDef[] = [
  { key: 'subtotal', label: 'Sub Total',    visible: true },
  { key: 'cgst',     label: 'CGST',         visible: true },
  { key: 'sgst',     label: 'SGST',         visible: true },
  { key: 'total',    label: 'Total',        visible: true },
  { key: 'balance',  label: 'Balance Due',  visible: true },
]

interface InvoiceBlockOpts {
  title?: string
  billToLabel?: string
  columns?: ColumnDef[]
  totals?: FieldDef[]
  showSupply?: boolean
  showBank?: boolean
  showBalanceDue?: boolean
  termsTitle?: string
}

function invoiceBlocks(
  headerVariant: 'plain' | 'band' | 'minimal', headerStyle: 'grey' | 'filled' | 'plain', opts: InvoiceBlockOpts = {},
): Block[] {
  const title = opts.title ?? 'Tax Invoice'
  const billToLabel = opts.billToLabel ?? 'Bill To'
  const columns = opts.columns ?? INVOICE_COLUMNS
  const totals = opts.totals ?? INVOICE_TOTALS
  const showBalanceDue = opts.showBalanceDue ?? true
  return [
    { id: blockId(), type: 'header',      visible: true, props: { variant: headerVariant, showLogo: true, title, showNumber: true, showBalanceDue } },
    // In band + minimal variants the header already carries the company block;
    // only the plain (classic) variant needs the separate company-info row.
    { id: blockId(), type: 'companyInfo', visible: headerVariant === 'plain', props: { showBalanceDue } },
    { id: blockId(), type: 'billTo',      visible: true, props: { label: billToLabel } },
    { id: blockId(), type: 'meta',        visible: true, props: { fields: INVOICE_META } },
    { id: blockId(), type: 'supply',      visible: opts.showSupply ?? true, props: {} },
    { id: blockId(), type: 'lineItems',   visible: true, props: { columns, headerStyle, zebra: headerStyle !== 'plain' } },
    { id: blockId(), type: 'totals',      visible: true, props: { rows: totals } },
    { id: blockId(), type: 'amountWords', visible: true, props: {} },
    { id: blockId(), type: 'bank',        visible: opts.showBank ?? true, props: { title: 'Bank Details' } },
    { id: blockId(), type: 'terms',       visible: true, props: { title: opts.termsTitle ?? 'Terms & Conditions' } },
    { id: blockId(), type: 'signature',   visible: true, props: { label: 'Authorised Signature', showImage: true } },
  ]
}

// ── GST-compliant line-item documents (credit note, proforma, PO, challan) ──
// All reuse the invoice engine, so HSN/SAC, CGST/SGST, place of supply, GSTIN
// and amount-in-words come for free. Only titles, party labels and (for the
// challan) the tax columns differ.

const CHALLAN_COLUMNS: ColumnDef[] = [
  { key: 'sno',    label: '#',                  visible: true,  align: 'left' },
  { key: 'item',   label: 'Item & Description', visible: true,  align: 'left' },
  { key: 'hsn',    label: 'HSN/SAC',            visible: true,  align: 'left' },
  { key: 'qty',    label: 'Qty',                visible: true,  align: 'right' },
  { key: 'rate',   label: 'Rate',               visible: true,  align: 'right' },
  { key: 'amount', label: 'Taxable Value',      visible: true,  align: 'right' },
]
const CHALLAN_TOTALS: FieldDef[] = [
  { key: 'subtotal', label: 'Total Taxable Value', visible: true },
  { key: 'total',    label: 'Total Value',         visible: true },
]

const GST_DOC_OPTS: Partial<Record<DocType, InvoiceBlockOpts>> = {
  credit_note:      { title: 'Credit Note',      billToLabel: 'Credit To',       showBalanceDue: false },
  proforma_gst:     { title: 'Proforma Invoice', billToLabel: 'Bill To',         showBalanceDue: false },
  purchase_order:   { title: 'Purchase Order',   billToLabel: 'Vendor',          showBalanceDue: false, showBank: false, termsTitle: 'Terms & Delivery Instructions' },
  delivery_challan: { title: 'Delivery Challan', billToLabel: 'Consignee (Ship To)', showBalanceDue: false, showBank: false, columns: CHALLAN_COLUMNS, totals: CHALLAN_TOTALS, termsTitle: 'Reason for Transportation / Notes' },
}

function gstDocPreset(docType: DocType, preset: PresetId, accent: string, opts: InvoiceBlockOpts): DocumentSchema {
  const theme: DocTheme = { accent, font: 'sans', fontScalePct: 100, pageMarginMm: 12 }
  const [variant, style]: ['plain' | 'band' | 'minimal', 'grey' | 'filled' | 'plain'] =
    preset === 'modern' ? ['band', 'filled'] : preset === 'minimal' ? ['minimal', 'plain'] : ['plain', 'grey']
  return { version: 1, docType, theme, blocks: invoiceBlocks(variant, style, opts) }
}

export type PresetId = 'classic' | 'modern' | 'minimal'

/** Build a fresh invoice schema from one of the built-in presets, seeded with
 *  an accent (usually the company's current accent). */
export function invoicePreset(preset: PresetId, accent: string = DEFAULT_ACCENT): DocumentSchema {
  const theme: DocTheme = {
    accent,
    font: 'sans',
    fontScalePct: 100,
    pageMarginMm: 12,
  }
  if (preset === 'modern')  return { version: 1, docType: 'gst_invoice', theme, blocks: invoiceBlocks('band', 'filled') }
  if (preset === 'minimal') return { version: 1, docType: 'gst_invoice', theme, blocks: invoiceBlocks('minimal', 'plain') }
  return { version: 1, docType: 'gst_invoice', theme, blocks: invoiceBlocks('plain', 'grey') }
}

export const INVOICE_PRESETS: { id: PresetId; label: string; blurb: string }[] = [
  { id: 'classic', label: 'Classic', blurb: 'Logo left, ruled header, grey table' },
  { id: 'modern',  label: 'Modern',  blurb: 'Accent header band, filled table' },
  { id: 'minimal', label: 'Minimal', blurb: 'Airy, hairline table' },
]

// ── Reimbursable (proforma) invoice ─────────────────────────────────────────

const REIMB_META: FieldDef[] = [
  { key: 'invoice_number', label: 'Invoice Number', visible: true },
  { key: 'invoice_date',   label: 'Invoice Date',   visible: true },
  { key: 'currency',       label: 'Currency',       visible: true },
  { key: 'forex_rate',     label: 'Forex Rate Used', visible: true },
]
const REIMB_SECTIONS: FieldDef[] = [
  { key: 'salary',        label: 'Salaries',              visible: true },
  { key: 'courier',       label: 'Courier Charges',       visible: true },
  { key: 'expense',       label: 'Operational Expenses',  visible: true },
  { key: 'fixed_expense', label: 'Fixed Expenses',        visible: true },
  { key: 'deduction',     label: 'Deductions',            visible: true },
]

function reimbBlocks(variant: 'plain' | 'band' | 'minimal', headerStyle: 'grey' | 'filled' | 'plain'): Block[] {
  return [
    { id: blockId(), type: 'rHeader',    visible: true, props: { variant, showLogo: true, title: 'Proforma Invoice', showNumber: true } },
    { id: blockId(), type: 'rParties',   visible: true, props: { showFrom: true, showTo: true, showPayment: true, fromLabel: 'Bill From', toLabel: 'Bill To' } },
    { id: blockId(), type: 'rMeta',      visible: true, props: { fields: REIMB_META } },
    { id: blockId(), type: 'rLineItems', visible: true, props: { sections: REIMB_SECTIONS, showInr: true, headerStyle } },
    { id: blockId(), type: 'rTotals',    visible: true, props: { showSubtotal: true, gstLabel: 'GST @ 18%', showGrand: true } },
    { id: blockId(), type: 'rBank',      visible: true, props: { title: 'Bank Details for Payment' } },
    { id: blockId(), type: 'rSignature', visible: true, props: { label: 'Authorised Signature & Date' } },
  ]
}

export function reimbursablePreset(preset: PresetId, accent: string = DEFAULT_ACCENT): DocumentSchema {
  const theme: DocTheme = { accent, font: 'sans', fontScalePct: 100, pageMarginMm: 14 }
  if (preset === 'modern')  return { version: 1, docType: 'reimbursable_invoice', theme, blocks: reimbBlocks('band', 'filled') }
  if (preset === 'minimal') return { version: 1, docType: 'reimbursable_invoice', theme, blocks: reimbBlocks('minimal', 'plain') }
  return { version: 1, docType: 'reimbursable_invoice', theme, blocks: reimbBlocks('plain', 'filled') }
}

// ── Salary slip ─────────────────────────────────────────────────────────────

const SLIP_EMP_FIELDS: FieldDef[] = [
  { key: 'name',         label: 'Employee Name',   visible: true },
  { key: 'employee_id',  label: 'Employee ID',     visible: true },
  { key: 'designation',  label: 'Designation',     visible: true },
  { key: 'joining_date', label: 'Date of Joining', visible: true },
  { key: 'pan_number',   label: 'PAN',             visible: true },
  { key: 'payment_date', label: 'Payment Date',    visible: true },
]
const SLIP_EARNINGS: FieldDef[] = [
  { key: 'basic',      label: 'Basic Salary', visible: true },
  { key: 'allowances', label: 'Allowances',   visible: true },
  { key: 'overtime',   label: 'Overtime',     visible: true },
  { key: 'incentives', label: 'Incentives',   visible: true },
]
const SLIP_DEDUCTIONS: FieldDef[] = [
  { key: 'deductions', label: 'Deductions',       visible: true },
  { key: 'advance',    label: 'Advance Recovery', visible: true },
]

function slipBlocks(variant: 'plain' | 'band' | 'minimal', headerStyle: 'grey' | 'filled' | 'plain'): Block[] {
  return [
    { id: blockId(), type: 'sHeader',   visible: true, props: { variant, showAddress: true, title: 'Salary Slip' } },
    { id: blockId(), type: 'sEmployee', visible: true, props: { fields: SLIP_EMP_FIELDS } },
    { id: blockId(), type: 'sEarnings', visible: true, props: { headerStyle, earnings: SLIP_EARNINGS, deductions: SLIP_DEDUCTIONS } },
    { id: blockId(), type: 'sNet',      visible: true, props: { showWords: true, showForex: true } },
    { id: blockId(), type: 'sBank',     visible: true, props: { title: 'Bank Transfer Details' } },
    { id: blockId(), type: 'sFooter',   visible: true, props: { note: 'This is a computer-generated salary slip.' } },
  ]
}

export function salarySlipPreset(preset: PresetId, accent: string = DEFAULT_ACCENT): DocumentSchema {
  const theme: DocTheme = { accent, font: 'sans', fontScalePct: 100, pageMarginMm: 14 }
  if (preset === 'modern')  return { version: 1, docType: 'salary_slip', theme, blocks: slipBlocks('band', 'filled') }
  if (preset === 'minimal') return { version: 1, docType: 'salary_slip', theme, blocks: slipBlocks('minimal', 'plain') }
  return { version: 1, docType: 'salary_slip', theme, blocks: slipBlocks('plain', 'grey') }
}

/** Preset builder dispatch by doc type. */
export function presetSchema(docType: DocType, preset: PresetId, accent: string = DEFAULT_ACCENT): DocumentSchema | null {
  if (docType === 'gst_invoice') return invoicePreset(preset, accent)
  if (docType === 'reimbursable_invoice') return reimbursablePreset(preset, accent)
  if (docType === 'salary_slip') return salarySlipPreset(preset, accent)
  const opts = GST_DOC_OPTS[docType]
  if (opts) return gstDocPreset(docType, preset, accent, opts)
  return null
}
