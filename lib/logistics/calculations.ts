import type {
  AllocationInput,
  AllocationResult,
  AWBCalculation,
  MarkupRule,
  MarkupType,
} from './types'

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

/**
 * Cost per piece = total AWB charge divided equally across all pieces.
 * @throws if totalPieces is 0
 */
export function calculatePerPieceCost(totalCharge: number, totalPieces: number): number {
  if (totalPieces === 0) throw new Error('totalPieces must be greater than 0')
  return round4(totalCharge / totalPieces)
}

/**
 * Apply markup to a base cost and enforce an optional minimum floor.
 */
export function applyMarkup(
  baseCost: number,
  markupType: MarkupType,
  markupValue: number,
  minimumAmount?: number,
): { markupAmount: number; billedAmount: number } {
  let billed: number
  switch (markupType) {
    case 'percentage':
      billed = baseCost * (1 + markupValue / 100)
      break
    case 'flat':
      billed = baseCost + markupValue
      break
    case 'none':
    default:
      billed = baseCost
  }

  if (minimumAmount !== undefined && billed < minimumAmount) {
    billed = minimumAmount
  }

  const billedAmount = round2(billed)
  const markupAmount = round2(billedAmount - round2(baseCost))
  return { markupAmount, billedAmount }
}

/**
 * Full AWB allocation calculation.
 * Distributes the AWB total charge across suppliers by piece count,
 * applies per-supplier markup rules, and returns margin summary.
 * @throws if inputs array is empty or any allocation has pieces <= 0
 */
export function calculateAWBAllocation(
  awbTotalCharge: number,
  inputs: AllocationInput[],
): AWBCalculation {
  if (inputs.length === 0) throw new Error('At least one allocation input required')

  const totalPieces = inputs.reduce((sum, a) => {
    if (a.pieces <= 0) throw new Error(`Pieces must be > 0 for customer ${a.customerId}`)
    return sum + a.pieces
  }, 0)

  const perPieceBaseCost = calculatePerPieceCost(awbTotalCharge, totalPieces)

  const allocations: AllocationResult[] = inputs.map(input => {
    const baseCost = round2(input.pieces * perPieceBaseCost)
    const { markupAmount, billedAmount } = applyMarkup(
      baseCost,
      input.markupType,
      input.markupValue,
      input.minimumAmount,
    )
    const effectiveAmount = input.overrideAmount !== undefined
      ? round2(input.overrideAmount)
      : billedAmount
    const perPieceRate = input.pieces > 0 ? round4(effectiveAmount / input.pieces) : 0

    return {
      ...input,
      baseCost,
      markupAmount,
      billedAmount,
      effectiveAmount,
      perPieceRate,
    }
  })

  const totalBilled = round2(allocations.reduce((s, a) => s + a.effectiveAmount, 0))
  const { margin, marginPct } = calculateMargin(awbTotalCharge, totalBilled)

  return {
    awbId: '',        // caller fills in after DB round-trip
    awbNumber: '',
    totalCharge: round2(awbTotalCharge),
    totalPieces,
    perPieceBaseCost,
    allocations,
    totalBilled,
    totalMargin: margin,
    marginPct,
  }
}

/**
 * Gross margin between what was paid to the courier and what was billed to suppliers.
 */
export function calculateMargin(cost: number, billed: number): { margin: number; marginPct: number } {
  const margin = round2(billed - cost)
  const marginPct = cost === 0 ? 0 : round2((margin / cost) * 100)
  return { margin, marginPct }
}

/**
 * Find the best matching markup rule for a customer + courier combination.
 * Precedence: provider-specific rule > catch-all rule > default (none, 0%).
 */
export function resolveMarkupForCustomer(
  customerId: string,
  markupRules: MarkupRule[],
  courierProvider?: string,
): { markupType: MarkupType; markupValue: number; minimumAmount?: number } {
  const active = markupRules.filter(r => r.customer_id === customerId && r.is_active)

  const specific = courierProvider
    ? active.find(r => r.courier_provider === courierProvider)
    : undefined
  if (specific) {
    return {
      markupType: specific.markup_type,
      markupValue: specific.markup_value,
      minimumAmount: specific.minimum_amount ?? undefined,
    }
  }

  const general = active.find(r => r.courier_provider === null)
  if (general) {
    return {
      markupType: general.markup_type,
      markupValue: general.markup_value,
      minimumAmount: general.minimum_amount ?? undefined,
    }
  }

  return { markupType: 'none', markupValue: 0 }
}

/**
 * Roll up a set of AWB calculations into a single profitability summary.
 */
export function summariseAWBSet(calculations: AWBCalculation[]): {
  totalCost: number
  totalBilled: number
  totalMargin: number
  marginPct: number
} {
  const totalCost = round2(calculations.reduce((s, c) => s + c.totalCharge, 0))
  const totalBilled = round2(calculations.reduce((s, c) => s + c.totalBilled, 0))
  const { margin: totalMargin, marginPct } = calculateMargin(totalCost, totalBilled)
  return { totalCost, totalBilled, totalMargin, marginPct }
}
