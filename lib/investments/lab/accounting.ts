// Portfolio accounting (brief §8). Pure and deterministic.
//
// Correctness pass (item 2). The old rule — "no price today, so drop the
// position from NAV" — meant a Yahoo hiccup printed a fictitious loss into an
// append-only history and then a fictitious recovery the next day. Since NAV
// history is the sole input to volatility, Sharpe, drawdown and alpha, one bad
// fetch poisoned every metric for the life of the experiment.
//
// The rule now:
//   • Priced today            → value it, count it fresh.
//   • Fetch failed, but we have a previous valid price → value it at the CARRIED
//     price and flag the position (and the snapshot) as stale.
//   • Never had a valid price → the snapshot is INCOMPLETE. We do not value it,
//     do not zero it, and the caller must not persist a NAV row.

import type { MarkedPosition } from './types'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type NavQuality = 'fresh' | 'stale' | 'incomplete'

export interface NavSnapshot {
  cash: number
  positionsValue: number
  totalValue: number
  invested: number            // cost basis of currently-held (valued) positions
  unrealizedPnl: number
  holdingsCount: number
  /** Never had a valid price — NOT included in value, and a blocker. */
  unpriced: string[]
  /** Valued at a carried-forward price. */
  stale: string[]
  freshCount: number
  staleCount: number
  quality: NavQuality
  /** False when at least one held position has never had a price. */
  complete: boolean
}

export function computeNav(cash: number, positions: MarkedPosition[]): NavSnapshot {
  let positionsValue = 0
  let invested = 0
  const unpriced: string[] = []
  const stale: string[] = []
  let freshCount = 0

  for (const p of positions) {
    if (p.quantity <= 0) continue
    if (p.price == null || !(p.price > 0)) { unpriced.push(p.symbol.toUpperCase()); continue }
    positionsValue += p.price * p.quantity
    invested += p.cost_basis
    if (p.stale || p.price_source === 'carried') stale.push(p.symbol.toUpperCase())
    else freshCount++
  }
  positionsValue = round2(positionsValue)
  invested = round2(invested)

  const complete = unpriced.length === 0
  const quality: NavQuality = !complete ? 'incomplete' : (stale.length > 0 ? 'stale' : 'fresh')

  return {
    cash: round2(cash),
    positionsValue,
    totalValue: round2(cash + positionsValue),
    invested,
    unrealizedPnl: round2(positionsValue - invested),
    holdingsCount: positions.filter(p => p.quantity > 0).length,
    unpriced,
    stale,
    freshCount,
    staleCount: stale.length,
    quality,
    complete,
  }
}

/** Running peak + drawdown. peakSoFar is the prior peak (null on first mark). */
export function drawdown(totalValue: number, peakSoFar: number | null): { peak: number; drawdownPct: number } {
  const peak = Math.max(peakSoFar ?? totalValue, totalValue)
  const drawdownPct = peak > 0 ? round2(((totalValue - peak) / peak) * 100) : 0
  return { peak: round2(peak), drawdownPct }
}

/**
 * Decide how a position should be valued this session.
 * PURE — the caller supplies the live quote (or null) and the carried price.
 */
export function resolveMark(params: {
  livePrice: number | null
  liveAt: string | null
  carriedPrice: number | null | undefined
  carriedAt: string | null | undefined
}): { price: number | null; price_source: MarkedPosition['price_source']; priced_at: string | null; stale: boolean } {
  if (params.livePrice != null && params.livePrice > 0) {
    return { price: params.livePrice, price_source: 'live', priced_at: params.liveAt, stale: false }
  }
  if (params.carriedPrice != null && params.carriedPrice > 0) {
    return { price: params.carriedPrice, price_source: 'carried', priced_at: params.carriedAt ?? null, stale: true }
  }
  return { price: null, price_source: 'none', priced_at: null, stale: false }
}
