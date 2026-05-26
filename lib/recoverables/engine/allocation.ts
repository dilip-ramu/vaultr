import type { MarkupType, ParsedShipment, ParsedAllocation } from '../types'

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcPerPieceCost(totalCost: number, totalPieces: number): number {
  if (totalPieces === 0) throw new Error('totalPieces cannot be zero')
  return round4(totalCost / totalPieces)
}

export function calcBaseCost(pieces: number, perPieceCost: number): number {
  return round4(pieces * perPieceCost)
}

export function applyMarkup(
  baseCost: number,
  markupType: MarkupType,
  markupValue: number,
): { markupAmount: number; total: number } {
  let markupAmount = 0

  if (markupType === 'percentage') {
    markupAmount = round2(baseCost * markupValue / 100)
  } else if (markupType === 'flat') {
    markupAmount = markupValue
  }

  return { markupAmount, total: round2(baseCost + markupAmount) }
}

export function distributeRoundingDiff(
  allocations: Array<{ pieces: number; baseCost: number }>,
  totalCost: number,
): Array<{ pieces: number; baseCost: number }> {
  if (allocations.length === 0) return allocations

  const sumRecoverable = round2(allocations.reduce((s, a) => s + a.baseCost, 0))
  const diff = round2(totalCost - sumRecoverable)

  if (diff === 0) return allocations

  const result = allocations.map(a => ({ ...a }))
  const largestIdx = result.reduce(
    (maxIdx, a, i) => a.pieces > result[maxIdx].pieces ? i : maxIdx,
    0,
  )
  result[largestIdx].baseCost = round2(result[largestIdx].baseCost + diff)
  return result
}

export function processShipment(
  reference: string,
  totalCost: number,
  suppliers: Record<string, number>,
  markupRules?: Record<string, { markupType: MarkupType; markupValue: number }>,
  clientName?: string | null,
): ParsedShipment {
  const totalPieces = Object.values(suppliers).reduce((s, p) => s + p, 0)
  const perPieceCost = calcPerPieceCost(totalCost, totalPieces)

  // Build initial allocations for suppliers with pieces > 0
  const activeEntries = Object.entries(suppliers).filter(([, p]) => p > 0)

  let rawAllocations = activeEntries.map(([supplierName, pieces]) => ({
    supplierName,
    pieces,
    baseCost: round2(calcBaseCost(pieces, perPieceCost)),
  }))

  // Distribute rounding difference across 2dp baseCost values
  const corrected = distributeRoundingDiff(
    rawAllocations.map(a => ({ pieces: a.pieces, baseCost: a.baseCost })),
    totalCost,
  )
  rawAllocations = rawAllocations.map((a, i) => ({ ...a, baseCost: corrected[i].baseCost }))

  const allocations: ParsedAllocation[] = rawAllocations.map(a => {
    const rule = markupRules?.[a.supplierName]
    const markupType  = rule?.markupType  ?? 'none'
    const markupValue = rule?.markupValue ?? 0
    const { markupAmount, total } = applyMarkup(a.baseCost, markupType, markupValue)

    return {
      supplierName:      a.supplierName,
      pieces:            a.pieces,
      baseCost:          a.baseCost,
      markupType,
      markupValue,
      markupAmount,
      recoverableAmount: total,
    }
  })

  return { reference, totalCost, totalPieces, perPieceCost, shipmentDate: null, clientName: clientName ?? null, allocations }
}
