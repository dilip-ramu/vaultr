import { createClient } from '@/lib/supabase/server'
import BudgetsClient from '@/components/budgets/BudgetsClient'
import InsightsClient from '@/components/insights/InsightsClient'
import type { Budget } from '@/lib/types'
import { bounds, fyBounds, type PeriodKey } from '@/lib/budget-insights/period'
import { getBillablePayeeIds } from '@/lib/reimbursables/customers'

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
    billablePayeeIds,
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
    // ANY payee linked to a customer is reimbursable (generalised from the
    // old "Contrast"-by-name rule).
    getBillablePayeeIds(supabase, uid),
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

  const billableSet = new Set(billablePayeeIds)

  // Exclude transactions tagged with any customer-linked payee from "your"
  // spending (they're reimbursable, not real expense for budget purposes).
  const historyTx = (historyTxRaw ?? []).filter(tx =>
    !tx.payee_id || !billableSet.has(tx.payee_id)
  )

  // Slice to the selected period for budget computation.
  const periodTx = historyTx.filter(tx =>
    tx.date >= periodStart && tx.date <= periodEnd && tx.category_id != null
  )

  // Net spend per category (over the selected period): expense adds, income
  // (refunds) subtracts. Clamp at 0. Used by monthly / weekly budgets.
  const spentMap: Record<string, number> = {}
  for (const tx of periodTx) {
    if (!tx.category_id) continue
    const delta = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
    spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + delta
  }
  for (const k of Object.keys(spentMap)) if (spentMap[k] < 0) spentMap[k] = 0

  // Yearly budgets are ALWAYS tracked across the whole financial year
  // (India: 1 April → 31 March), independent of the top-level period filter.
  // A yearly ₹60,000 budget shows spent-to-date against the full ₹60,000,
  // not sliced per month.
  const yearlyBudgetCategoryIds = new Set(
    (rawBudgets ?? []).filter(b => b.period === 'yearly').map(b => b.category_id)
  )
  const fySpentMap: Record<string, number> = {}
  if (yearlyBudgetCategoryIds.size > 0) {
    const { start: fyStart, end: fyEnd } = fyBounds(new Date())
    const { data: fyTx } = await supabase
      .from('transactions')
      .select('category_id, amount, payee_id, type')
      .eq('user_id', uid)
      .in('type', ['expense', 'income'])
      .not('category_id', 'is', null)
      .gte('date', fyStart)
      .lte('date', fyEnd)
    for (const tx of (fyTx ?? [])) {
      if (!tx.category_id || !yearlyBudgetCategoryIds.has(tx.category_id)) continue
      if (tx.payee_id && billableSet.has(tx.payee_id)) continue
      const delta = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
      fySpentMap[tx.category_id] = (fySpentMap[tx.category_id] ?? 0) + delta
    }
    for (const k of Object.keys(fySpentMap)) if (fySpentMap[k] < 0) fySpentMap[k] = 0
  }

  // Scale monthly + weekly budgets to match the selected period length.
  // Yearly budgets are NEVER scaled — they track the full FY.
  const scaleForPeriod = (b: { period?: string | null; amount: number; rollover?: boolean; rollover_amount?: number }) => {
    const base = b.amount + (b.rollover ? (b.rollover_amount ?? 0) : 0)
    if (b.period === 'yearly') return base
    if (!periodMonths || periodMonths <= 0) return base
    if (b.period === 'weekly') return base * (periodMonths * 52 / 12)
    // monthly (default)
    return base * periodMonths
  }

  const budgets: Budget[] = (rawBudgets ?? []).map(b => {
    const isYearly = b.period === 'yearly'
    const spent = isYearly ? (fySpentMap[b.category_id] ?? 0) : (spentMap[b.category_id] ?? 0)
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
        contrastPayeeIds={billablePayeeIds}
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
