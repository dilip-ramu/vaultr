// Cheque printing module — a per-bank template calibrated once against an
// uploaded blank-cheque image. Field coordinates are stored in millimetres
// from the top-left of the physical leaf, independent of the background image.

export type ChequeFieldKey =
  | 'date'
  | 'payee'
  | 'amount_figures'
  | 'amount_words'
  | 'ac_payee'

export interface ChequeField {
  key: ChequeFieldKey
  label: string
  enabled: boolean
  x: number            // mm from left (top-left of the text box)
  y: number            // mm from top
  w?: number           // mm max width — used for wrapping/alignment (esp. amount in words)
  fontSize: number     // pt
  bold: boolean
  color: string        // hex
  align: 'left' | 'center' | 'right'
  letterSpacing?: number // pt — handy for date digit boxes
}

export interface Bank {
  id: string
  user_id: string
  name: string
  logo_path: string | null
  cheque_width_mm: number | null
  cheque_height_mm: number | null
  cheque_fields: ChequeField[]
  cheque_bg_path: string | null
  created_at: string
  updated_at: string
}

// CTS-2010 Indian cheque leaves are ~200 × 92 mm. A sensible starting canvas.
export const DEFAULT_CHEQUE_SIZE = { width: 200, height: 92 }

export const CHEQUE_FIELD_LABELS: Record<ChequeFieldKey, string> = {
  date: 'Date',
  payee: 'Payee',
  amount_figures: 'Amount (figures)',
  amount_words: 'Amount (words)',
  ac_payee: 'A/C Payee',
}

/** Reasonable starting positions — the user drags each to match their leaf. */
export function defaultChequeFields(): ChequeField[] {
  return [
    { key: 'date',           label: 'Date',              enabled: true,  x: 150, y: 6,  fontSize: 11, bold: false, color: '#111111', align: 'left', letterSpacing: 2 },
    { key: 'payee',          label: 'Payee',             enabled: true,  x: 22,  y: 24, w: 150, fontSize: 12, bold: false, color: '#111111', align: 'left' },
    { key: 'amount_words',   label: 'Amount in words',   enabled: true,  x: 30,  y: 33, w: 150, fontSize: 11, bold: false, color: '#111111', align: 'left' },
    { key: 'amount_figures', label: 'Amount in figures', enabled: true,  x: 165, y: 40, w: 30, fontSize: 12, bold: true,  color: '#111111', align: 'left' },
    { key: 'ac_payee',       label: 'A/C Payee',         enabled: true,  x: 12,  y: 8,  fontSize: 9,  bold: true,  color: '#111111', align: 'left' },
  ]
}

/** Fixed text stamped for the A/C-Payee crossing. */
export const AC_PAYEE_TEXT = 'A/C PAYEE ONLY'

export const MM_TO_PT = 72 / 25.4      // 2.83465
export const MM_TO_PX = 96 / 25.4      // 3.77953  (on-screen, 1 CSS px = 1/96 in)
