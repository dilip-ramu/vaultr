import { createClient } from '@/lib/supabase/server'
import InvestmentsClient from '@/components/investments/InvestmentsClient'
import { analyzePortfolio } from '@/lib/investments/portfolio'
import type { HoldingRow, RegimeRow, AlertRow } from '@/components/investments/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Investments — Vaultr' }

export default async function InvestmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: holdings }, { data: regime }, { data: alerts }] = await Promise.all([
    supabase.from('inv_holdings').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
    supabase.from('inv_market_regime').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(1),
    supabase.from('inv_alerts').select('*').eq('user_id', user!.id).eq('is_read', false).order('created_at', { ascending: false }).limit(20),
  ])

  const rows = (holdings ?? []) as HoldingRow[]
  const summary = analyzePortfolio(rows.map(h => ({
    symbol: h.symbol, exchange: h.exchange, quantity: Number(h.quantity), avg_cost: Number(h.avg_cost),
    last_price: h.last_price != null ? Number(h.last_price) : null, sector: h.sector, market_cap_band: h.market_cap_band,
  })))

  return (
    <InvestmentsClient
      holdings={rows}
      summary={summary}
      regime={(regime?.[0] ?? null) as RegimeRow | null}
      alerts={(alerts ?? []) as AlertRow[]}
    />
  )
}
