// Marking the Lab to market (brief §8, §9) — shared by the Research Update, the
// manual Mark action, and the Investment Cycle. Fetches live prices for held
// positions and the two benchmark indices, writes the session's NAV + benchmark
// snapshots (idempotent per trading session), and returns the marked state.
//
// Correctness pass:
//   • item 2 — a failed quote carries the last valid price forward and flags the
//     snapshot stale. A position that has NEVER been priced blocks the NAV write
//     entirely: an incomplete NAV is not written at all, because a wrong number
//     in an append-only history is worse than a gap.
//   • item 7 — benchmark values come from the baseline PINNED on the account at
//     creation. Nothing here ever derives a start level from a later mark.
//   • item 8 — the row is keyed by the trading SESSION date (IST, derived from
//     the index's own timestamp), so a 02:00 IST run cannot book yesterday and a
//     weekend run cannot invent an observation.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPrices, fetchIndexQuote, type Quote } from '../providers/price'
import { computeNav, drawdown, resolveMark, type NavSnapshot } from './accounting'
import { benchmarkValue } from './benchmarks'
import { resolveTradingDate, type TradingDateSource } from '../marketdate'
import type { LabAccount, MarkedPosition, Exchange, BenchmarkBaseline } from './types'

export const NIFTY50 = '^NSEI'
export const NIFTY500 = '^CRSLDX'

export interface BenchmarkMarks {
  nifty50_level: number | null
  nifty500_level: number | null
  nifty50_value: number | null
  nifty500_value: number | null
}

export interface MarkResult {
  tradingDate: string
  sessionSource: TradingDateSource
  sessionKnown: boolean
  markedPositions: MarkedPosition[]
  nav: NavSnapshot
  benchmarks: BenchmarkMarks
  drawdownPct: number
  /** False when the NAV row was deliberately NOT written. */
  navWritten: boolean
  skippedReason: string | null
  notes: string[]
}

export interface MarkOptions {
  now?: Date
  fetchPricesFn?: typeof fetchPrices
  fetchIndexQuoteFn?: (symbol: string) => Promise<Quote | null>
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Capture today's index levels — used ONLY at account creation to pin the
 *  baseline (item 7), never to repair a missing one later. */
export async function captureBenchmarkBaseline(
  opts: MarkOptions = {},
): Promise<{ baseline: BenchmarkBaseline | null; reason: string | null }> {
  const getIndex = opts.fetchIndexQuoteFn ?? fetchIndexQuote
  const [q50, q500] = await Promise.all([getIndex(NIFTY50), getIndex(NIFTY500)])
  const session = resolveTradingDate({ now: opts.now, indexMarketTimeSec: q50?.marketTime ?? q500?.marketTime ?? null })

  if (!q50?.price || !q500?.price) {
    const missing = [!q50?.price ? 'Nifty 50' : null, !q500?.price ? 'Nifty 500' : null].filter(Boolean).join(' and ')
    return { baseline: null, reason: `Could not read ${missing} right now. The baseline must be a real observed level, so the Lab stays pending until it can be captured.` }
  }
  return {
    baseline: {
      nifty50_level: q50.price,
      nifty500_level: q500.price,
      as_of: session.date,
      captured_at: (opts.now ?? new Date()).toISOString(),
      source: 'yahoo-finance',
    },
    reason: null,
  }
}

export async function markLab(
  supabase: SupabaseClient,
  userId: string,
  lab: LabAccount,
  opts: MarkOptions = {},
): Promise<MarkResult> {
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const getPrices = opts.fetchPricesFn ?? fetchPrices
  const getIndex = opts.fetchIndexQuoteFn ?? fetchIndexQuote
  const notes: string[] = []

  const { data: rawPositions } = await supabase
    .from('lab_positions').select('*').eq('lab_id', lab.id).eq('user_id', userId)
  const positions = (rawPositions ?? []) as any[]

  const [quoteRes, q50, q500] = await Promise.all([
    positions.length
      ? getPrices(positions.map(p => ({ symbol: p.symbol, exchange: (p.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange })))
      : Promise.resolve({ quotes: {} as Record<string, Quote>, failed: [] as string[] }),
    getIndex(NIFTY50),
    getIndex(NIFTY500),
  ])
  const quotes = quoteRes.quotes

  // Which trading session does this mark belong to? Ask the index first.
  const session = resolveTradingDate({ now, indexMarketTimeSec: q50?.marketTime ?? q500?.marketTime ?? null })
  if (session.note) notes.push(session.note)

  // ── Value every position: live → carried → never priced ───────────────────
  const marked: MarkedPosition[] = positions.map(p => {
    const live = quotes[String(p.symbol).toUpperCase()]
    const m = resolveMark({
      livePrice: live?.price ?? null,
      liveAt: live?.at ?? null,
      carriedPrice: p.last_price != null ? Number(p.last_price) : null,
      carriedAt: p.last_price_at ?? null,
    })
    return {
      symbol: p.symbol,
      exchange: (p.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange,
      company_name: p.company_name,
      quantity: Number(p.quantity),
      cost_basis: Number(p.cost_basis),
      sector: p.sector,
      market_cap_band: p.market_cap_band,
      last_price: p.last_price != null ? Number(p.last_price) : null,
      last_price_at: p.last_price_at ?? null,
      last_price_source: p.last_price_source ?? null,
      opened_at: p.opened_at ?? null,
      ...m,
    }
  })

  // Persist newly observed prices so the next failed fetch has something to
  // carry forward. Only live marks update the stored price.
  for (const p of marked) {
    if (p.price_source === 'live' && p.price != null) {
      await supabase.from('lab_positions')
        .update({ last_price: p.price, last_price_at: p.priced_at ?? nowIso, last_price_source: 'yahoo-finance', updated_at: nowIso })
        .eq('lab_id', lab.id).eq('user_id', userId).eq('symbol', p.symbol).eq('exchange', p.exchange)
    }
  }

  // ── Benchmarks against the PINNED baseline ────────────────────────────────
  const base = lab.benchmark_start ?? null
  const benchmarks: BenchmarkMarks = {
    nifty50_level: q50?.price ?? null,
    nifty500_level: q500?.price ?? null,
    nifty50_value: benchmarkValue(base?.nifty50_level ?? null, q50?.price ?? null, lab.starting_capital),
    nifty500_value: benchmarkValue(base?.nifty500_level ?? null, q500?.price ?? null, lab.starting_capital),
  }
  if (!base) notes.push('No benchmark baseline is pinned on this Lab, so benchmark values cannot be computed.')

  const nav = computeNav(lab.cash, marked)
  if (nav.staleCount > 0) notes.push(`Valued at a carried-forward price (stale): ${nav.stale.join(', ')}.`)

  // Benchmark levels are market data and are always worth recording.
  await supabase.from('lab_benchmarks').upsert({
    lab_id: lab.id, user_id: userId, as_of: session.date, ...benchmarks,
  }, { onConflict: 'lab_id,as_of' })

  // ── The NAV row: written only when it can be trusted ──────────────────────
  if (!nav.complete) {
    const reason = `NAV not recorded for ${session.date}: ${nav.unpriced.join(', ')} ${nav.unpriced.length === 1 ? 'has' : 'have'} never had a valid price, so any total would be misleading. Fix pricing for ${nav.unpriced.length === 1 ? 'that name' : 'those names'} and re-mark.`
    notes.push(reason)
    return {
      tradingDate: session.date, sessionSource: session.source, sessionKnown: session.sessionKnown,
      markedPositions: marked, nav, benchmarks, drawdownPct: 0,
      navWritten: false, skippedReason: reason, notes,
    }
  }

  const { data: prevPeakRow } = await supabase.from('lab_nav_history').select('peak')
    .eq('lab_id', lab.id).lte('as_of', session.date).order('as_of', { ascending: false }).limit(1)
  const { data: realizedRow } = await supabase.from('lab_trades').select('realized_pnl').eq('lab_id', lab.id).not('realized_pnl', 'is', null)
  const realizedCum = (realizedRow ?? []).reduce((t: number, r: any) => t + Number(r.realized_pnl || 0), 0)
  const { data: divRow } = await supabase.from('lab_dividends').select('net_dividend').eq('lab_id', lab.id)
  // Dividends already sit inside `cash` — this column reports them, it does not
  // add them again (item 4: do not double-count).
  const dividendsCum = (divRow ?? []).reduce((t: number, r: any) => t + Number(r.net_dividend || 0), 0)
  const dd = drawdown(nav.totalValue, prevPeakRow?.[0]?.peak ?? null)

  await supabase.from('lab_nav_history').upsert({
    lab_id: lab.id, user_id: userId, as_of: session.date,
    cash: nav.cash, positions_value: nav.positionsValue, total_value: nav.totalValue,
    invested: nav.invested, unrealized_pnl: nav.unrealizedPnl,
    realized_pnl_cum: Math.round(realizedCum * 100) / 100,
    holdings_count: nav.holdingsCount, peak: dd.peak, drawdown_pct: dd.drawdownPct,
    unpriced: nav.unpriced,
    stale: nav.stale,
    data_quality: nav.quality,
    fresh_count: nav.freshCount,
    stale_count: nav.staleCount,
    session_source: session.source,
    dividends_cum: Math.round(dividendsCum * 100) / 100,
    marked_at: nowIso,
  }, { onConflict: 'lab_id,as_of' })

  return {
    tradingDate: session.date, sessionSource: session.source, sessionKnown: session.sessionKnown,
    markedPositions: marked, nav, benchmarks, drawdownPct: dd.drawdownPct,
    navWritten: true, skippedReason: null, notes,
  }
}
