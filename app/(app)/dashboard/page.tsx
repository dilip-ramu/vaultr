import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import type { Budget, Bill } from '@/lib/types'

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
    { data: rawBudgets },
    { data: budgetTx },
    { data: upcomingSubs },
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
    supabase
      .from('budgets')
      .select('*, category:categories(id,name,icon,color,avatar_url)')
      .eq('user_id', user!.id)
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('category_id, amount')
      .eq('user_id', user!.id)
      .eq('type', 'expense')
      .not('category_id', 'is', null)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth),
    supabase
      .from('bills')
      .select('*, category:categories(id,name,icon,color,avatar_url)')
      .eq('user_id', user!.id)
      .eq('is_recurring', true)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(3),
  ])

  // Compute spent per category for budget widget
  const spentMap: Record<string, number> = {}
  for (const tx of budgetTx ?? []) {
    if (tx.category_id) spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + tx.amount
  }
  const budgets: Budget[] = (rawBudgets ?? []).map(b => {
    const spent = spentMap[b.category_id] ?? 0
    const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
    return { ...b, spent, remaining: effective - spent, percentage: effective > 0 ? (spent / effective) * 100 : 0 }
  })

  // Compute monthly sub total for widget
  const subMonthlyTotal = (upcomingSubs ?? []).reduce((s: number, b: Bill) => {
    const monthly = b.recurrence_interval === 'weekly'
      ? b.amount * (52 / 12)
      : b.recurrence_interval === 'yearly'
      ? b.amount / 12
      : b.amount
    return s + monthly
  }, 0)

  return (
    <DashboardClient
      accounts={accounts ?? []}
      recentTransactions={recentTx ?? []}
      monthlyTransactions={monthlyTx ?? []}
      profile={profile}
      builtinOverrides={overrides ?? []}
      budgets={budgets}
      upcomingSubs={(upcomingSubs ?? []) as Bill[]}
      subMonthlyTotal={subMonthlyTotal}
    />
  )
}
