import { NextResponse } from 'next/server'

// In-memory cache: { rates, fetchedAt }
let cache: { rates: Record<string, number>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET() {
  // Return cached rates if fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ rates: cache.rates, cached: true })
  }

  try {
    // Fetch rates with INR as base — free API, no key needed
    const res = await fetch('https://open.er-api.com/v6/latest/INR', {
      next: { revalidate: 3600 }, // Next.js cache for 1 hour
    })

    if (!res.ok) throw new Error(`API responded with ${res.status}`)

    const json = await res.json()

    if (json.result !== 'success') throw new Error('API returned error result')

    // Invert rates: json.rates.USD = how many USD per 1 INR
    // We want: how many INR per 1 unit of foreign currency
    const invertedRates: Record<string, number> = {}
    for (const [code, rate] of Object.entries(json.rates as Record<string, number>)) {
      if (code !== 'INR' && rate > 0) {
        invertedRates[code] = 1 / rate
      }
    }

    cache = { rates: invertedRates, fetchedAt: Date.now() }
    return NextResponse.json({ rates: invertedRates, cached: false })

  } catch (err) {
    // If API fails and we have stale cache, return it
    if (cache) {
      return NextResponse.json({ rates: cache.rates, cached: true, stale: true })
    }
    return NextResponse.json(
      { error: 'Failed to fetch exchange rates', rates: {} },
      { status: 500 }
    )
  }
}
