import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Fetch today's gold (24K/22K) and silver per-gram INR rates from GoodReturns
 * (Tirupur) and store them in market_rates. No API key needed — it scrapes the
 * public daily-updated pages. Safe to call repeatedly (rows upsert per day).
 *
 * Override the source cities/URLs with METAL_GOLD_URL / METAL_SILVER_URL if you
 * ever want a different location. Never throws.
 */
const GOLD_URL = process.env.METAL_GOLD_URL || 'https://www.goodreturns.in/gold-rates/tirupur.html'
const SILVER_URL = process.env.METAL_SILVER_URL || 'https://www.goodreturns.in/silver-rates/tirupur.html'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IN,en;q=0.9' }

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}
function numBefore(text: string, phrase: RegExp): number | null {
  const m = text.match(phrase)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}

export async function fetchAndStoreMetalRates(): Promise<{ ok: boolean; stored: number; reason?: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const rows: { rate_date: string; metal: string; purity: string | null; rate_per_gram: number; source: string }[] = []
  const notes: string[] = []

  // Gold — store only the pure 24K baseline. Every other karat (22K, 18K, 14K…)
  // is derived natively in the app from karat/24, so any purity is supported.
  try {
    const res = await fetch(GOLD_URL, { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) notes.push(`gold HTTP ${res.status}`)
    else {
      const t = stripTags(await res.text())
      const g24 = numBefore(t, /([\d,]+)\s*per gram for 24/i)
      if (g24) rows.push({ rate_date: today, metal: 'gold', purity: '24K', rate_per_gram: g24, source: 'goodreturns/tirupur' })
      else notes.push('gold: price not found on page')
    }
  } catch (e) { notes.push(`gold fetch failed: ${e instanceof Error ? e.message : 'error'}`) }

  // Silver — store the pure (.999) per-gram rate. Sterling (925), coin (900),
  // etc. are derived from fineness/1000 in the app.
  try {
    const res = await fetch(SILVER_URL, { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) notes.push(`silver HTTP ${res.status}`)
    else {
      const t = stripTags(await res.text())
      const s = numBefore(t, /([\d,]+)\s*per gram and/i) ?? numBefore(t, /silver in [A-Za-z ]+today is[^\d]*([\d,]+)/i)
      if (s) rows.push({ rate_date: today, metal: 'silver', purity: null, rate_per_gram: s, source: 'goodreturns/tirupur' })
      else notes.push('silver: price not found on page')
    }
  } catch (e) { notes.push(`silver fetch failed: ${e instanceof Error ? e.message : 'error'}`) }

  if (rows.length === 0) return { ok: false, stored: 0, reason: notes.join('; ') || 'Could not read rates from source' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('market_rates').upsert(rows, { onConflict: 'rate_date,metal,purity' })
  if (error) return { ok: false, stored: 0, reason: error.message }
  return { ok: true, stored: rows.length }
}
