import { createClient } from '@/lib/supabase/server'
import InsightsClient from '@/components/insights/InsightsClient'
import type { Budget } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function InsightsTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const cy = now.getFullYear()
  const cm = now.getMonth()
  const startOfMonth = `${cy}-${String(cm + 1).padStart(2, '0')}-01`
  const endOfMonth = new Date(cy, cm + 1, 0).toISOString().split('T')[0]

  const historyStart = new Date(cy, cm - 4, 1).toISOString().split('T')[0]

  const [
    { data: txs },
    { data: accounts },
    { data: rawBudgets },
    { data: budgetTx },
    { data: bills },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, type, amount, date, name, category:categories(id,name,icon,color,avatar_url), account:accounts!account_id(id,name,color,type)')
      .eq('user_id', user!.id)
      .gte('date', historyStart)
      .order('date', { ascending: false }),
    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true),
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
      .select('id, name, amount, due_date, status')
      .eq('user_id', user!.id)
      .eq('status', 'pending')
      .gte('due_date', now.toISOString().split('T')[0]),
  ])

  const spentMap: Record<string, number> = {}
  for (const tx of budgetTx ?? []) {
    if (tx.category_id) spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + tx.amount
  }
  const budgets: Budget[] = (rawBudgets ?? []).map(b => {
    const spent = spentMap[b.category_id] ?? 0
    const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
    return { ...b, spent, remaining: effective - spent, percentage: effective > 0 ? (spent / effective) * 100 : 0 }
  })

  return (
    <InsightsClient
      transactions={(txs ?? []) as never[]}
      accounts={accounts ?? []}
      budgets={budgets}
      bills={(bills ?? []) as never[]}
      currentMonth={now.toISOString()}
      hideHeader
    />
  )
}
