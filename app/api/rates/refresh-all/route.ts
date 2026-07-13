import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAndStoreMetalRates } from '@/lib/assets/fetchRates'
import { quoteSymbol, type StockDetails } from '@/lib/assets/stocks'

/**
 * ONE refresh for every price in the app. Whichever "fetch" button you press,
 * this is what runs — because three buttons that each refresh a third of your
 * portfolio is three chances to look at a stale number and think it's current.
 *
 * It refreshes:
 *   1. Metal rates      (gold / silver / platinum)  → market_rates
 *   2. Currency rates   (₹ per unit)                → currency_rates
 *   3. Stock prices     (NSE / BSE)                 → assets.details.last_price
 *
 * Every source reports independently. A partial failure is REPORTED, never
 * swallowed: if the stock feed is down but currencies updated, you're told
 * exactly that, rather than being shown a green tick over a half-stale portfolio.
 */

export const dynamic = 'force-dynamic'

interface SourceResult {
  ok: boolean
  updated: number
  failed?: string[]
  reason?: string
}

/** ₹ per unit, for every currency you actually track on the Currencies page. */
async function refreshCurrencies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<SourceResult> {
  const { data: rows } = await supabase
    .from('currency_rates')
    .select('id, currency')
    .eq('user_id', userId)

  const tracked = (rows ?? []) as { id: string; currency: string }[]
  if (tracked.length === 0) return { ok: true, updated: 0, reason: 'No currencies tracked' }

  try {
    // Base INR: the response gives units-per-rupee, so ₹ per unit is 1/that.
    const res = await fetch('https://open.er-api.com/v6/latest/INR', { cache: 'no-store' })
    if (!res.ok) return { ok: false, updated: 0, reason: `Rate service returned ${res.status}` }

    const json = await res.json() as { rates?: Record<string, number> }
    const perRupee = json.rates ?? {}

    const failed: string[] = []
    let updated = 0

    for (const row of tracked) {
      const code = row.currency.toUpperCase()
      const units = Number(perRupee[code])

      // No rate, or a nonsense one, must NOT be written. A zero rate would value
      // every holding in that currency at zero.
      if (!Number.isFinite(units) || units <= 0) { failed.push(code); continue }

      const rupeesPerUnit = Math.round((1 / units) * 1e6) / 1e6
      const { error } = await supabase
        .from('currency_rates')
        .update({ market_rate: rupeesPerUnit, effective_from: new Date().toISOString() })
        .eq('id', row.id).eq('user_id', userId)

      if (error) failed.push(code)
      else updated++
    }

    return { ok: failed.length === 0, updated, failed: failed.length ? failed : undefined }
  } catch (e) {
    return { ok: false, updated: 0, reason: (e as Error).message }
  }
}

/** Live NSE/BSE prices for every stock asset you hold. */
async function refreshStocks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<SourceResult> {
  const { data: rows } = await supabase
    .from('assets')
    .select('id, details')
    .eq('user_id', userId)
    .eq('valuation_type', 'stock')
    .eq('status', 'held')

  const holdings = (rows ?? []) as { id: string; details: StockDetails }[]
  if (holdings.length === 0) return { ok: true, updated: 0, reason: 'No stocks held' }

  const failed: string[] = []
  let updated = 0
  const at = new Date().toISOString()

  await Promise.all(holdings.map(async h => {
    const sym = quoteSymbol(h.details ?? {})
    if (!sym) { failed.push(h.details?.symbol ?? '?'); return }

    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' },
      )
      if (!res.ok) { failed.push(sym); return }

      const json = await res.json() as {
        chart?: { result?: { meta?: { regularMarketPrice?: number } }[] }
      }
      const price = Number(json.chart?.result?.[0]?.meta?.regularMarketPrice)

      // A missing price stays missing. Writing 0 here would wipe the holding.
      if (!Number.isFinite(price) || price <= 0) { failed.push(sym); return }

      const { error } = await supabase
        .from('assets')
        .update({
          details: {
            ...(h.details ?? {}),
            last_price: Math.round(price * 100) / 100,
            last_price_at: at,
          },
        })
        .eq('id', h.id).eq('user_id', userId)

      if (error) failed.push(sym)
      else updated++
    } catch {
      failed.push(sym)
    }
  }))

  return { ok: failed.length === 0, updated, failed: failed.length ? failed : undefined }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // All three in parallel — they're independent, and one being slow shouldn't
  // hold the others hostage.
  const [metals, currencies, stocks] = await Promise.all([
    fetchAndStoreMetalRates()
      .then(r => ({ ok: r.ok, updated: r.stored, reason: r.reason }) as SourceResult)
      .catch(e => ({ ok: false, updated: 0, reason: (e as Error).message }) as SourceResult),
    refreshCurrencies(supabase, user.id),
    refreshStocks(supabase, user.id),
  ])

  return NextResponse.json({
    metals,
    currencies,
    stocks,
    // True only when EVERY source succeeded. A green tick over a half-refreshed
    // portfolio is exactly the lie this endpoint exists to avoid.
    allOk: metals.ok && currencies.ok && stocks.ok,
  })
}
