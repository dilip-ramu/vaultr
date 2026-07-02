import type { RecoverableAllocation, RecoverableShipment } from '../types'

export interface InvoiceLine {
  allocationId: string
  awb: string
  shipmentDate: string | null
  clientName: string | null
  qty: number
  hsnSac: string
  baseRate: number
  rate: number
  amount: number
  cgstRate: number
  cgstAmount: number
  sgstRate: number
  sgstAmount: number
}

export interface InvoiceTotals {
  lines: InvoiceLine[]
  subtotal: number
  cgstAmount: number
  sgstAmount: number
  total: number
  balanceDue: number
}

/** Per-line tax/HSN override, keyed by allocationId in the map passed to
 *  buildInvoiceLines. Any field left undefined falls back to the company
 *  default (defaultHsn / cgstRate / sgstRate). */
export interface LineTaxOverride {
  hsnSac?: string | null
  cgstRate?: number | null
  sgstRate?: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function buildInvoiceLines(
  allocations: RecoverableAllocation[],
  shipments: RecoverableShipment[],
  markupType: 'percentage' | 'flat' | 'none',
  markupValue: number,
  cgstRate: number,
  sgstRate: number,
  /** Company default HSN/SAC, used when a line has no per-line override. */
  defaultHsn: string = '996812',
  /** Per-line overrides keyed by allocationId. Optional — when omitted every
   *  line uses the company-level cgstRate / sgstRate / defaultHsn. */
  overrides?: Map<string, LineTaxOverride>,
): InvoiceLine[] {
  const shipmentMap = new Map(shipments.map(s => [s.id, s]))

  const lines: InvoiceLine[] = allocations
    .filter(a => a.pieces > 0)
    .map(a => {
      const shipment = shipmentMap.get(a.shipment_id)
      const baseRate = a.pieces > 0 ? round4(a.base_cost / a.pieces) : 0

      const rate =
        markupType === 'percentage' ? round4(baseRate * (1 + markupValue / 100))
        : markupType === 'flat'     ? round4(baseRate + markupValue)
        : baseRate

      const ov = overrides?.get(a.id)
      const lineCgstRate = ov?.cgstRate ?? cgstRate
      const lineSgstRate = ov?.sgstRate ?? sgstRate
      const lineHsn      = (ov?.hsnSac ?? '').trim() || defaultHsn

      const amount     = round2(a.pieces * rate)
      const cgstAmount = round2(amount * lineCgstRate / 100)
      const sgstAmount = round2(amount * lineSgstRate / 100)

      return {
        allocationId: a.id,
        awb:          shipment?.reference ?? '',
        shipmentDate: shipment?.shipment_date ?? null,
        clientName:   shipment?.client_name ?? null,
        qty:          a.pieces,
        hsnSac:       lineHsn,
        baseRate,
        rate,
        amount,
        cgstRate:     lineCgstRate,
        cgstAmount,
        sgstRate:     lineSgstRate,
        sgstAmount,
      }
    })

  return lines.sort((a, b) => {
    if (a.shipmentDate && b.shipmentDate) {
      const dateCmp = a.shipmentDate.localeCompare(b.shipmentDate)
      if (dateCmp !== 0) return dateCmp
    } else if (a.shipmentDate) {
      return -1
    } else if (b.shipmentDate) {
      return 1
    }
    return a.awb.localeCompare(b.awb)
  })
}

/** Totals are summed from each line's own GST amounts, so an invoice can mix
 *  GST rates / HSN codes across lines. (Previously this multiplied the
 *  subtotal by a single company rate.) */
export function calcTotals(lines: InvoiceLine[]): InvoiceTotals {
  const subtotal   = round2(lines.reduce((s, l) => s + l.amount, 0))
  const cgstAmount = round2(lines.reduce((s, l) => s + l.cgstAmount, 0))
  const sgstAmount = round2(lines.reduce((s, l) => s + l.sgstAmount, 0))
  const total      = round2(subtotal + cgstAmount + sgstAmount)

  return {
    lines,
    subtotal,
    cgstAmount,
    sgstAmount,
    total,
    balanceDue: total,
  }
}
