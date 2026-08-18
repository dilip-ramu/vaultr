// Performance metrics (brief §10 + total-return clarification). PURE. Honest
// about sample size (ratios return null until enough observations) AND about
// what it compares: the portfolio return already INCLUDES dividends (they were
// credited to cash), so alpha is computed against a TOTAL-RETURN benchmark —
// the price index adjusted by a documented assumed dividend yield. We never
// compare a dividend-inclusive portfolio to a price-only index and call the gap
// alpha.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const TRADING_DAYS = 252
const DEFAULT_BENCH_YIELD = 0.013   // ~1.3%/yr assumed index dividend yield (documented, configurable)

export interface NavPoint {
  as_of: string
  total_value: number
  /** 'fresh' | 'stale' — 'incomplete' rows are never written, but if one ever
   *  appears it is excluded from the return series rather than trusted. */
  data_quality?: string | null
}
export interface BenchPoint { as_of: string; nifty50_value: number | null; nifty500_value: number | null }
export interface ClosedTrade { realized_pnl: number; holding_days?: number | null }

export interface Metrics {
  observations: number
  /** Observations valued with at least one carried-forward price. */
  staleObservations: number
  /** Rows dropped as duplicates or as untrustworthy. */
  droppedObservations: number
  closedCount: number
  totalReturnPct: number | null       // includes dividends (NAV-based)
  priceReturnPct: number | null       // total − dividend
  dividendReturnPct: number | null
  cagrPct: number | null
  volatilityPct: number | null
  maxDrawdownPct: number | null
  sharpe: number | null
  sortino: number | null
  alphaNifty50Pct: number | null      // total-return basis
  alphaNifty500Pct: number | null
  benchmarkBasis: string
  winRatePct: number | null
  avgWin: number | null
  avgLoss: number | null
  profitFactor: number | null
  avgHoldingDays: number | null
  cashPct: number | null
  turnoverPct: number | null
  ratiosSufficient: boolean
}

export interface MetricsInput {
  navHistory: NavPoint[]
  benchmarks?: BenchPoint[]
  closedTrades?: ClosedTrade[]
  startingCapital: number
  latestCash?: number
  dividendsCum?: number               // cumulative net dividends received
  tradedValue?: number
  minObs?: number
  rfAnnual?: number
  benchmarkYieldAnnual?: number       // assumed index dividend yield for TR approx
}

function daysBetween(a: string, b: string): number { return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000 }
function mean(xs: number[]): number { return xs.reduce((t, x) => t + x, 0) / xs.length }
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / (xs.length - 1))
}

export function computeMetrics(input: MetricsInput): Metrics {
  // One observation per TRADING SESSION. NAV rows are keyed by session date, but
  // a defensive de-dupe keeps the return series honest even if two rows for the
  // same day ever reach here — a duplicate would otherwise inject a guaranteed
  // 0% return and quietly deflate measured volatility (item 8).
  const byDate = new Map<string, NavPoint>()
  let dropped = 0
  for (const p of input.navHistory) {
    if (p.data_quality === 'incomplete') { dropped++; continue }
    if (byDate.has(p.as_of)) dropped++
    byDate.set(p.as_of, p)
  }
  const nav = Array.from(byDate.values()).sort((a, b) => (a.as_of < b.as_of ? -1 : 1))
  const staleObs = nav.filter(p => p.data_quality === 'stale').length
  const minObs = input.minObs ?? 20
  const rf = input.rfAnnual ?? 0.065
  const benchYield = input.benchmarkYieldAnnual ?? DEFAULT_BENCH_YIELD
  const closed = input.closedTrades ?? []
  const obs = nav.length

  const out: Metrics = {
    observations: obs, staleObservations: staleObs, droppedObservations: dropped,
    closedCount: closed.length,
    totalReturnPct: null, priceReturnPct: null, dividendReturnPct: null,
    cagrPct: null, volatilityPct: null, maxDrawdownPct: null, sharpe: null, sortino: null,
    alphaNifty50Pct: null, alphaNifty500Pct: null, benchmarkBasis: 'total-return (index price + assumed yield)',
    winRatePct: null, avgWin: null, avgLoss: null, profitFactor: null,
    avgHoldingDays: null, cashPct: null, turnoverPct: null, ratiosSufficient: false,
  }
  if (obs === 0) return out

  const first = nav[0], last = nav[obs - 1]
  const latestTotal = last.total_value

  // Total return already includes dividends (they were credited to cash).
  out.totalReturnPct = round2((latestTotal / input.startingCapital - 1) * 100)
  if (input.dividendsCum != null && input.startingCapital > 0) {
    out.dividendReturnPct = round2((input.dividendsCum / input.startingCapital) * 100)
    out.priceReturnPct = round2(out.totalReturnPct - out.dividendReturnPct)
  }

  if (input.latestCash != null && latestTotal > 0) out.cashPct = round2((input.latestCash / latestTotal) * 100)

  if (obs >= 2) {
    let peak = nav[0].total_value, maxDd = 0
    for (const p of nav) { peak = Math.max(peak, p.total_value); if (peak > 0) maxDd = Math.min(maxDd, (p.total_value - peak) / peak) }
    out.maxDrawdownPct = round2(maxDd * 100)
  }

  const years = daysBetween(first.as_of, last.as_of) / 365.25
  if (years >= 0.25 && input.startingCapital > 0 && latestTotal > 0) {
    out.cagrPct = round2((Math.pow(latestTotal / input.startingCapital, 1 / years) - 1) * 100)
  }

  const rets: number[] = []
  for (let i = 1; i < nav.length; i++) { const prev = nav[i - 1].total_value; if (prev > 0) rets.push(nav[i].total_value / prev - 1) }
  if (rets.length >= minObs) {
    out.ratiosSufficient = true
    const vol = stdev(rets) * Math.sqrt(TRADING_DAYS)
    out.volatilityPct = round2(vol * 100)
    const annRet = mean(rets) * TRADING_DAYS
    out.sharpe = vol > 0 ? round2((annRet - rf) / vol) : null
    const downside = rets.filter(r => r < 0)
    const dd = downside.length ? Math.sqrt(mean(downside.map(r => r * r))) * Math.sqrt(TRADING_DAYS) : 0
    out.sortino = dd > 0 ? round2((annRet - rf) / dd) : null
  }

  // Alpha vs TOTAL-RETURN benchmark (price index + assumed yield over the window).
  const bm = input.benchmarks && input.benchmarks.length ? input.benchmarks : null
  if (bm) {
    const b0 = bm[0], b1 = bm[bm.length - 1]
    const bmYears = daysBetween(b0.as_of, b1.as_of) / 365.25
    const portRet = latestTotal / input.startingCapital - 1
    const benchTR = (v0: number | null, v1: number | null): number | null => {
      if (v0 == null || v1 == null || v0 <= 0) return null
      const priceRet = v1 / v0 - 1
      return round2((portRet - (priceRet + benchYield * bmYears)) * 100)
    }
    out.alphaNifty50Pct = benchTR(b0.nifty50_value, b1.nifty50_value)
    out.alphaNifty500Pct = benchTR(b0.nifty500_value, b1.nifty500_value)
  }

  if (closed.length >= 1) {
    const wins = closed.filter(t => t.realized_pnl > 0)
    const losses = closed.filter(t => t.realized_pnl < 0)
    out.winRatePct = round2((wins.length / closed.length) * 100)
    out.avgWin = wins.length ? round2(mean(wins.map(t => t.realized_pnl))) : null
    out.avgLoss = losses.length ? round2(mean(losses.map(t => t.realized_pnl))) : null
    const grossWin = wins.reduce((t, x) => t + x.realized_pnl, 0)
    const grossLoss = Math.abs(losses.reduce((t, x) => t + x.realized_pnl, 0))
    out.profitFactor = grossLoss > 0 ? round2(grossWin / grossLoss) : (grossWin > 0 ? Infinity : null)
    const hold = closed.map(t => t.holding_days).filter((d): d is number => typeof d === 'number')
    out.avgHoldingDays = hold.length ? Math.round(mean(hold)) : null
  }

  if (input.tradedValue != null && obs >= 1) {
    const avgNav = mean(nav.map(p => p.total_value))
    if (avgNav > 0) out.turnoverPct = round2((input.tradedValue / avgNav) * 100)
  }

  return out
}
