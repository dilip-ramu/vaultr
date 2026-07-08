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

const UA = 'Mozilla/5.0 (compatible; VaultrBot/1.0; +https://vaultr.money)'

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

  // Gold — "₹14,946 per gram for 24 karat gold … ₹13,700 per gram for 22 karat …"
  try {
    const res = await fetch(GOLD_URL, { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (res.ok) {
      const t = stripTags(await res.text())
      const g24 = numBefore(t, /([\d,]+)\s*per gram for 24/i)
      const g22 = numBefore(t, /([\d,]+)\s*per gram for 22/i)
      const g18 = numBefore(t, /([\d,]+)\s*per gram for 18/i)
      if (g24) rows.push({ rate_date: today, metal: 'gold', purity: '24K', rate_per_gram: g24, source: 'goodreturns/tirupur' })
      if (g22) rows.push({ rate_date: today, metal: 'gold', purity: '22K', rate_per_gram: g22, source: 'goodreturns/tirupur' })
      if (g18) rows.push({ rate_date: today, metal: 'gold', purity: '18K', rate_per_gram: g18, source: 'goodreturns/tirupur' })
    }
  } catch { /* ignore */ }

  // Silver — "The price of silver in Tirupur today is ₹245 per gram and ₹2,45,000 per kilogram."
  try {
    const res = await fetch(SILVER_URL, { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (res.ok) {
      const t = stripTags(await res.text())
      const s = numBefore(t, /([\d,]+)\s*per gram and/i) ?? numBefore(t, /silver in [A-Za-z ]+today is[^\d]*([\d,]+)/i)
      if (s) rows.push({ rate_date: today, metal: 'silver', purity: null, rate_per_gram: s, source: 'goodreturns/tirupur' })
    }
  } catch { /* ignore */ }

  if (rows.length === 0) return { ok: false, stored: 0, reason: 'Could not read rates from source' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('market_rates').upsert(rows, { onConflict: 'rate_date,metal,purity' })
  if (error) return { ok: false, stored: 0, reason: error.message }
  return { ok: true, stored: rows.length }
}
