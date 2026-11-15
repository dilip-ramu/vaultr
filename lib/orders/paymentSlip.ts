// The slip that goes with a payment.
//
// A supplier who has been sent an advance wants something on paper saying
// what it was for, and so do you three months later when the bank statement
// shows a number with no story. It is not a tax document and it says so —
// the point is the reference, the order and the amount in words, which is
// what makes the payment findable from either end.
//
// Built as a DocModel so it comes out on the same letterhead as everything
// else, with the same wrapping and the same typography. Pure.

import type { DocModel, DocColumn, DocRow } from '@/lib/documents/model'
import { money } from '@/lib/documents/money'
import { amountToWords } from '@/lib/recoverables/invoices/words'
import { direction, type PaymentKind, type PaymentParty } from './payments'

/**
 * The slip has its own words. The dropdown says "Advance paid" so the two
 * sides read differently while choosing; the slip already says who was paid
 * in the PAID TO box, and "Advance paid against order" reads like a stutter.
 */
const SLIP_WORD: Record<PaymentKind, string> = {
  advance: 'Advance', settlement: 'Payment', refund: 'Refund',
}

export interface PaymentSlipInput {
  /** Our own reference for the slip — usually the payment's row number. */
  number: string
  kind: PaymentKind
  /** Which side of the order. Decides every bit of wording that has a side. */
  party?: PaymentParty
  amount: number
  date: string
  /** Who the money went to, or came from. */
  partyName?: string | null
  partyLines?: string[]
  /** The bank account it moved through. */
  accountName?: string | null
  reference?: string | null
  note?: string | null

  orderNumber: string
  customerPoNo?: string | null

  companyName: string
  companyLines?: string[]
  accent: string
  logoUrl?: string | null
  signatureUrl?: string | null
  signatureLabel?: string
}

export function paymentSlipDocModel(i: PaymentSlipInput): DocModel {
  const inward = direction(i.kind, i.party ?? 'supplier') === 'in'

  const columns: DocColumn[] = [
    { key: 'what', label: 'PARTICULARS', flex: 2.6 },
    { key: 'amount', label: 'AMOUNT', align: 'right', flex: 1 },
  ]

  const rows: DocRow[] = [{
    cells: {
      what: [
        `${SLIP_WORD[i.kind]} against order ${i.orderNumber}`,
        i.customerPoNo ? `Buyer reference ${i.customerPoNo}` : '',
        i.note?.trim() ?? '',
      ].filter(Boolean).join('\n'),
      amount: money(i.amount, 'INR'),
    },
  }]

  const meta = [
    { label: 'Date', value: i.date },
    { label: 'Order', value: i.orderNumber },
    ...(i.reference?.trim() ? [{ label: 'Reference', value: i.reference.trim() }] : []),
    // Which account it moved through is the thing that ties the slip to the
    // bank statement, so it is on the face of it and not in a footnote.
    ...(i.accountName?.trim() ? [{ label: inward ? 'Received into' : 'Paid from', value: i.accountName.trim() }] : []),
  ]

  return {
    accent: i.accent,
    logoUrl: i.logoUrl ?? null,
    companyName: i.companyName,
    companyLines: i.companyLines ?? [],
    title: inward ? 'RECEIPT' : 'PAYMENT SLIP',
    number: i.number,
    subNote: 'Not a tax invoice · payment advice only',
    parties: i.partyName
      ? [{ label: inward ? 'RECEIVED FROM' : 'PAID TO', name: i.partyName, lines: i.partyLines ?? [] }]
      : [],
    meta,
    columns,
    rows,
    grandLabel: inward ? 'RECEIVED' : 'PAID',
    grandValue: money(i.amount, 'INR'),
    inWords: amountToWords(i.amount, 'INR'),
    signatureUrl: i.signatureUrl ?? null,
    signatureLabel: i.signatureLabel ?? `For ${i.companyName}`,
  }
}

/** The filename somebody will be looking for in a folder a year from now. */
export function paymentSlipFilename(i: Pick<PaymentSlipInput, 'kind' | 'orderNumber' | 'number' | 'party'>): string {
  const head = direction(i.kind, i.party ?? 'supplier') === 'in' ? 'Receipt' : 'Payment'
  return `${head} ${i.orderNumber} ${i.number}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
}
