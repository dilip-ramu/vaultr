import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountDetailClient, { type StatementTxn } from '@/components/accounts/AccountDetailClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AccountDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: account }, { data: overrides }] = await Promise.all([
    supabase
      .from('account_balances')
      .select('*')
      .eq('id', id)
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('builtin_account_type_overrides')
      .select('*')
      .eq('user_id', user!.id),
  ])

  if (!account) notFound()

  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select(`*, account:accounts!account_id(id,name,color,type), to_account:accounts!to_account_id(id,name,color), category:categories(id,name,icon,color,avatar_url), payee:payees(id,name,type), attachments(*)`)
    .or(`account_id.eq.${id},to_account_id.eq.${id}`)
    .eq('user_id', user!.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)

  // Full ledger for the statement view (lightweight fields, all rows, paginated)
  const statementTxns: StatementTxn[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, date, name, account_id, to_account_id, category:categories(name), payee:payees(name)')
      .or(`account_id.eq.${id},to_account_id.eq.${id}`)
      .eq('user_id', user!.id)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const cat = r.category as { name: string } | { name: string }[] | null
      const pay = r.payee as { name: string } | { name: string }[] | null
      statementTxns.push({
        id: r.id, type: r.type, amount: r.amount, date: r.date, name: r.name,
        account_id: r.account_id, to_account_id: r.to_account_id,
        category_name: Array.isArray(cat) ? cat[0]?.name ?? null : cat?.name ?? null,
        payee_name: Array.isArray(pay) ? pay[0]?.name ?? null : pay?.name ?? null,
      })
    }
    if (data.length < 1000) break
  }

  return (
    <AccountDetailClient
      account={account}
      recentTransactions={recentTransactions ?? []}
      statementTxns={statementTxns}
      builtinOverrides={overrides ?? []}
    />
  )
}
