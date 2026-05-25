import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString().split('T')[0]

  const [
    { data: accounts },
    { data: recentTx },
    { data: monthlyTx },
    { data: profile },
    { data: overrides },
  ] = await Promise.all([
    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('created_at'),
    supabase
      .from('transactions')
      .select(`*, account:accounts!account_id(id,name,color,type,custom_type_id), category:categories(id,name,icon,color,avatar_url)`)
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('transactions')
      .select('type, amount, date')
      .eq('user_id', user!.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth),
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('builtin_account_type_overrides')
      .select('*')
      .eq('user_id', user!.id),
  ])

  return (
    <DashboardClient
      accounts={accounts ?? []}
      recentTransactions={recentTx ?? []}
      monthlyTransactions={monthlyTx ?? []}
      profile={profile}
      builtinOverrides={overrides ?? []}
    />
  )
}
