// Rebuilding position state from the immutable trade log. PURE.
//
// This is the Lab's reconciliation primitive (correctness pass, item 1). If an
// invocation dies after writing a trade but before updating lab_positions, the
// mutable state and the immutable record disagree. Rather than guess, we replay:
// lab_trades is append-only and complete, so the position it implies is the
// truth, and re-deriving it is deterministic.
//
// The arithmetic mirrors engine.ts exactly — a buy adds (gross + costs) to the
// cost basis, a sell removes a proportional slice of it — so a replay of the
// engine's own trades reproduces the engine's own state.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000

export interface ReplayTrade {
  ts: string
  side: 'buy' | 'sell'
  symbol: string
  exchange: string
  quantity: number
  gross_amount: number
  costs_total: number
  cash_after?: number | null
}

export interface ReplayedPosition {
  symbol: string
  exchange: string
  quantity: number
  cost_basis: number
  closed: boolean
}

/** Position implied by every trade in `trades` for one symbol, in ts order. */
export function replayPosition(trades: ReplayTrade[], symbol: string, exchange: string): ReplayedPosition {
  const sym = symbol.toUpperCase()
  const rows = trades
    .filter(t => t.symbol.toUpperCase() === sym && t.exchange === exchange)
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))

  let quantity = 0
  let costBasis = 0
  for (const t of rows) {
    const qty = Number(t.quantity || 0)
    if (t.side === 'buy') {
      quantity = round4(quantity + qty)
      costBasis = round2(costBasis + Number(t.gross_amount || 0) + Number(t.costs_total || 0))
    } else {
      if (quantity <= 0) continue
      const proportion = Math.min(1, qty / quantity)
      costBasis = round2(costBasis - round2(costBasis * proportion))
      quantity = round4(quantity - Math.min(qty, quantity))
    }
  }
  return { symbol: sym, exchange, quantity, cost_basis: quantity > 0 ? costBasis : 0, closed: quantity <= 0 }
}

/** The most recent trade in a set, or null. Used to decide whether a recorded
 *  cash_after is still the authoritative one. */
export function latestTrade(trades: ReplayTrade[]): ReplayTrade | null {
  if (!trades.length) return null
  return [...trades].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))[trades.length - 1]
}
