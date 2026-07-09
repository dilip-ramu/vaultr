// Cheque printing module — a per-bank template calibrated once against an
// uploaded blank-cheque image. Field coordinates are stored in millimetres
// from the top-left of the physical leaf, independent of the background image.

export type ChequeFieldKey =
  // Date is eight independent single-digit fields (D D M M Y Y Y Y) so each
  // digit drops into its own pre-printed box.
  | 'date_d1' | 'date_d2'
  | 'date_m1' | 'date_m2'
  | 'date_y1' | 'date_y2' | 'date_y3' | 'date_y4'
  | 'payee'
  | 'amount_figures'
  | 'amount_words'
  | 'ac_payee'
  // legacy keys kept so older saved templates still load
  | 'date' | 'date_dd' | 'date_mm' | 'date_yyyy'

/** The eight date-digit field keys, in D D M M Y Y Y Y order. */
export const DATE_DIGIT_KEYS: ChequeFieldKey[] = ['date_d1', 'date_d2', 'date_m1', 'date_m2', 'date_y1', 'date_y2', 'date_y3', 'date_y4']

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
  date_d1: 'Date · D', date_d2: 'Date · D',
  date_m1: 'Date · M', date_m2: 'Date · M',
  date_y1: 'Date · Y', date_y2: 'Date · Y', date_y3: 'Date · Y', date_y4: 'Date · Y',
  payee: 'Payee',
  amount_figures: 'Amount (figures)',
  amount_words: 'Amount (words)',
  ac_payee: 'A/C Payee',
  date: 'Date (legacy)', date_dd: 'Date DD (legacy)', date_mm: 'Date MM (legacy)', date_yyyy: 'Date YYYY (legacy)',
}

/** Reasonable starting positions — the user drags each to match their leaf.
 *  The date is eight independent single-digit fields (D D M M Y Y Y Y), spaced
 *  ~6 mm apart along the top so each digit lands in its own box. */
export function defaultChequeFields(): ChequeField[] {
  const dateDigits: ChequeField[] = DATE_DIGIT_KEYS.map((key, i) => ({
    key, label: CHEQUE_FIELD_LABELS[key], enabled: true,
    x: 143 + i * 6, y: 6, fontSize: 12, bold: false, color: '#111111', align: 'center' as const,
  }))
  return [
    ...dateDigits,
    { key: 'payee',          label: 'Payee',             enabled: true,  x: 22,  y: 24, w: 150, fontSize: 12, bold: false, color: '#111111', align: 'left' },
    { key: 'amount_words',   label: 'Amount in words',   enabled: true,  x: 30,  y: 33, w: 150, fontSize: 11, bold: false, color: '#111111', align: 'left' },
    { key: 'amount_figures', label: 'Amount in figures', enabled: true,  x: 165, y: 40, w: 30, fontSize: 12, bold: true,  color: '#111111', align: 'left' },
    { key: 'ac_payee',       label: 'A/C Payee',         enabled: true,  x: 12,  y: 8,  fontSize: 9,  bold: true,  color: '#111111', align: 'left' },
  ]
}

/** Fixed text stamped for the A/C-Payee crossing. */
export const AC_PAYEE_TEXT = 'A/C PAYEE ONLY'

/** The single character a date-digit field should print, given ddmmyyyy parts. */
export function dateDigitFor(key: ChequeFieldKey, dd: string, mm: string, yyyy: string): string | null {
  const d = dd.padStart(2, '0'), m = mm.padStart(2, '0'), y = yyyy.padStart(4, '0')
  switch (key) {
    case 'date_d1': return d[0] ?? null
    case 'date_d2': return d[1] ?? null
    case 'date_m1': return m[0] ?? null
    case 'date_m2': return m[1] ?? null
    case 'date_y1': return y[0] ?? null
    case 'date_y2': return y[1] ?? null
    case 'date_y3': return y[2] ?? null
    case 'date_y4': return y[3] ?? null
    case 'date':      return [dd, mm, yyyy].filter(Boolean).join(' ') || null // legacy
    case 'date_dd':   return dd || null
    case 'date_mm':   return mm || null
    case 'date_yyyy': return yyyy || null
    default: return null
  }
}

export const MM_TO_PT = 72 / 25.4      // 2.83465
export const MM_TO_PX = 96 / 25.4      // 3.77953  (on-screen, 1 CSS px = 1/96 in)
