import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Fetch today's gold (24K/22K) and silver per-gram INR rates and store them in
 * market_rates. Uses goldapi.io when GOLD_API_KEY is set (per-gram fields are
 * returned directly). Safe to call repeatedly — rows are upserted per day.
 *
 * Returns a small report; never throws (so the cron endpoint stays green).
 */
export async function fetchAndStoreMetalRates(): Promise<{ ok: boolean; stored: number; reason?: string }> {
  const key = process.env.GOLD_API_KEY
  if (!key) return { ok: false, stored: 0, reason: 'GOLD_API_KEY not set' }

  const today = new Date().toISOString().slice(0, 10)
  const rows: { rate_date: string; metal: string; purity: string | null; rate_per_gram: number; source: string }[] = []

  try {
    const gold = await fetch('https://www.goldapi.io/api/XAU/INR', { headers: { 'x-access-token': key }, cache: 'no-store' })
    if (gold.ok) {
      const g = await gold.json() as { price_gram_24k?: number; price_gram_22k?: number }
      if (g.price_gram_24k) rows.push({ rate_date: today, metal: 'gold', purity: '24K', rate_per_gram: round2(g.price_gram_24k), source: 'goldapi.io' })
      if (g.price_gram_22k) rows.push({ rate_date: today, metal: 'gold', purity: '22K', rate_per_gram: round2(g.price_gram_22k), source: 'goldapi.io' })
    }
  } catch { /* ignore, report below */ }

  try {
    const silver = await fetch('https://www.goldapi.io/api/XAG/INR', { headers: { 'x-access-token': key }, cache: 'no-store' })
    if (silver.ok) {
      const s = await silver.json() as { price_gram_24k?: number }
      if (s.price_gram_24k) rows.push({ rate_date: today, metal: 'silver', purity: null, rate_per_gram: round2(s.price_gram_24k), source: 'goldapi.io' })
    }
  } catch { /* ignore */ }

  if (rows.length === 0) return { ok: false, stored: 0, reason: 'No rates returned from provider' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('market_rates').upsert(rows, { onConflict: 'rate_date,metal,purity' })
  if (error) return { ok: false, stored: 0, reason: error.message }
  return { ok: true, stored: rows.length }
}

function round2(n: number) { return Math.round(n * 100) / 100 }
