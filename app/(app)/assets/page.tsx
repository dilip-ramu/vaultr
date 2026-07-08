import { createClient } from '@/lib/supabase/server'
import AssetsClient from '@/components/assets/AssetsClient'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assets — Vaultr' }

export default async function AssetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: assets }, { data: rates }, { data: defaults }] = await Promise.all([
    supabase.from('assets').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
    supabase.from('market_rates').select('*').order('rate_date', { ascending: false }).limit(120),
    supabase.from('asset_rate_defaults').select('*').eq('user_id', user!.id),
  ])

  return (
    <AssetsClient
      initialAssets={(assets ?? []) as Asset[]}
      marketRates={(rates ?? []) as MarketRate[]}
      initialDefaults={(defaults ?? []) as AssetRateDefault[]}
    />
  )
}
