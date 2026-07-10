import { createClient } from '@/lib/supabase/server'
import BooksClient from '@/components/books/BooksClient'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'
import type { BooksAccount, BooksTxn, BooksCategory } from '@/lib/books/derive'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Books — Vaultr' }

export default async function BooksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [acc, txn, cat, ast, rates, defs] = await Promise.all([
    supabase.from('accounts').select('id, name, type, initial_balance, include_in_net_worth').eq('user_id', uid).eq('is_active', true),
    supabase.from('transactions').select('type, account_id, to_account_id, amount, category_id, date').eq('user_id', uid),
    supabase.from('categories').select('id, name, type').eq('user_id', uid),
    supabase.from('assets').select('*').eq('user_id', uid),
    supabase.from('market_rates').select('*').order('rate_date', { ascending: false }).limit(120),
    supabase.from('asset_rate_defaults').select('*').eq('user_id', uid),
  ])

  return (
    <BooksClient
      accounts={(acc.data ?? []) as BooksAccount[]}
      transactions={(txn.data ?? []) as BooksTxn[]}
      categories={(cat.data ?? []) as BooksCategory[]}
      assets={(ast.data ?? []) as Asset[]}
      marketRates={(rates.data ?? []) as MarketRate[]}
      defaults={(defs.data ?? []) as AssetRateDefault[]}
    />
  )
}
