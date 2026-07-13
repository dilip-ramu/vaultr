import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Live prices for a list of symbols. Manual trigger only — nothing polls.
 *
 * ── About the source, plainly ───────────────────────────────────────────────
 * HDFC Securities does NOT publish a public API for retail accounts. A button
 * labelled "fetch from HDFC" would be a lie, so this doesn't pretend: prices
 * come from Yahoo Finance's public quote endpoint, which carries NSE (.NS) and
 * BSE (.BO) listings. The number is the exchange's, not your broker's — which is
 * the same number your broker is showing you, give or take the tick.
 *
 * It is an undocumented endpoint. It can change or rate-limit without notice.
 * That is exactly why the fetch is MANUAL and why a failure is reported rather
 * than swallowed: if we can't price a symbol, the app says so instead of leaving
 * a stale number on screen looking current.
 */

export const dynamic = 'force-dynamic'

interface Quote {
  symbol: string
  price: number
  currency: string
  at: string
}

async function fetchQuote(symbol: string): Promise<Quote | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
      },
    )
    if (!res.ok) return null

    const json = await res.json() as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; currency?: string } }[] }
    }
    const meta = json.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)

    // A zero or missing price is NOT a price. Returning 0 here would wipe the
    // holding's value; returning null lets the caller say "couldn't price this".
    if (!Number.isFinite(price) || price <= 0) return null

    return {
      symbol,
      price: Math.round(price * 100) / 100,
      currency: meta?.currency ?? 'INR',
      at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// GET /api/stocks/quote?symbols=RELIANCE.NS,TCS.NS
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = req.nextUrl.searchParams.get('symbols') ?? ''
  const symbols = [...new Set(raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))]

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols given' }, { status: 400 })
  }
  if (symbols.length > 50) {
    return NextResponse.json({ error: 'Too many symbols in one request (max 50)' }, { status: 400 })
  }

  const results = await Promise.all(symbols.map(fetchQuote))

  const quotes: Record<string, Quote> = {}
  const failed: string[] = []

  results.forEach((q, i) => {
    if (q) quotes[symbols[i]] = q
    else failed.push(symbols[i])
  })

  // `failed` is the point. The caller shows these as "couldn't price" rather
  // than leaving the old number sitting there looking freshly fetched.
  return NextResponse.json({ quotes, failed })
}
