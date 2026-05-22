import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountDetailClient from '@/components/accounts/AccountDetailClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AccountDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: account } = await supabase
    .from('account_balances')
    .select('*')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (!account) notFound()

  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select(`*, account:accounts!account_id(id,name,color,type), category:categories(id,name,icon,color), payee:payees(id,name,type)`)
    .eq('account_id', id)
    .eq('user_id', user!.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <AccountDetailClient
      account={account}
      recentTransactions={recentTransactions ?? []}
    />
  )
}
