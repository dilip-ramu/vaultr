import { createClient } from '@/lib/supabase/server'
import AccountsClient from '@/components/accounts/AccountsClient'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReconTxn } from '@/lib/reconcile'
import type { CardTxn } from '@/lib/cards'
import type { StatementRow } from '@/components/cards/CardsClient'
import type { PickerAccount } from '@/components/shared/AccountChipPicker'

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

  // Card data for the embedded "Charges" tab (statement cycle + hidden charges).
  const cardIds = (accounts ?? []).filter(a => a.type === 'credit').map(a => a.id)
  let cardTxns: CardTxn[] = []
  let cardStatements: StatementRow[] = []
  let payAccounts: PickerAccount[] = []
  if (cardIds.length > 0) {
    const since = new Date(); since.setMonth(since.getMonth() - 14)
    const sinceStr = since.toISOString().split('T')[0]
    const idList = cardIds.join(',')
    const [{ data: ct }, { data: cs }, { data: pa }] = await Promise.all([
      supabase.from('transactions').select('account_id, to_account_id, type, amount, date')
        .eq('user_id', user!.id).gte('date', sinceStr)
        .or(`account_id.in.(${idList}),to_account_id.in.(${idList})`),
      supabase.from('card_statements').select('account_id, statement_date, bank_amount, payment_transaction_id')
        .eq('user_id', user!.id),
      supabase.from('account_balances').select('id, name, type, color, avatar_url, custom_type_id, custom_type_name, custom_type_color, custom_type_icon, custom_type_avatar_url')
        .eq('user_id', user!.id).eq('is_active', true).not('type', 'in', '(credit,loan)').order('name'),
    ])
    cardTxns = (ct ?? []) as CardTxn[]
    cardStatements = (cs ?? []) as StatementRow[]
    payAccounts = (pa ?? []) as PickerAccount[]
  }

  return (
    <AccountsClient
      initialAccounts={accounts ?? []}
      builtinOverrides={overrides ?? []}
      debitCards={debitCards ?? []}
      reconcileTxns={reconcileTxns}
      cardTxns={cardTxns}
      cardStatements={cardStatements}
      payAccounts={payAccounts}
    />
  )
}
