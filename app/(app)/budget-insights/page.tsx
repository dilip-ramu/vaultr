import { createClient } from '@/lib/supabase/server'
import BudgetsClient from '@/components/budgets/BudgetsClient'
import InsightsClient from '@/components/insights/InsightsClient'
import type { Budget } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Single page that shows Budgets above and Insights below using one consistent
// calculation. The earlier two-page split could disagree (Insights summed every
// expense, Budgets excluded contrast-billed ones) which produced "339% over"
// vs "38% used" for the same category. Now everything excludes contrast.
export default async function BudgetInsightsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`
  const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0]
  // 5-month history window for insights (current + 4 prior)
  const historyStart = new Date(year, month - 5, 1).toISOString().split('T')[0]

  const [
    { data: rawBudgets },
    { data: historyTxRaw },
    { data: expenseCategories },
    { data: contrastPayee },
    { data: accounts },
    { data: bills },
  ] = await Promise.all([
    supabase
      .from('budgets')
      .select('*, category:categories(id,name,icon,color,avatar_url)')
      .eq('user_id', uid)
      .eq('is_active', true),
    // Pull the whole 5-month window once. We'll slice down to the current month
    // for budget computation and pass the full set to the insights generator.
    supabase
      .from('transactions')
      .select('id, type, amount, date, name, category_id, payee_id, category:categories(id,name,icon,color,avatar_url), account:accounts!account_id(id,name,color,type)')
      .eq('user_id', uid)
      .gte('date', historyStart)
      .order('date', { ascending: false }),
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', uid)
      .eq('type', 'expense')
      .order('name'),
    supabase
      .from('payees')
      .select('id')
      .eq('user_id', uid)
      .ilike('name', 'contrast')
      .maybeSingle(),
    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', uid)
      .eq('is_active', true),
    supabase
      .from('bills')
      .select('id, name, amount, due_date, status')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .gte('due_date', now.toISOString().split('T')[0]),
  ])

  const contrastPayeeId = contrastPayee?.id ?? null

  // Apply contrast exclusion once, to the whole 5-month window.
  // Anything billed back via "Contrast" is not your spending; it never counts
  // for budgets, top categories, savings rate, or the spending trend.
  const historyTx = (historyTxRaw ?? []).filter(tx =>
    !contrastPayeeId || tx.payee_id !== contrastPayeeId
  )

  // Slice the current month for budget computation.
  const monthTx = historyTx.filter(tx =>
    tx.date >= startOfMonth && tx.date <= endOfMonth && tx.category_id != null
  )

  // Net spend per category: expense adds, income (refunds/reimbursements) subtracts.
  // Clamp at 0 — net income in a category doesn't create negative usage.
  const spentMap: Record<string, number> = {}
  for (const tx of monthTx) {
    if (!tx.category_id) continue
    const delta = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
    spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + delta
  }
  for (const k of Object.keys(spentMap)) {
    if (spentMap[k] < 0) spentMap[k] = 0
  }

  // One canonical budgets[] array — used by both sections.
  const budgets: Budget[] = (rawBudgets ?? []).map(b => {
    const spent = spentMap[b.category_id] ?? 0
    const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
    const remaining = effective - spent
    const percentage = effective > 0 ? (spent / effective) * 100 : 0
    return { ...b, spent, remaining, percentage }
  })

  return (
    <div className="space-y-6">
      <BudgetsClient
        budgets={budgets}
        expenseCategories={expenseCategories ?? []}
        currentMonth={month}
        currentYear={year}
        contrastPayeeId={contrastPayeeId}
        hideHeader
      />
      <div className="h-px" style={{ background: 'var(--border)' }} />
      <InsightsClient
        transactions={historyTx as never[]}
        accounts={accounts ?? []}
        budgets={budgets}
        bills={(bills ?? []) as never[]}
        currentMonth={now.toISOString()}
        hideHeader
      />
    </div>
  )
}
