// What you made on one order.
//
// TWO COLUMNS, NOT ONE. Planned is what you costed at when you agreed the
// supplier price. Actual is what the real bills and the real bank rate turned
// out to be. The gap between them is the only honest answer to "am I pricing
// this right", and you cannot see it from a single column.
//
// ORDER OF OPERATIONS matters and is fixed:
//   customer value (foreign) × rate = customer value in INR
//   − supplier cost                 = GROSS MARGIN
//   + duty drawback
//   ± cost and adjustment lines
//                                   = NET PROFIT
//
// Cost lines may be a percentage of customer value, supplier cost or gross
// margin — all three are known before any cost line is applied, so there is no
// circularity. A percentage of NET is deliberately not offered: it would
// depend on itself, and the answer would change depending on the order the
// lines happened to be in.
//
// Pure. No database, no React. The sheet shows money, and money arithmetic
// that nobody can test is money arithmetic nobody should trust.

/** What a percentage line is a percentage OF. */
export type CostBasis = 'flat' | 'pct_customer' | 'pct_supplier' | 'pct_gross'

export interface CostLine {
  name: string
  /** +1 adds to profit (a rebate received), −1 takes away (freight). */
  sign: 1 | -1
  basis: CostBasis
  /** Rupees when basis is 'flat', otherwise a percentage. */
  planned: number
  /** What it really came to. null = not known yet; the planned figure stands in. */
  actual?: number | null
}

export type DrawbackBasis = 'percent' | 'amount'

export interface Drawback {
  basis: DrawbackBasis
  /** A percentage of FOB, or a flat rupee amount. */
  value: number
  /** What really landed. null = not yet received. */
  actual?: number | null
}

export interface OrderMoney {
  /** Foreign-currency value you costed at. For a domestic order, the INR value. */
  customerValuePlanned: number
  /** Foreign-currency value actually invoiced (sum of the customer invoices). */
  customerValueActual: number
  /** INR per 1 unit of currency, as costed. 1 for a domestic order. */
  bookedRate: number
  /** INR per 1 unit the bank actually gave. null = not paid yet; booked rate stands in. */
  realisedRate?: number | null
  /** INR you expected to pay the supplier (quantity × agreed cost rate). */
  supplierCostPlanned: number
  /** INR actually billed by the supplier (sum of the supplier bills). */
  supplierCostActual: number
  drawback?: Drawback | null
  costs?: readonly CostLine[]
}

export interface CostAmount {
  name: string
  /** Signed rupees: negative takes away from profit. */
  amount: number
  /** True when this column fell back to the planned figure. */
  estimated: boolean
}

export interface MarginColumn {
  /** Value in the order's own currency. */
  customerValueFx: number
  rate: number
  customerValueInr: number
  supplierCost: number
  gross: number
  drawback: number
  costs: CostAmount[]
  /** Signed sum of the cost lines. */
  costTotal: number
  net: number
  /** Net profit as a percentage of what you invoiced. 0 when you invoiced nothing. */
  marginPct: number
}

export interface Margin {
  planned: MarginColumn
  actual: MarginColumn
  /**
   * What the exchange rate did to you, in rupees. Positive means the bank gave
   * you more than you costed at. Always 0 on a domestic order.
   */
  fxEffect: number
  /**
   * False while any figure in the Actual column is still standing in for a
   * real one. The sheet must say so rather than presenting a guess as a fact.
   */
  actualIsComplete: boolean
}

/** Money is shown to the paisa, so it is settled to the paisa. */
const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const num = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

function drawbackAmount(d: Drawback | null | undefined, customerValueInr: number, useActual: boolean): number {
  if (!d) return 0
  if (useActual && typeof d.actual === 'number' && Number.isFinite(d.actual)) return d.actual
  return d.basis === 'percent' ? customerValueInr * (num(d.value) / 100) : num(d.value)
}

function costAmount(c: CostLine, col: { customerValueInr: number; supplierCost: number; gross: number }, useActual: boolean) {
  const known = useActual && typeof c.actual === 'number' && Number.isFinite(c.actual)
  const v = known ? (c.actual as number) : num(c.planned)
  const size =
    c.basis === 'flat'         ? v
    : c.basis === 'pct_customer' ? col.customerValueInr * (v / 100)
    : c.basis === 'pct_supplier' ? col.supplierCost     * (v / 100)
    :                              col.gross            * (v / 100)
  return { name: c.name, amount: r2((c.sign === 1 ? 1 : -1) * size), estimated: useActual && !known }
}

function column(
  customerValueFx: number,
  rate: number,
  supplierCost: number,
  drawback: Drawback | null | undefined,
  costs: readonly CostLine[],
  useActual: boolean,
): MarginColumn {
  const customerValueInr = r2(customerValueFx * rate)
  const gross = r2(customerValueInr - supplierCost)
  const db = r2(drawbackAmount(drawback, customerValueInr, useActual))
  const base = { customerValueInr, supplierCost, gross }
  const lines = costs.map(c => costAmount(c, base, useActual))
  const costTotal = r2(lines.reduce((t, l) => t + l.amount, 0))
  const net = r2(gross + db + costTotal)
  return {
    customerValueFx: r2(customerValueFx),
    rate,
    customerValueInr,
    supplierCost: r2(supplierCost),
    gross,
    drawback: db,
    costs: lines,
    costTotal,
    net,
    marginPct: customerValueInr ? r2((net / customerValueInr) * 100) : 0,
  }
}

export function computeMargin(m: OrderMoney): Margin {
  const costs = m.costs ?? []
  const booked = num(m.bookedRate) || 1
  const hasRealised = typeof m.realisedRate === 'number' && Number.isFinite(m.realisedRate) && m.realisedRate > 0
  const realised = hasRealised ? (m.realisedRate as number) : booked

  const planned = column(num(m.customerValuePlanned), booked, num(m.supplierCostPlanned), m.drawback, costs, false)
  const actual  = column(num(m.customerValueActual),  realised, num(m.supplierCostActual),  m.drawback, costs, true)

  // What the rate did, measured on what was actually invoiced — comparing it
  // against the planned value would mix a pricing change into an FX number.
  const fxEffect = r2(num(m.customerValueActual) * (realised - booked))

  const drawbackKnown = !m.drawback || (typeof m.drawback.actual === 'number' && Number.isFinite(m.drawback.actual))
  const costsKnown = costs.every(c => typeof c.actual === 'number' && Number.isFinite(c.actual))
  const actualIsComplete = hasRealised && drawbackKnown && costsKnown
    && num(m.customerValueActual) > 0 && num(m.supplierCostActual) > 0

  return { planned, actual, fxEffect, actualIsComplete }
}

// ── Reading the order's own lines ───────────────────────────────────────────

export interface OrderLine {
  qty: number
  /** Order currency, per unit. */
  sellRate: number
  /** INR, per unit, agreed with the supplier. */
  costRate: number
  shippedQty?: number
}

/** What the order lines add up to — the Planned column's two big numbers. */
export function plannedFromLines(lines: readonly OrderLine[]): { customerValue: number; supplierCost: number } {
  let customerValue = 0
  let supplierCost = 0
  for (const l of lines) {
    customerValue += num(l.qty) * num(l.sellRate)
    supplierCost  += num(l.qty) * num(l.costRate)
  }
  return { customerValue: r2(customerValue), supplierCost: r2(supplierCost) }
}

/** Part shipments: how much of the order has gone, and what is left. */
export function shipmentProgress(lines: readonly OrderLine[]): { ordered: number; shipped: number; balance: number; pct: number } {
  let ordered = 0, shipped = 0
  for (const l of lines) {
    ordered += num(l.qty)
    shipped += Math.min(num(l.shippedQty), num(l.qty))
  }
  return {
    ordered: r2(ordered),
    shipped: r2(shipped),
    balance: r2(ordered - shipped),
    pct: ordered ? r2((shipped / ordered) * 100) : 0,
  }
}
