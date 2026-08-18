import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchPrices } from '@/lib/investments/providers/price'
import type { Exchange } from '@/lib/investments/types'

export const dynamic = 'force-dynamic'

// GET /api/investments/holdings — list the user's investment holdings.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('inv_holdings').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holdings: data ?? [] })
}

// POST /api/investments/holdings — { op: 'create' | 'seed' | 'refresh', ... }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const op = String(body.op ?? 'create')

  // ── Create one holding (tries to price it immediately) ────────────────────
  if (op === 'create') {
    const symbol = String(body.symbol ?? '').trim().toUpperCase()
    if (!symbol) return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
    const exchange = (body.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange
    const quantity = Number(body.quantity) || 0
    const avg_cost = Number(body.avg_cost) || 0

    const q = await fetchPrices([{ symbol, exchange }])
    const quote = q.quotes[symbol]

    const { data, error } = await supabase.from('inv_holdings').insert({
      user_id: user.id,
      symbol, exchange,
      company_name: (body.company_name as string) ?? null,
      quantity, avg_cost,
      last_price: quote?.price ?? null,
      last_price_at: quote?.at ?? null,
      sector: (body.sector as string) ?? null,
      thesis: (body.thesis as string) ?? null,
      notes: (body.notes as string) ?? null,
      source: 'manual',
    }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ holding: data })
  }

  // ── Seed from the existing Assets module (category = 'stocks') ─────────────
  if (op === 'seed') {
    const { data: assets, error: aerr } = await supabase
      .from('assets').select('id, name, details').eq('user_id', user.id).eq('category', 'stocks')
    if (aerr) return NextResponse.json({ error: aerr.message }, { status: 500 })

    const rows = (assets ?? [])
      .map(a => {
        const d = (a.details ?? {}) as Record<string, unknown>
        const symbol = String(d.symbol ?? '').trim().toUpperCase()
        if (!symbol) return null
        return {
          user_id: user.id,
          symbol,
          exchange: (d.exchange === 'BSE' ? 'BSE' : 'NSE'),
          company_name: a.name ?? null,
          quantity: Number(d.quantity) || 0,
          avg_cost: Number(d.avg_cost) || 0,
          last_price: d.last_price != null ? Number(d.last_price) : null,
          last_price_at: (d.last_price_at as string) ?? null,
          source: 'assets',
          asset_id: a.id,
        }
      })
      .filter(Boolean) as Record<string, unknown>[]

    if (!rows.length) return NextResponse.json({ seeded: 0, message: 'No stock assets found to import.' })

    // Ignore duplicates on (user_id, symbol, exchange) so re-running is safe.
    const { data, error } = await supabase
      .from('inv_holdings')
      .upsert(rows, { onConflict: 'user_id,symbol,exchange', ignoreDuplicates: true })
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ seeded: data?.length ?? 0 })
  }

  // ── Refresh live prices for every holding (honest about failures) ─────────
  if (op === 'refresh') {
    const { data: holdings } = await supabase
      .from('inv_holdings').select('id, symbol, exchange').eq('user_id', user.id)
    if (!holdings?.length) return NextResponse.json({ updated: 0, failed: [] })

    const { quotes, failed } = await fetchPrices(
      holdings.map(h => ({ symbol: h.symbol, exchange: (h.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange })),
    )
    let updated = 0
    for (const h of holdings) {
      const quote = quotes[h.symbol.toUpperCase()]
      if (!quote) continue
      await supabase.from('inv_holdings')
        .update({ last_price: quote.price, last_price_at: quote.at, updated_at: new Date().toISOString() })
        .eq('id', h.id).eq('user_id', user.id)
      updated++
    }
    return NextResponse.json({ updated, failed })
  }

  return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 })
}
