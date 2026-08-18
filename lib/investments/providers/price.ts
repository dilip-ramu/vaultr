// Price provider — thin server-side wrapper over the SAME public quote endpoint
// the Assets module already uses (Yahoo Finance NSE .NS / BSE .BO). See
// app/api/stocks/quote/route.ts and lib/assets/stocks.ts for the reasoning:
// prices are fetched, can be missing/stale, and a missing price is "unknown",
// never 0. This module is called from server routes, so it hits Yahoo directly
// rather than round-tripping through our own API.
//
// Live-readiness pass (Deploy #4). Yahoo is an undocumented public endpoint
// called from a datacenter IP, so in production it WILL occasionally hang,
// rate-limit or return a 5xx. Three defences, all bounded:
//
//   • TIMEOUT — every request aborts on its own deadline, so one slow response
//     cannot consume a serverless function's entire budget.
//   • BOUNDED RETRY — one retry on a transient failure (timeout, 429, 5xx),
//     with a short backoff. Never on a 404: an unknown symbol is an answer.
//   • CONCURRENCY CAP — a portfolio mark requests a handful at a time instead
//     of firing every symbol at once, which is what triggers rate limiting.
//
// A failure still returns null. The caller carries the last valid price forward
// and marks the position stale (lib/investments/lab/marking.ts) — a fetch
// problem must never look like a price collapse.

import type { Exchange } from '../types'

export interface Quote {
  symbol: string
  price: number
  currency: string
  /** When WE fetched it (ISO). */
  at: string
  /**
   * The exchange's own timestamp for this print (unix seconds), when Yahoo
   * supplies it. This is what tells us which TRADING SESSION a mark belongs to
   * without maintaining a holiday calendar (see lib/investments/marketdate.ts).
   */
  marketTime?: number | null
}

export interface FetchOptions {
  /** Abort a single attempt after this long. */
  timeoutMs?: number
  /** Extra attempts after a transient failure. */
  retries?: number
  /** Stop retrying once this instant passes (epoch ms). */
  deadline?: number
  /** How many symbols to request at once in a batch. */
  concurrency?: number
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
}

export const DEFAULT_FETCH: Required<Pick<FetchOptions, 'timeoutMs' | 'retries' | 'concurrency'>> = {
  timeoutMs: 8_000,
  retries: 1,
  concurrency: 4,
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** RELIANCE on NSE → RELIANCE.NS ; on BSE → RELIANCE.BO. Already-suffixed passes through. */
export function yahooSymbol(symbol: string, exchange: Exchange): string | null {
  const sym = (symbol ?? '').trim().toUpperCase()
  if (!sym) return null
  if (sym.includes('.')) return sym
  return exchange === 'BSE' ? `${sym}.BO` : `${sym}.NS`
}

/** Worth trying again? A missing symbol is not; a squeezed endpoint is. */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500
}

async function attempt(yahoo: string, timeoutMs: number): Promise<{ quote: Quote | null; transient: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: controller.signal },
    )
    if (!res.ok) return { quote: null, transient: isTransientStatus(res.status) }

    const json = await res.json() as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; currency?: string; regularMarketTime?: number } }[] }
    }
    const meta = json.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)
    if (!Number.isFinite(price) || price <= 0) return { quote: null, transient: false }   // 0/missing is NOT a price

    const marketTime = Number(meta?.regularMarketTime)
    return {
      quote: {
        symbol: yahoo,
        price: Math.round(price * 100) / 100,
        currency: meta?.currency ?? 'INR',
        at: new Date().toISOString(),
        marketTime: Number.isFinite(marketTime) && marketTime > 0 ? marketTime : null,
      },
      transient: false,
    }
  } catch {
    // Abort or network error — both are worth one more try.
    return { quote: null, transient: true }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOne(yahoo: string, opts: FetchOptions = {}): Promise<Quote | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH.timeoutMs
  const maxAttempts = 1 + (opts.retries ?? DEFAULT_FETCH.retries)
  const sleep = opts.sleep ?? defaultSleep

  for (let i = 0; i < maxAttempts; i++) {
    const { quote, transient } = await attempt(yahoo, timeoutMs)
    if (quote) return quote
    const more = i < maxAttempts - 1
    const timeLeft = opts.deadline == null || Date.now() + timeoutMs < opts.deadline
    if (!transient || !more || !timeLeft) return null
    await sleep(400 * (i + 1))
  }
  return null
}

/** Fetch a live price for one symbol. null = couldn't price it (caller says so). */
export async function fetchPrice(symbol: string, exchange: Exchange, opts?: FetchOptions): Promise<Quote | null> {
  const y = yahooSymbol(symbol, exchange)
  if (!y) return null
  return fetchOne(y, opts)
}

/** Run tasks with a bounded number in flight. Order of results is preserved. */
async function pooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= tasks.length) return
      results[i] = await tasks[i]()
    }
  })
  await Promise.all(workers)
  return results
}

/** Batch. Returns priced quotes keyed by ORIGINAL symbol, plus the ones that failed. */
export async function fetchPrices(
  items: { symbol: string; exchange: Exchange }[],
  opts: FetchOptions = {},
): Promise<{ quotes: Record<string, Quote>; failed: string[] }> {
  const uniq = Array.from(new Map(items.map(i => [`${i.symbol.toUpperCase()}:${i.exchange}`, i])).values())
  const results = await pooled(
    uniq.map(i => () => fetchPrice(i.symbol, i.exchange, opts)),
    opts.concurrency ?? DEFAULT_FETCH.concurrency,
  )
  const quotes: Record<string, Quote> = {}
  const failed: string[] = []
  results.forEach((q, i) => {
    const key = uniq[i].symbol.toUpperCase()
    if (q) quotes[key] = q
    else failed.push(key)
  })
  return { quotes, failed }
}

/**
 * Raw index/quote level for an EXACT Yahoo symbol (no .NS/.BO suffixing).
 * Used for benchmark indices like ^NSEI (Nifty 50) and ^CRSLDX (Nifty 500).
 */
export async function fetchIndexLevel(yahooSymbolExact: string, opts?: FetchOptions): Promise<number | null> {
  const q = await fetchOne(yahooSymbolExact, opts)
  return q?.price ?? null
}

/** Full quote for an EXACT Yahoo symbol — level AND the exchange timestamp,
 *  which the Lab uses to derive the trading session date (item 8). */
export async function fetchIndexQuote(yahooSymbolExact: string, opts?: FetchOptions): Promise<Quote | null> {
  return fetchOne(yahooSymbolExact, opts)
}
