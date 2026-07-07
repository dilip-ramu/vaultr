import { createClient } from '@/lib/supabase/server'
import AccountsClient from '@/components/accounts/AccountsClient'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReconTxn } from '@/lib/reconcile'

export const dynamic = 'force-dynamic'

/** Paginate every transaction the user owns — the inline reconcile panel on
 *  each account needs the full history to build its running-balance ledger.
 *  Same shape the retired /reconcile page used to fetch. */
async function fetchAllAccountTxns(supabase: SupabaseClient, uid: string): Promise<ReconTxn[]> {
  const out: ReconTxn[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, date, name, original_currency, account_id, to_account_id')
      .eq('user_id', uid)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    out.push(...((data ?? []) as ReconTxn[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accounts }, { data: overrides }, { data: debitCards }, reconcileTxns] = await Promise.all([
    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('builtin_account_type_overrides')
      .select('*')
      .eq('user_id', user!.id),
    // v73 — debit cards linked to accounts (table may not exist until the
    // migration runs; fall back to [] so the page never hard-fails).
    supabase
      .from('debit_cards')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: true })
      .then(r => r, () => ({ data: [] })),
    fetchAllAccountTxns(supabase, user!.id),
  ])

  return (
    <AccountsClient
      initialAccounts={accounts ?? []}
      builtinOverrides={overrides ?? []}
      debitCards={debitCards ?? []}
      reconcileTxns={reconcileTxns}
    />
  )
}
