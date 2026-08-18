// Simulated execution engine (brief §7). PURE and DETERMINISTIC: given the same
// state, order and price it always produces the same trade. It enforces the risk
// constraints (cash floor, ≤max single %, ≤max sector %, no shorting, penny/data-
// confidence guards), applies realistic costs, and returns a new state plus the
// trade + whatever the caller should persist. It NEVER reaches a broker.
//
// Constraints are checked against pre-trade NAV (cash + marked positions). A buy
// that would breach the single-name or sector ceiling is CAPPED to the largest
// compliant whole-share quantity rather than rejected outright; if nothing fits,
// it is refused with the binding reason.
//
// Correctness pass (item 6): the cash floor (min_cash_pct) is enforced here, and
// the SAME constraints object is handed to the recommendation layer via
// config.toDecideConfig — the two layers can no longer disagree.

import { computeCosts } from './costs'
import type { LabState, BuyOrder, SellOrder, EngineResult, MarkedPosition, TradeRecord } from './types'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const posValue = (p: MarkedPosition) => (p.price != null ? p.price * p.quantity : p.cost_basis)

function clone(state: LabState): LabState {
  return { ...state, positions: state.positions.map(p => ({ ...p })) }
}

function tradeRecord(side: 'buy' | 'sell', o: { symbol: string; exchange: BuyOrder['exchange'] }, c: ReturnType<typeof computeCosts>, cashAfter: number, realized: number | null): TradeRecord {
  return {
    side, symbol: o.symbol, exchange: o.exchange, quantity: c.quantity, price: c.execPrice,
    gross_amount: c.gross, costs_total: c.chargesTotal,
    costs_breakdown: { ...c.charges, slippage: c.slippageCost },
    cash_after: round2(cashAfter), realized_pnl: realized,
  }
}

export function simulateBuy(state: LabState, order: BuyOrder): EngineResult {
  const { constraints: k, cost_model: m } = state
  const requestedQty = Math.floor(order.quantity)
  const fail = (reason: string): EngineResult => ({ ok: false, reason, capped: false, requestedQty, filledQty: 0, trade: null, state })

  if (requestedQty <= 0) return fail('Quantity must be positive.')
  if (!Number.isFinite(order.price) || order.price <= 0) return fail('No valid execution price — refusing to fabricate one.')
  if (order.price < k.min_price) return fail(`Below penny-stock guard (₹${order.price} < ₹${k.min_price}).`)
  if (order.dataConfidence != null && order.dataConfidence < k.min_data_confidence) {
    return fail(`Data confidence ${order.dataConfidence} below floor ${k.min_data_confidence} — no buy.`)
  }

  const navBase = round2(state.cash + state.positions.reduce((t, p) => t + posValue(p), 0))
  const existingName = posValue(state.positions.find(p => p.symbol === order.symbol && p.exchange === order.exchange)
    ?? ({ price: 0, quantity: 0, cost_basis: 0 } as MarkedPosition))
  const sector = order.sector ?? null
  const existingSector = sector
    ? state.positions.filter(p => (p.sector ?? null) === sector).reduce((t, p) => t + posValue(p), 0)
    : 0

  const maxNameValue = (k.max_single_pct / 100) * navBase
  const maxSectorValue = (k.max_sector_pct / 100) * navBase
  const allowedByName = maxNameValue - existingName
  const allowedBySector = sector ? maxSectorValue - existingSector : Infinity

  // Cash ceiling: per-share gross×(1+charge-rate-on-gross), minus any flat
  // brokerage, and never dipping below the account's cash floor.
  const cashFloor = ((k.min_cash_pct ?? 0) / 100) * navBase
  const spendable = Math.max(0, state.cash - cashFloor - m.brokerage_flat)
  const perShareGross = order.price * (1 + m.slippage_pct)
  const chargeRate = m.brokerage_pct + m.stt_pct + m.exchange_pct + m.sebi_pct + m.stamp_pct_buy
    + m.gst_pct * (m.brokerage_pct + m.exchange_pct + m.sebi_pct)
  const cashPerShare = perShareGross * (1 + chargeRate)
  const maxQtyByCash = Math.floor(spendable / cashPerShare)
  const maxQtyByName = Math.floor(Math.max(0, allowedByName) / order.price)
  const maxQtyBySector = allowedBySector === Infinity ? Infinity : Math.floor(Math.max(0, allowedBySector) / order.price)

  const filledQty = Math.min(requestedQty, maxQtyByName, maxQtyBySector, maxQtyByCash)
  if (!Number.isFinite(filledQty) || filledQty <= 0) {
    const binding = maxQtyByCash <= 0
      ? (cashFloor > 0 && state.cash > cashFloor ? `cash floor ${k.min_cash_pct}% of NAV reached` : 'insufficient cash')
      : maxQtyByName <= 0 ? `single-name limit ${k.max_single_pct}% reached`
      : `sector limit ${k.max_sector_pct}% reached`
    return fail(`No compliant quantity available (${binding}).`)
  }

  const c = computeCosts({ side: 'buy', price: order.price, quantity: filledQty, model: m })
  const cashAfter = round2(state.cash + c.cashDelta)
  const paid = round2(-c.cashDelta)   // gross + charges

  const next = clone(state)
  next.cash = cashAfter
  const existing = next.positions.find(p => p.symbol === order.symbol && p.exchange === order.exchange)
  if (existing) {
    existing.quantity = round2(existing.quantity + filledQty)
    existing.cost_basis = round2(existing.cost_basis + paid)
    existing.price = order.price
    existing.price_source = 'live'
    existing.stale = false
    if (order.pricedAt) existing.priced_at = order.pricedAt
    if (sector && !existing.sector) existing.sector = sector
  } else {
    next.positions.push({
      symbol: order.symbol, exchange: order.exchange, company_name: order.company_name ?? null,
      quantity: filledQty, cost_basis: paid, price: order.price,
      price_source: 'live', priced_at: order.pricedAt ?? null, stale: false,
      sector, market_cap_band: order.market_cap_band ?? null,
    })
  }

  return {
    ok: true, capped: filledQty < requestedQty, requestedQty, filledQty,
    trade: tradeRecord('buy', order, c, cashAfter, null), state: next,
  }
}

export function simulateSell(state: LabState, order: SellOrder): EngineResult {
  const { cost_model: m } = state
  const requestedQty = Math.floor(order.quantity)
  const fail = (reason: string): EngineResult => ({ ok: false, reason, capped: false, requestedQty, filledQty: 0, trade: null, state })

  const held = state.positions.find(p => p.symbol === order.symbol && p.exchange === order.exchange)
  if (!held || held.quantity <= 0) return fail('No position to sell (no shorting).')
  if (requestedQty <= 0) return fail('Quantity must be positive.')
  // Item 5: an execution price must be a real one. Never fall back to cost basis.
  if (!Number.isFinite(order.price) || order.price <= 0) return fail('No valid execution price — refusing to fabricate one.')

  const filledQty = Math.min(requestedQty, Math.floor(held.quantity))   // clamp — never short
  const c = computeCosts({ side: 'sell', price: order.price, quantity: filledQty, model: m })
  const cashAfter = round2(state.cash + c.cashDelta)

  const proportion = filledQty / held.quantity
  const costBasisSold = round2(held.cost_basis * proportion)
  const netProceeds = c.cashDelta   // gross − charges (positive)
  const realized = round2(netProceeds - costBasisSold)

  const next = clone(state)
  next.cash = cashAfter
  const p = next.positions.find(x => x.symbol === order.symbol && x.exchange === order.exchange)!
  p.quantity = round2(p.quantity - filledQty)
  p.cost_basis = round2(p.cost_basis - costBasisSold)
  p.price = order.price
  p.price_source = 'live'
  p.stale = false
  if (order.pricedAt) p.priced_at = order.pricedAt
  const closed = p.quantity <= 0
  if (closed) next.positions = next.positions.filter(x => !(x.symbol === order.symbol && x.exchange === order.exchange))

  return {
    ok: true, capped: filledQty < requestedQty, requestedQty, filledQty,
    trade: tradeRecord('sell', order, c, cashAfter, realized), state: next, closed,
  }
}
