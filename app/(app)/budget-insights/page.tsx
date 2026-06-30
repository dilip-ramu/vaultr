import { createClient } from '@/lib/supabase/server'
import BudgetsClient from '@/components/budgets/BudgetsClient'
import InsightsClient from '@/components/insights/InsightsClient'
import type { Budget } from '@/lib/types'
import { bounds, type PeriodKey } from '@/lib/budget-insights/period'

export const dynamic = 'force-dynamic'

// Single page that shows Budgets above and Insights below using one consistent
// calculation across an arbitrary period (URL-driven). Contrast-billed
// transactions are always excluded.
export default async function BudgetInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const sp = await searchParams
  const period = (sp.period as PeriodKey | undefined) ?? 'this_month'
  const { from: periodStart, to: periodEnd, label: periodLabel, months: periodMonths } =
    bounds(period, sp.from ?? null, sp.to ?? null)

  // Pull enough history for trend comparison: the selected period + an equally
  // long window right before it.
  const startMs = new Date(periodStart).getTime()
  const endMs   = new Date(periodEnd).getTime()
  const lenMs   = endMs - startMs + 86400000
  const historyStart = new Date(startMs - lenMs).toISOString().slice(0, 10)

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
    supabase
      .from('transactions')
      .select('id, type, amount, date, name, category_id, payee_id, category:categories(id,name,icon,color,avatar_url), account:accounts!account_id(id,name,color,type)')
      .eq('user_id', uid)
      .gte('date', historyStart)
      .lte('date', periodEnd)
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
      .gte('due_date', new Date().toISOString().slice(0, 10)),
  ])

  const contrastPayeeId = contrastPayee?.id ?? null

  // Always-exclude Contrast — same rule as the dashboard's payee chart inverts.
  const historyTx = (historyTxRaw ?? []).filter(tx =>
    !contrastPayeeId || tx.payee_id !== contrastPayeeId
  )

  // Slice to the selected period for budget computation.
  const periodTx = historyTx.filter(tx =>
    tx.date >= periodStart && tx.date <= periodEnd && tx.category_id != null
  )

  // Net spend per category: expense adds, income (refunds) subtracts. Clamp at 0.
  const spentMap: Record<string, number> = {}
  for (const tx of periodTx) {
    if (!tx.category_id) continue
    const delta = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
    spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + delta
  }
  for (const k of Object.keys(spentMap)) if (spentMap[k] < 0) spentMap[k] = 0

  // Scale each budget's limit to match the selected period length so the
  // percentage is fair. A ₹5,000 monthly budget across 3 months becomes ₹15,000.
  const scaleForPeriod = (b: { period?: string | null; amount: number; rollover?: boolean; rollover_amount?: number }) => {
    const base = b.amount + (b.rollover ? (b.rollover_amount ?? 0) : 0)
    if (!periodMonths || periodMonths <= 0) return base
    if (b.period === 'yearly') return base * (periodMonths / 12)
    if (b.period === 'weekly') return base * (periodMonths * 52 / 12)
    // monthly (default)
    return base * periodMonths
  }

  const budgets: Budget[] = (rawBudgets ?? []).map(b => {
    const spent = spentMap[b.category_id] ?? 0
    const effective = scaleForPeriod(b)
    return {
      ...b,
      spent,
      remaining: effective - spent,
      percentage: effective > 0 ? (spent / effective) * 100 : 0,
    }
  })

  const now = new Date()

  return (
    <div className="space-y-6">
      <BudgetsClient
        budgets={budgets}
        expenseCategories={expenseCategories ?? []}
        currentMonth={now.getMonth() + 1}
        currentYear={now.getFullYear()}
        contrastPayeeId={contrastPayeeId}
        hideHeader
        periodLabel={periodLabel}
      />
      <div className="h-px" style={{ background: 'var(--border)' }} />
      <InsightsClient
        transactions={historyTx as never[]}
        accounts={accounts ?? []}
        budgets={budgets}
        bills={(bills ?? []) as never[]}
        currentMonth={now.toISOString()}
        hideHeader
        periodStart={periodStart}
        periodEnd={periodEnd}
        periodLabel={periodLabel}
      />
    </div>
  )
}
