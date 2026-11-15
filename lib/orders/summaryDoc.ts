// The one-page summary that goes in the supplier pack.
//
// A supplier opening a zip should be able to see what is wanted without
// opening every file in it: styles, the size breakdown, quantities, agreed
// rates, when it has to be accepted by and when it has to leave.
//
// It is built as a DocModel, the same shape every other document in Inex
// renders through, so it comes out on the same letterhead with the same
// typography and the same text-wrapping as the purchase order sitting beside
// it in the zip. Pure: a model in, a model out, no jsPDF and no database.

import type { DocModel, DocColumn, DocRow, DocPackingRow } from '@/lib/documents/model'
import { formatSizes, lineQty, type SizeRow } from './sizes'

export interface SummaryLine {
  item: string
  description?: string | null
  qty: number
  /** Agreed rate in rupees per unit. */
  costRate: number
  sizes?: readonly SizeRow[]
}

export interface SummaryInput {
  orderNumber: string
  orderDate: string
  customerPoNo?: string | null
  poNumber?: string | null
  cutoffDate?: string | null
  etd?: string | null
  supplierName?: string | null
  companyName: string
  companyLines?: string[]
  accent: string
  logoUrl?: string | null
  lines: readonly SummaryLine[]
  /** The packing list, already laid out for a packer to follow. */
  packing?: readonly DocPackingRow[]
  /** Total cartons across the order. */
  cartons?: number
  /** Over-shipment agreed with the supplier, as a percentage. 0 = none. */
  tolerancePct?: number
  notes?: string | null
}

const n0 = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)
const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)

/** The line under the packing table: the total, and what was agreed. */
function packingFootnote(cartons: number | undefined, tolerancePct: number | undefined): string | undefined {
  const bits: string[] = []
  if (cartons) bits.push(`Total ${cartons} box${cartons === 1 ? '' : 'es'}.`)
  // Only said when something was actually agreed — printing "0% allowed"
  // invites an argument about whether that was the agreement.
  if (tolerancePct && tolerancePct > 0) bits.push(`Over-shipment allowed: ${tolerancePct}% as agreed.`)
  return bits.length ? bits.join(' ') : undefined
}

export function orderSummaryDocModel(i: SummaryInput): DocModel {
  const columns: DocColumn[] = [
    { key: 'desc', label: 'STYLE', flex: 1.9 },
    { key: 'sizes', label: 'SIZE BREAKDOWN', flex: 1.5 },
    { key: 'qty', label: 'QTY', align: 'right', flex: 0.6 },
    { key: 'rate', label: 'RATE', align: 'right', flex: 0.7 },
    { key: 'value', label: 'VALUE', align: 'right', flex: 0.85 },
  ]

  let totalQty = 0
  let totalValue = 0
  const rows: DocRow[] = i.lines.map(l => {
    const qty = lineQty(l.qty, l.sizes)
    const value = qty * (Number(l.costRate) || 0)
    totalQty += qty
    totalValue += value
    // The spec goes under the style name in the same cell: the renderer wraps
    // on newlines, and a separate column for it would be too narrow to read.
    const desc = l.description?.trim() ? `${l.item}\n${l.description.trim()}` : l.item
    return {
      cells: {
        desc,
        sizes: formatSizes(l.sizes ?? [], '\n') || '—',
        qty: n0(qty),
        rate: n0(Number(l.costRate) || 0),
        value: n0(value),
      },
    }
  })

  if (rows.length > 1) {
    rows.push({ strong: true, cells: { desc: 'Total', sizes: '', qty: n0(totalQty), rate: '', value: n0(totalValue) } })
  }

  const meta = [
    { label: 'Date', value: i.orderDate },
    ...(i.poNumber ? [{ label: 'Purchase order', value: i.poNumber }] : []),
    ...(i.cutoffDate ? [{ label: 'Cut-off date', value: i.cutoffDate }] : []),
    ...(i.etd ? [{ label: 'ETD', value: i.etd }] : []),
    ...(i.customerPoNo ? [{ label: 'Buyer ref', value: i.customerPoNo }] : []),
  ].filter(m => !!m.value)

  return {
    accent: i.accent,
    logoUrl: i.logoUrl ?? null,
    companyName: i.companyName,
    companyLines: i.companyLines ?? [],
    title: 'ORDER SUMMARY',
    number: i.orderNumber,
    subNote: 'Not a tax invoice · for production reference',
    parties: i.supplierName ? [{ label: 'SUPPLIER', name: i.supplierName }] : [],
    meta,
    columns,
    rows,
    totals: [
      { label: 'Total pieces', value: n0(totalQty) },
      ...(i.cartons ? [{ label: 'Total cartons', value: n0(i.cartons) }] : []),
    ],
    grandLabel: 'ORDER VALUE',
    grandValue: inr(totalValue),
    // Packing is its own borderless table — a carton that mixes two styles
    // belongs to neither line of the priced table above it.
    packing: i.packing?.length ? [...i.packing] : undefined,
    packingNote: i.packing?.length ? packingFootnote(i.cartons, i.tolerancePct) : undefined,
    terms: i.notes?.trim() || undefined,
    signatureLabel: 'For ' + i.companyName,
  }
}
