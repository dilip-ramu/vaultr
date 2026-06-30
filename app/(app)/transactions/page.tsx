import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import TransactionsClient from '@/components/transactions/TransactionsClient'

export const dynamic = 'force-dynamic'

export default async function TransactionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: transactions }, { data: accounts }, { data: categories }, { data: payees }, { data: companies }, { data: lifetimeRows }] = await Promise.all([
    supabase
      .from('transactions')
      .select(`*, account:accounts!account_id(id,name,color,type,custom_type_id), to_account:accounts!to_account_id(id,name,color), category:categories(id,name,icon,color,type,avatar_url), payee:payees(id,name), attachments(*)`)
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000),
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
    supabase
      .from('payees')
      .select('id, name')
      .eq('user_id', user!.id)
      .order('name'),
    supabase
      .from('companies')
      .select('id, name')
      .eq('user_id', user!.id)
      .order('is_default', { ascending: false })
      .order('created_at'),
    // All-time totals for the Credits / Debits chips. Only the two columns we
    // need, so the row count doesn't matter performance-wise.
    supabase
      .from('transactions')
      .select('amount, type')
      .eq('user_id', user!.id)
      .in('type', ['income', 'expense']),
  ])

  let totalCredits = 0
  let totalDebits = 0
  for (const row of lifetimeRows ?? []) {
    if (row.type === 'income') totalCredits += Number(row.amount) || 0
    else if (row.type === 'expense') totalDebits += Number(row.amount) || 0
  }

  return (
    <Suspense>
      <TransactionsClient
        initialTransactions={transactions ?? []}
        accounts={accounts ?? []}
        categories={categories ?? []}
        payees={payees ?? []}
        companies={companies ?? []}
        totalCredits={totalCredits}
        totalDebits={totalDebits}
        hideHeader
      />
    </Suspense>
  )
}
