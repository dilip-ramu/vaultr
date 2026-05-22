import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import AccountDetailClient from '@/components/accounts/AccountDetailClient'

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: account } = await supabase
    .from('account_balances')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!account) notFound()

  // Recent transactions for this account
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*, category:categories(id,name,icon,color), account:accounts!transactions_account_id_fkey(id,name,color,type), to_account:accounts!transactions_to_account_id_fkey(id,name,color,type)')
    .or(`account_id.eq.${params.id},to_account_id.eq.${params.id}`)
    .order('date', { ascending: false })
    .limit(10)

  return <AccountDetailClient account={account} recentTransactions={transactions ?? []} />
}
