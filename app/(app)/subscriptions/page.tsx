import { createClient } from '@/lib/supabase/server'
import SubscriptionsClient from '@/components/subscriptions/SubscriptionsClient'
import type { Bill } from '@/lib/types'

export const dynamic = 'force-dynamic'

function toMonthly(bill: Bill): number {
  switch (bill.recurrence_interval) {
    case 'weekly':  return bill.amount * (52 / 12)
    case 'yearly':  return bill.amount / 12
    default:        return bill.amount
  }
}

export default async function SubscriptionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const startOfYear = `${now.getFullYear()}-01-01`
  const in7Days = new Date(now); in7Days.setDate(now.getDate() + 7)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const [
    { data: rawSubs },
    { data: paidThisYear },
    { data: accounts },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from('bills')
      .select('*, category:categories(id,name,icon,color,avatar_url), account:accounts!account_id(id,name,color,type)')
      .eq('user_id', user!.id)
      .eq('is_recurring', true)
      .eq('status', 'pending')
      .order('due_date', { ascending: true }),
    supabase
      .from('bills')
      .select('amount, recurrence_interval')
      .eq('user_id', user!.id)
      .eq('is_recurring', true)
      .eq('status', 'paid')
      .gte('settled_at', startOfYear),
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

  const subscriptions: Bill[] = rawSubs ?? []

  const monthlyTotal = subscriptions.reduce((s, b) => s + toMonthly(b), 0)
  const yearlyTotal = monthlyTotal * 12

  const dueThisWeek = subscriptions.filter(b => {
    const d = new Date(b.due_date)
    return d >= now && d <= in7Days
  })

  const dueThisMonth = subscriptions.filter(b => b.due_date <= endOfMonth)

  const spentThisYear = (paidThisYear ?? []).reduce((s, b) => s + b.amount, 0)

  return (
    <SubscriptionsClient
      subscriptions={subscriptions}
      dueThisWeek={dueThisWeek}
      dueThisMonth={dueThisMonth}
      monthlyTotal={monthlyTotal}
      yearlyTotal={yearlyTotal}
      spentThisYear={spentThisYear}
      accounts={accounts ?? []}
      categories={categories ?? []}
    />
  )
}
