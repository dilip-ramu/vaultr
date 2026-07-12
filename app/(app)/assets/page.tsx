import { createClient } from '@/lib/supabase/server'
import AssetsClient from '@/components/assets/AssetsClient'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'
import { fetchAndStoreMetalRates } from '@/lib/assets/fetchRates'
import type { PickerAccount } from '@/components/shared/AccountChipPicker'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assets — Vaultr' }

export default async function AssetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const loadRates = () => supabase.from('market_rates').select('*').order('rate_date', { ascending: false }).limit(120)

  const [{ data: assets }, ratesRes, { data: defaults }, { data: accounts }] = await Promise.all([
    supabase.from('assets').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
    loadRates(),
    supabase.from('asset_rate_defaults').select('*').eq('user_id', user!.id),
    // Selling an asset credits an account — the sale modal needs the list.
    supabase.from('account_balances')
      .select('id, name, type, color, avatar_url, custom_type_id, custom_type_name, custom_type_color, custom_type_icon')
      .eq('user_id', user!.id).eq('is_active', true).order('name'),
  ])

  // Lazy, once-a-day auto-fetch (like forex) — no cron. The first person to open
  // Assets on a given day triggers the fetch+store; everyone else reads the row.
  let rates = ratesRes.data ?? []
  const today = new Date().toISOString().slice(0, 10)
  if (!rates.some(r => r.rate_date === today)) {
    const res = await fetchAndStoreMetalRates()
    if (res.ok) rates = (await loadRates()).data ?? rates
  }

  return (
    <AssetsClient
      initialAssets={(assets ?? []) as Asset[]}
      marketRates={rates as MarketRate[]}
      initialDefaults={(defaults ?? []) as AssetRateDefault[]}
      accounts={(accounts ?? []) as PickerAccount[]}
    />
  )
}
