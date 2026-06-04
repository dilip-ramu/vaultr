import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import type { Budget, Bill } from '@/lib/types'
import { generateInsights, type Insight } from '@/lib/insights'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const cy = now.getFullYear()
  const cm = now.getMonth()
  const todayStr = now.toISOString().split('T')[0]
  const startOfMonth = `${cy}-${String(cm + 1).padStart(2, '0')}-01`
  const endOfMonth = new Date(cy, cm + 1, 0).toISOString().split('T')[0]
  const historyStart = new Date(cy, cm - 4, 1).toISOString().split('T')[0]

  const [
    { data: accounts },
    { data: recentTx },
    { data: monthlyTx },
    { data: profile },
    { data: overrides },
    { data: rawBudgets },
    { data: budgetTx },
    { data: upcomingSubs },
    { data: historyTx },
    { data: receivableInvoices },
    { data: unbilledInvoices },
    { data: contrastPayee },
    { data: commissionStyles },
    { data: commissionDueStyles },
    { data: dueBills },
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
      .select('category_id, amount, payee_id, type')
      .eq('user_id', user!.id)
      .in('type', ['expense', 'income'])
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
    supabase
      .from('transactions')
      .select('id, type, amount, date, name, category:categories(id,name,icon,color,avatar_url)')
      .eq('user_id', user!.id)
      .gte('date', historyStart)
      .order('date', { ascending: false })
      .limit(300),
    supabase
      .from('recoverable_invoices')
      .select('balance_due')
      .eq('user_id', user!.id)
      .in('status', ['sent', 'overdue'])
      .gt('balance_due', 0),
    supabase
      .from('supplier_invoices')
      .select('id, amount, invoice_date, linked_customer_name, supplier:suppliers(name)')
      .eq('user_id', user!.id)
      .eq('is_recoverable', true)
      .eq('recoverable_status', 'pending_billing')
      .order('invoice_date', { ascending: false }),
    supabase
      .from('payees')
      .select('id')
      .eq('user_id', user!.id)
      .ilike('name', 'contrast')
      .maybeSingle(),
    supabase
      .from('commission_styles')
      .select('commission_inr, order_status')
      .eq('user_id', user!.id)
      .not('order_status', 'in', '(received,cancelled)'),
    supabase
      .from('commission_styles')
      .select('commission_inr, expected_payment_date')
      .eq('user_id', user!.id)
      .eq('order_status', 'shipped')
      .lte('expected_payment_date', todayStr),
    supabase
      .from('bills')
      .select('id, name, amount, due_date')
      .eq('user_id', user!.id)
      .eq('status', 'pending')
      .lte('due_date', todayStr),
  ])

  // Net spend per category — expense adds, income subtracts; excludes Contrast payee
  const contrastPayeeId = contrastPayee?.id ?? null
  const spentMap: Record<string, number> = {}
  for (const tx of budgetTx ?? []) {
    if (!tx.category_id) continue
    if (contrastPayeeId && tx.payee_id === contrastPayeeId) continue
    const delta = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
    spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + delta
  }
  for (const k of Object.keys(spentMap)) {
    if (spentMap[k] < 0) spentMap[k] = 0
  }
  const budgets: Budget[] = (rawBudgets ?? []).map(b => {
    const spent = spentMap[b.category_id] ?? 0
    const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
    return { ...b, spent, remaining: effective - spent, percentage: effective > 0 ? (spent / effective) * 100 : 0 }
  })

  // Compute top insights for dashboard widget
  const topInsights: Insight[] = generateInsights({
    transactions: (historyTx ?? []) as never[],
    accounts: accounts ?? [],
    budgets,
    currentMonth: now,
  }).slice(0, 2)

  const totalReceivables = (receivableInvoices ?? []).reduce((s, inv) => s + (inv.balance_due ?? 0), 0)

  const commissionPending = (commissionStyles ?? []).reduce((s, c) => s + (Number(c.commission_inr) || 0), 0)
  const commissionPendingCount = (commissionStyles ?? []).length

  // Overdue alerts for the top banner (refresh-based, disappears once paid/received)
  const commissionDueTotal = (commissionDueStyles ?? []).reduce((s, c) => s + (Number(c.commission_inr) || 0), 0)
  const commissionDueCount = (commissionDueStyles ?? []).length
  const billsDueTotal = (dueBills ?? []).reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const billsDueCount = (dueBills ?? []).length

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
      chartTransactions={(historyTx ?? []) as { type: string; amount: number; date: string }[]}
      profile={profile}
      builtinOverrides={overrides ?? []}
      budgets={budgets}
      upcomingSubs={(upcomingSubs ?? []) as Bill[]}
      subMonthlyTotal={subMonthlyTotal}
      topInsights={topInsights}
      totalReceivables={totalReceivables}
      commissionPending={commissionPending}
      commissionPendingCount={commissionPendingCount}
      commissionDueTotal={commissionDueTotal}
      commissionDueCount={commissionDueCount}
      billsDueTotal={billsDueTotal}
      billsDueCount={billsDueCount}
      unbilledInvoices={(unbilledInvoices ?? []) as unknown as { id: string; amount: number; invoice_date: string; linked_customer_name: string | null; supplier: { name: string } | null }[]}
    />
  )
}
