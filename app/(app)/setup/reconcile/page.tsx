import { createClient } from '@/lib/supabase/server'
import ReconcileClient, { type ReconcileAccount, type ReconcileTxn } from '@/components/reconcile/ReconcileClient'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

async function fetchAllAccountTxns(supabase: SupabaseClient, uid: string): Promise<ReconcileTxn[]> {
  const out: ReconcileTxn[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, date, name, original_currency, account_id, to_account_id')
      .eq('user_id', uid)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    out.push(...((data ?? []) as ReconcileTxn[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export default async function SetupReconcileTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: balances }, txns] = await Promise.all([
    supabase
      .from('account_balances')
      .select('id, name, type, currency, initial_balance, balance, avatar_url, color, custom_type_name, is_active')
      .eq('user_id', uid)
      .order('name'),
    fetchAllAccountTxns(supabase, uid),
  ])

  return (
    <ReconcileClient
      accounts={(balances ?? []) as ReconcileAccount[]}
      txns={txns}
    />
  )
}
