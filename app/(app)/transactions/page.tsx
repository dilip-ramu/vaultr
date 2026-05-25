import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import TransactionsClient from '@/components/transactions/TransactionsClient'

export const dynamic = 'force-dynamic'

export default async function TransactionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: transactions }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from('transactions')
      .select(`*, account:accounts!account_id(id,name,color,type,custom_type_id,custom_type_name,custom_type_color), to_account:accounts!to_account_id(id,name,color), category:categories(id,name,icon,color,type,avatar_url), attachments(*)`)
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true),
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user!.id)
      .order('name'),
  ])

  return (
    <Suspense>
      <TransactionsClient
        initialTransactions={transactions ?? []}
        accounts={accounts ?? []}
        categories={categories ?? []}
      />
    </Suspense>
  )
}
