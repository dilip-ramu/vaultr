// The numbers across the top of the Orders page.
//
// The question it answers is the one you ask walking into the office: how
// much is tied up, how much is still to come in, how much do I owe, and how
// much have I actually made this far.
//
// PENDING vs REALISED is the distinction that matters, and the app is strict
// about it. Profit on an open order is a forecast — real bills can still
// arrive, the rate can still move. Profit on a closed order happened. Adding
// the two together and calling it profit would flatter every month.

export interface OrderSummaryRow {
  stage: string
  /** Net profit in rupees — the best figure available for this order. */
  net: number
  /** What the customer is being charged, in rupees. */
  valueInr: number
  /** Still to collect from the customer, in rupees. */
  receivable: number
  /** Still to pay the supplier, in rupees. */
  payable: number
  /** Duty drawback expected but not yet received, in rupees. */
  drawbackDue: number
  /** Units still to ship. */
  shipBalance: number
}

export interface OrdersSummary {
  openCount: number
  closedCount: number
  /** Value of the open orders — what is tied up right now. */
  openValue: number
  /** Profit the open orders should make. A forecast. */
  pendingProfit: number
  /** Profit the closed orders did make. */
  realisedProfit: number
  /** Still to come in from customers. */
  receivable: number
  /** Still to go out to suppliers. */
  payable: number
  drawbackDue: number
  /** receivable + drawback − payable: what the open book is worth in cash. */
  netExpected: number
  /** Margin across the open orders, weighted by value rather than averaged
   *  per order — a ₹40 lakh order at 11% matters more than a ₹2 lakh one at 30%. */
  openMarginPct: number
  /** Units still to ship across every open order. */
  toShip: number
}

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const num = (n: number) => (Number.isFinite(n) ? n : 0)

const OPEN = new Set(['enquiry', 'confirmed', 'ordered', 'shipped', 'invoiced'])

export function summariseOrders(rows: readonly OrderSummaryRow[]): OrdersSummary {
  let openCount = 0, closedCount = 0
  let openValue = 0, pendingProfit = 0, realisedProfit = 0
  let receivable = 0, payable = 0, drawbackDue = 0, toShip = 0

  for (const r of rows) {
    const open = OPEN.has(r.stage)
    if (open) {
      openCount++
      openValue += num(r.valueInr)
      pendingProfit += num(r.net)
      toShip += num(r.shipBalance)
    } else if (r.stage === 'closed') {
      closedCount++
      realisedProfit += num(r.net)
    }
    // Cancelled orders count for nothing anywhere — but money already owed on
    // one is still owed, so the two sides are tracked for every order that is
    // not cancelled.
    if (r.stage !== 'cancelled') {
      receivable += num(r.receivable)
      payable += num(r.payable)
      drawbackDue += num(r.drawbackDue)
    }
  }

  return {
    openCount, closedCount,
    openValue: r2(openValue),
    pendingProfit: r2(pendingProfit),
    realisedProfit: r2(realisedProfit),
    receivable: r2(receivable),
    payable: r2(payable),
    drawbackDue: r2(drawbackDue),
    netExpected: r2(receivable + drawbackDue - payable),
    openMarginPct: openValue ? r2((pendingProfit / openValue) * 100) : 0,
    toShip: r2(toShip),
  }
}
