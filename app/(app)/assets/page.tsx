import { createClient } from '@/lib/supabase/server'
import AssetsClient from '@/components/assets/AssetsClient'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'
import { fetchAndStoreMetalRates } from '@/lib/assets/fetchRates'
import type { PickerAccount } from '@/components/shared/AccountChipPicker'
import { bucket, type Fold, type SpendTxn, type Bucket } from '@/lib/assets/construction'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assets — Vaultr' }

export default async function AssetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const loadRates = () => supabase.from('market_rates').select('*').order('rate_date', { ascending: false }).limit(120)

  const [{ data: assets }, ratesRes, { data: defaults }, { data: accounts }, { data: fundingCats }, { data: folds }] = await Promise.all([
    supabase.from('assets').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
    loadRates(),
    supabase.from('asset_rate_defaults').select('*').eq('user_id', user!.id),
    // Selling an asset credits an account — the sale modal needs the list.
    supabase.from('account_balances')
      .select('id, name, type, color, avatar_url, custom_type_id, custom_type_name, custom_type_color, custom_type_icon')
      .eq('user_id', user!.id).eq('is_active', true).order('name'),
    // A category can fund an asset: everything filed under it builds up on
    // that asset until it is folded. See lib/assets/construction.ts.
    supabase.from('categories').select('id, name, asset_id').eq('user_id', user!.id).not('asset_id', 'is', null),
    supabase.from('asset_folds').select('*').eq('user_id', user!.id).order('completed_on', { ascending: false }),
  ])

  // Lazy, once-a-day auto-fetch (like forex) — no cron. The first person to open
  // Assets on a given day triggers the fetch+store; everyone else reads the row.
  let rates = ratesRes.data ?? []
  const today = new Date().toISOString().slice(0, 10)
  if (!rates.some(r => r.rate_date === today)) {
    const res = await fetchAndStoreMetalRates()
    if (res.ok) rates = (await loadRates()).data ?? rates
  }

  // ── The live buckets ──────────────────────────────────────────────────────
  //
  // Worked out from the bills, not stored beside them: add a transaction in a
  // funding category and the asset's figure rises with no extra click, and
  // there is no second copy that can drift.
  const cats = (fundingCats ?? []) as { id: string; name: string; asset_id: string }[]
  const foldRows = ((folds ?? []) as Record<string, unknown>[]).map(f => ({
    id: String(f.id),
    sourceAssetId: String(f.source_asset_id),
    targetAssetId: String(f.target_asset_id),
    improvementName: String(f.improvement_name ?? ''),
    completedOn: String(f.completed_on ?? '').slice(0, 10),
    amount: Number(f.amount) || 0,
    transactionIds: ((f.transaction_ids as string[] | null) ?? []).map(String),
  }))

  const buckets: Record<string, Bucket> = {}
  const bucketCategory: Record<string, string> = {}
  if (cats.length > 0) {
    const { data: spend } = await supabase
      .from('transactions')
      .select('id, name, amount, date, category_id')
      .eq('user_id', user!.id)
      .in('category_id', cats.map(c => c.id))
      .order('date', { ascending: true })

    const byAsset = new Map<string, SpendTxn[]>()
    const catAsset = new Map(cats.map(c => [c.id, c.asset_id]))
    for (const t of (spend ?? []) as { id: string; name: string | null; amount: number; date: string; category_id: string }[]) {
      const assetId = catAsset.get(String(t.category_id))
      if (!assetId) continue
      const list = byAsset.get(assetId) ?? []
      list.push({ id: String(t.id), amount: Number(t.amount) || 0, date: String(t.date).slice(0, 10), name: t.name })
      byAsset.set(assetId, list)
    }
    for (const c of cats) bucketCategory[c.asset_id] = c.name
    for (const [assetId, list] of byAsset) {
      buckets[assetId] = bucket(list, foldRows.filter(f => f.sourceAssetId === assetId) as Fold[])
    }
    // An asset with a category pointing at it but nothing spent yet still
    // shows its bucket, at zero, so the link is visible before the first bill.
    for (const c of cats) if (!buckets[c.asset_id]) buckets[c.asset_id] = bucket([], [])
  }

  return (
    <AssetsClient
      buckets={buckets}
      bucketCategory={bucketCategory}
      folds={foldRows}
      initialAssets={(assets ?? []) as Asset[]}
      marketRates={rates as MarketRate[]}
      initialDefaults={(defaults ?? []) as AssetRateDefault[]}
      accounts={(accounts ?? []) as PickerAccount[]}
    />
  )
}
