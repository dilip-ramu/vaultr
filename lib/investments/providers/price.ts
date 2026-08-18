// Price provider — thin server-side wrapper over the SAME public quote endpoint
// the Assets module already uses (Yahoo Finance NSE .NS / BSE .BO). See
// app/api/stocks/quote/route.ts and lib/assets/stocks.ts for the reasoning:
// prices are fetched, can be missing/stale, and a missing price is "unknown",
// never 0. This module is called from server routes, so it hits Yahoo directly
// rather than round-tripping through our own API.

import type { Exchange } from '../types'

export interface Quote { symbol: string; price: number; currency: string; at: string }

/** RELIANCE on NSE → RELIANCE.NS ; on BSE → RELIANCE.BO. Already-suffixed passes through. */
export function yahooSymbol(symbol: string, exchange: Exchange): string | null {
  const sym = (symbol ?? '').trim().toUpperCase()
  if (!sym) return null
  if (sym.includes('.')) return sym
  return exchange === 'BSE' ? `${sym}.BO` : `${sym}.NS`
}

async function fetchOne(yahoo: string): Promise<Quote | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' },
    )
    if (!res.ok) return null
    const json = await res.json() as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; currency?: string } }[] }
    }
    const meta = json.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)
    if (!Number.isFinite(price) || price <= 0) return null   // 0/missing is NOT a price
    return {
      symbol: yahoo,
      price: Math.round(price * 100) / 100,
      currency: meta?.currency ?? 'INR',
      at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/** Fetch a live price for one symbol. null = couldn't price it (caller says so). */
export async function fetchPrice(symbol: string, exchange: Exchange): Promise<Quote | null> {
  const y = yahooSymbol(symbol, exchange)
  if (!y) return null
  return fetchOne(y)
}

/** Batch. Returns priced quotes keyed by ORIGINAL symbol, plus the ones that failed. */
export async function fetchPrices(
  items: { symbol: string; exchange: Exchange }[],
): Promise<{ quotes: Record<string, Quote>; failed: string[] }> {
  const uniq = Array.from(new Map(items.map(i => [`${i.symbol.toUpperCase()}:${i.exchange}`, i])).values())
  const results = await Promise.all(uniq.map(i => fetchPrice(i.symbol, i.exchange)))
  const quotes: Record<string, Quote> = {}
  const failed: string[] = []
  results.forEach((q, i) => {
    const key = uniq[i].symbol.toUpperCase()
    if (q) quotes[key] = q
    else failed.push(key)
  })
  return { quotes, failed }
}
