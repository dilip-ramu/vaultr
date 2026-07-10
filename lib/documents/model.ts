// Normalized model that drives the single downloadable-document design (the
// "31" design). Every document type — tax invoice, courier/reimbursable
// invoice, proforma, credit/debit note, purchase order, delivery challan and
// the salary slip — is adapted into this shape and rendered by <DocDesign>.

export type BandTone = 'green' | 'amber' | 'red' | 'grey' | 'blue' | 'violet'

export interface DocColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  flex?: number
}

export interface DocRow {
  cells: Record<string, string>
  danger?: boolean   // red text (e.g. deduction lines)
  strong?: boolean   // bold summary row inside the table
}

export interface DocParty {
  label: string
  name: string
  lines?: string[]
}

export interface DocMeta { label: string; value: string }

export interface DocTotalRow { label: string; value: string }

export interface DocTaxSummary {
  title?: string
  columns: string[]          // e.g. ['TAXABLE','CGST 9%','SGST 9%']
  rows: string[][]
}

export interface DocModel {
  accent: string
  status?: { label: string; tone: BandTone }

  logoUrl?: string | null
  companyName: string
  companyLines?: string[]

  title: string              // e.g. 'TAX INVOICE'
  number: string
  subNote?: string           // e.g. 'ORIGINAL FOR RECIPIENT'

  parties: DocParty[]        // 1–3 boxes across the top grid
  meta?: DocMeta[]           // small inline chips (dates, refs)

  columns: DocColumn[]
  rows: DocRow[]

  taxSummary?: DocTaxSummary
  totals?: DocTotalRow[]     // small right-aligned rows above the grand total
  grandLabel?: string        // e.g. 'TOTAL'
  grandValue?: string        // e.g. '₹2,59,600'
  grandSub?: string          // optional secondary total line (e.g. INR equivalent)
  inWords?: string

  bankLines?: string[]       // left footer block
  terms?: string             // terms & conditions
  note?: string              // free footnote (proforma disclaimer etc.)

  signatureUrl?: string | null
  signatureLabel?: string    // default 'Authorised signatory'
}

/** Tone → colours for the status band. */
export const BAND_COLORS: Record<BandTone, { bg: string; fg: string }> = {
  green:  { bg: '#DCFCE7', fg: '#14532D' },
  amber:  { bg: '#FEF3C7', fg: '#92400E' },
  red:    { bg: '#FEE2E2', fg: '#991B1B' },
  grey:   { bg: '#EEF0F2', fg: '#4B5563' },
  blue:   { bg: '#DBEAFE', fg: '#1E40AF' },
  violet: { bg: '#EDE9FE', fg: '#5B21B6' },
}

/** Status band for an invoice-like document from its payment state. */
export function invoiceStatusBand(status: string, dueDate?: string | null): { label: string; tone: BandTone } {
  const s = (status || '').toLowerCase()
  if (s === 'paid')  return { label: 'PAID', tone: 'green' }
  if (s === 'draft') return { label: 'DRAFT', tone: 'grey' }
  if (s === 'cancelled' || s === 'void') return { label: 'CANCELLED', tone: 'grey' }
  // Partially paid or sent/unpaid → overdue if past due date.
  if (dueDate) {
    const due = new Date(dueDate).getTime()
    if (Number.isFinite(due) && due < Date.now()) return { label: 'OVERDUE', tone: 'red' }
  }
  if (s === 'partial' || s === 'partially_paid') return { label: 'PARTIALLY PAID', tone: 'amber' }
  return { label: 'DUE', tone: 'amber' }
}
