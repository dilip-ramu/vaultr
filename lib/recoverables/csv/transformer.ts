import type { RawCSVRow, ParsedShipment, ParsedAllocation } from '../types'

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function transformToShipments(validRows: RawCSVRow[], _currency: string): ParsedShipment[] {
  return validRows.map(row => {
    const perPieceCost = round4(row.totalCost / row.totalPcs)

    // Build allocations for suppliers with pieces > 0
    const activeSuppliers = Object.entries(row.suppliers).filter(([, pieces]) => pieces > 0)

    const allocations: ParsedAllocation[] = activeSuppliers.map(([supplierName, pieces]) => ({
      supplierName,
      pieces,
      baseCost: round4(pieces * perPieceCost),
      markupType: 'none' as const,
      markupValue: 0,
      markupAmount: 0,
      recoverableAmount: round2(pieces * perPieceCost),
    }))

    // Rounding correction: compare 2dp recoverableAmount sums (where the loss occurs)
    if (allocations.length > 0) {
      const sumRecoverable = round2(allocations.reduce((s, a) => s + a.recoverableAmount, 0))
      const diff = round2(row.totalCost - sumRecoverable)

      if (diff !== 0) {
        const largestIdx = allocations.reduce(
          (maxIdx, a, i) => a.pieces > allocations[maxIdx].pieces ? i : maxIdx,
          0,
        )
        allocations[largestIdx].recoverableAmount = round2(allocations[largestIdx].recoverableAmount + diff)
        allocations[largestIdx].baseCost          = round4(allocations[largestIdx].baseCost + diff)
      }
    }

    return {
      reference:     row.reference,
      totalCost:     row.totalCost,
      totalPieces:   row.totalPcs,
      perPieceCost,
      shipmentDate:  row.shipmentDate ?? null,
      allocations,
    }
  })
}

export function summarize(shipments: ParsedShipment[]): {
  referenceCount: number
  supplierCount: number
  totalCost: number
  totalRecoverable: number
  supplierNames: string[]
} {
  const supplierSet = new Set<string>()
  let totalCost = 0
  let totalRecoverable = 0

  for (const s of shipments) {
    totalCost = round2(totalCost + s.totalCost)
    for (const a of s.allocations) {
      supplierSet.add(a.supplierName)
      totalRecoverable = round2(totalRecoverable + a.recoverableAmount)
    }
  }

  return {
    referenceCount:   shipments.length,
    supplierCount:    supplierSet.size,
    totalCost,
    totalRecoverable,
    supplierNames:    Array.from(supplierSet),
  }
}
