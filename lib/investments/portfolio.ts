// Portfolio analytics (brief §8). Pure and deterministic — the numbers here feed
// both the dashboard and the portfolio-AWARE recommender (§9), so they are
// unit-tested rather than trusted.
//
// Reuses the Assets module's honest stock maths (lib/assets/stocks.ts): a
// holding with no price is "unpriced" and excluded from value, never counted as
// zero. Weights are computed over PRICED value only, and unpriced names are
// named so the user knows the picture is partial.

import { stockCost, stockValue } from '@/lib/assets/stocks'

export interface PortfolioHolding {
  symbol: string
  exchange?: string
  quantity: number
  avg_cost: number
  last_price: number | null
  sector?: string | null
  market_cap_band?: string | null
}

export interface HoldingLine {
  symbol: string
  sector: string
  value: number | null       // null = unpriced
  cost: number
  weightPct: number          // over priced value; 0 for unpriced
}

export interface PortfolioSummary {
  totalValue: number         // priced only
  totalInvested: number      // cost of priced holdings
  gain: number
  gainPct: number | null
  unpriced: string[]         // symbols with no price — NOT in totalValue
  lines: HoldingLine[]
  sectorAlloc: Record<string, number>   // % of priced value
  capAlloc: Record<string, number>      // % of priced value by market-cap band
  concentration: {
    topWeightPct: number
    top3Pct: number
    hhi: number              // Herfindahl index (0–10000), higher = more concentrated
    maxSector: string | null
    maxSectorPct: number
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const UNKNOWN_SECTOR = 'Unknown'

export function analyzePortfolio(holdings: PortfolioHolding[]): PortfolioSummary {
  const priced: { h: PortfolioHolding; value: number; cost: number }[] = []
  const unpriced: string[] = []
  let totalInvested = 0

  for (const h of holdings) {
    const cost = stockCost({ quantity: h.quantity, avg_cost: h.avg_cost })
    const value = stockValue({ quantity: h.quantity, avg_cost: h.avg_cost, last_price: h.last_price ?? undefined })
    if (value === null) { unpriced.push(h.symbol.toUpperCase()); continue }
    priced.push({ h, value, cost })
    totalInvested += cost
  }

  const totalValue = round2(priced.reduce((t, p) => t + p.value, 0))
  const gain = round2(totalValue - round2(totalInvested))
  const gainPct = totalInvested > 0 ? round2((gain / totalInvested) * 100) : null

  const lines: HoldingLine[] = holdings.map(h => {
    const cost = stockCost({ quantity: h.quantity, avg_cost: h.avg_cost })
    const value = stockValue({ quantity: h.quantity, avg_cost: h.avg_cost, last_price: h.last_price ?? undefined })
    return {
      symbol: h.symbol.toUpperCase(),
      sector: (h.sector && h.sector.trim()) || UNKNOWN_SECTOR,
      value,
      cost,
      weightPct: value !== null && totalValue > 0 ? round2((value / totalValue) * 100) : 0,
    }
  })

  const sectorAlloc: Record<string, number> = {}
  const capAlloc: Record<string, number> = {}
  for (const p of priced) {
    const sec = (p.h.sector && p.h.sector.trim()) || UNKNOWN_SECTOR
    const cap = (p.h.market_cap_band && p.h.market_cap_band.trim()) || 'unknown'
    const w = totalValue > 0 ? (p.value / totalValue) * 100 : 0
    sectorAlloc[sec] = round2((sectorAlloc[sec] ?? 0) + w)
    capAlloc[cap] = round2((capAlloc[cap] ?? 0) + w)
  }

  const weights = priced
    .map(p => (totalValue > 0 ? (p.value / totalValue) * 100 : 0))
    .sort((a, b) => b - a)
  const topWeightPct = round2(weights[0] ?? 0)
  const top3Pct = round2(weights.slice(0, 3).reduce((t, w) => t + w, 0))
  const hhi = Math.round(weights.reduce((t, w) => t + w * w, 0))

  let maxSector: string | null = null
  let maxSectorPct = 0
  for (const [sec, pct] of Object.entries(sectorAlloc)) {
    if (pct > maxSectorPct) { maxSectorPct = pct; maxSector = sec }
  }

  return {
    totalValue,
    totalInvested: round2(totalInvested),
    gain,
    gainPct,
    unpriced,
    lines,
    sectorAlloc,
    capAlloc,
    concentration: { topWeightPct, top3Pct, hhi, maxSector, maxSectorPct: round2(maxSectorPct) },
  }
}

/** Current portfolio weight of a sector (%), 0 if absent. */
export function sectorWeight(summary: PortfolioSummary, sector: string | null | undefined): number {
  const sec = (sector && sector.trim()) || UNKNOWN_SECTOR
  return summary.sectorAlloc[sec] ?? 0
}

/** Current weight of a single name (%), 0 if not held. */
export function nameWeight(summary: PortfolioSummary, symbol: string): number {
  return summary.lines.find(l => l.symbol === symbol.toUpperCase())?.weightPct ?? 0
}
