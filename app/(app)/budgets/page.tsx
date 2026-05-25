import { createClient } from '@/lib/supabase/server'
import BudgetsClient from '@/components/budgets/BudgetsClient'
import type { Budget } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function BudgetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`
  const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0]

  const [
    { data: rawBudgets },
    { data: monthTx },
    { data: expenseCategories },
  ] = await Promise.all([
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
      .from('categories')
      .select('*')
      .eq('user_id', user!.id)
      .eq('type', 'expense')
      .order('name'),
  ])

  // Compute spent per category
  const spentMap: Record<string, number> = {}
  for (const tx of monthTx ?? []) {
    if (tx.category_id) {
      spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + tx.amount
    }
  }

  const budgets: Budget[] = (rawBudgets ?? []).map(b => {
    const spent = spentMap[b.category_id] ?? 0
    const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
    const remaining = effective - spent
    const percentage = effective > 0 ? (spent / effective) * 100 : 0
    return { ...b, spent, remaining, percentage }
  })

  return (
    <BudgetsClient
      budgets={budgets}
      expenseCategories={expenseCategories ?? []}
      currentMonth={month}
      currentYear={year}
    />
  )
}
