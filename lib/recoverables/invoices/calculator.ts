import type { RecoverableAllocation, RecoverableShipment } from '../types'

export interface InvoiceLine {
  allocationId: string
  awb: string
  shipmentDate: string | null
  clientName: string | null
  qty: number
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

      const amount     = round2(a.pieces * rate)
      const cgstAmount = round2(amount * cgstRate / 100)
      const sgstAmount = round2(amount * sgstRate / 100)

      return {
        allocationId: a.id,
        awb:          shipment?.reference ?? '',
        shipmentDate: shipment?.shipment_date ?? null,
        clientName:   shipment?.client_name ?? null,
        qty:          a.pieces,
        baseRate,
        rate,
        amount,
        cgstRate,
        cgstAmount,
        sgstRate,
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

export function calcTotals(
  lines: InvoiceLine[],
  cgstRate: number,
  sgstRate: number,
): InvoiceTotals {
  const subtotal   = round2(lines.reduce((s, l) => s + l.amount, 0))
  const cgstAmount = round2(subtotal * cgstRate / 100)
  const sgstAmount = round2(subtotal * sgstRate / 100)
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
