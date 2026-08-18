// Realistic Indian delivery-equity transaction costs (brief §4). Pure and
// documented; every rate lives in the account's cost_model so it can change
// later without touching this logic. We do NOT pretend trading is free.
//
// Model (delivery / CNC), applied to executed turnover (after slippage):
//   • Slippage — adverse price move (buy fills higher, sell fills lower).
//   • Brokerage — flat + %; default ₹0 (discount-broker delivery).
//   • STT — both sides.
//   • Exchange transaction charge — both sides.
//   • SEBI turnover fee — both sides.
//   • Stamp duty — BUY side only.
//   • GST — on (brokerage + exchange + SEBI).
// Conservative by design: where a rate is uncertain we keep the documented
// default rather than understating drag.

import type { CostModel, CostResult, Charges } from './types'

export const DEFAULT_COST_MODEL: CostModel = {
  brokerage_pct: 0,
  brokerage_flat: 0,
  stt_pct: 0.001,        // 0.10%
  exchange_pct: 0.0000297, // ~0.00297%
  sebi_pct: 0.000001,    // ₹10 per crore
  stamp_pct_buy: 0.00015, // 0.015% buy only
  gst_pct: 0.18,
  slippage_pct: 0.001,   // 0.10% adverse
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeCosts(params: {
  side: 'buy' | 'sell'
  price: number
  quantity: number
  model?: CostModel
}): CostResult {
  const m = params.model ?? DEFAULT_COST_MODEL
  const { side, price, quantity } = params

  const execPrice = round2(side === 'buy' ? price * (1 + m.slippage_pct) : price * (1 - m.slippage_pct))
  const gross = round2(execPrice * quantity)
  const slippageCost = round2(Math.abs(execPrice - price) * quantity)

  const brokerage = round2(gross * m.brokerage_pct + m.brokerage_flat)
  const stt = round2(gross * m.stt_pct)
  const exchange = round2(gross * m.exchange_pct)
  const sebi = round2(gross * m.sebi_pct)
  const stamp = side === 'buy' ? round2(gross * m.stamp_pct_buy) : 0
  const gst = round2((brokerage + exchange + sebi) * m.gst_pct)

  const charges: Charges = { brokerage, stt, exchange, sebi, stamp, gst }
  const chargesTotal = round2(brokerage + stt + exchange + sebi + stamp + gst)

  // Buy: cash leaves = gross + charges. Sell: cash arrives = gross − charges.
  const cashDelta = side === 'buy' ? -round2(gross + chargesTotal) : round2(gross - chargesTotal)

  return { side, requestedPrice: price, execPrice, quantity, gross, charges, chargesTotal, slippageCost, cashDelta }
}
