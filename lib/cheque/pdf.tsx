// Exact-size cheque PDF. The page is sized to the physical leaf (mm → pt) and
// only the positioned text is drawn — no background. This same PDF is what
// prints onto the pre-printed leaf and what we archive on the payment.

import { Document, Page, Text, View, pdf } from '@react-pdf/renderer'
import type { Bank, ChequeField } from './types'
import { MM_TO_PT, AC_PAYEE_TEXT, dateDigitFor } from './types'
import { amountInWords, amountInFigures } from './amountWords'

export interface ChequeValues {
  dd: string             // day, e.g. "09"
  mm: string             // month, e.g. "07"
  yyyy: string           // year, e.g. "2026"
  payee: string
  amountFigures: string
  amountWords: string
  acPayee: boolean
  chequeNumber?: string
}

/**
 * Assemble the printed cheque values from raw inputs, applying the house
 * formatting: payee trailing hyphen, amount-in-words (no "Rupees") ending in a
 * hyphen, and a "**" anti-forgery prefix on the figures. Shared by the invoice
 * pay flow and the standalone cheque writer so they always match.
 */
export function chequeValuesFrom(opts: { payee: string; amount: number; dateIso: string; acPayee: boolean; chequeNumber?: string }): ChequeValues {
  const [y, m, d] = (opts.dateIso || '').split('-')
  const words = amountInWords(opts.amount)
  const figures = amountInFigures(opts.amount)
  return {
    dd: d ?? '', mm: m ?? '', yyyy: y ?? '',
    payee: opts.payee.trim() ? `${opts.payee.trim()} -` : '',
    amountFigures: figures ? `**${figures}` : '',
    amountWords: words ? `${words} -` : '',
    acPayee: opts.acPayee,
    chequeNumber: opts.chequeNumber,
  }
}

function valueFor(field: ChequeField, v: ChequeValues): string | null {
  switch (field.key) {
    case 'payee': return v.payee || null
    case 'amount_figures': return v.amountFigures || null
    case 'amount_words': return v.amountWords || null
    case 'ac_payee': return v.acPayee ? AC_PAYEE_TEXT : null
    default: return dateDigitFor(field.key, v.dd, v.mm, v.yyyy)
  }
}

export function buildChequeDoc(bank: Bank, v: ChequeValues) {
  const wMm = bank.cheque_width_mm || 200
  const hMm = bank.cheque_height_mm || 92
  const fields = Array.isArray(bank.cheque_fields) ? bank.cheque_fields : []

  return (
    <Document>
      <Page size={[wMm * MM_TO_PT, hMm * MM_TO_PT]} style={{ position: 'relative' }}>
        {fields.filter(f => f.enabled).map((f, i) => {
          const text = valueFor(f, v)
          if (text == null || text === '') return null
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: f.x * MM_TO_PT,
                top: f.y * MM_TO_PT,
                width: f.w ? f.w * MM_TO_PT : undefined,
              }}
            >
              <Text
                style={{
                  fontSize: f.fontSize,
                  color: f.color || '#111111',
                  fontFamily: 'Helvetica',
                  fontWeight: f.bold ? 'bold' : 'normal',
                  textAlign: f.align,
                  letterSpacing: f.letterSpacing ?? 0,
                }}
              >
                {text}
              </Text>
            </View>
          )
        })}
      </Page>
    </Document>
  )
}

export async function renderChequePdfBlob(bank: Bank, v: ChequeValues): Promise<Blob> {
  return pdf(buildChequeDoc(bank, v)).toBlob()
}
