import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import type { Budget, Bill } from '@/lib/types'
import { generateInsights, type Insight } from '@/lib/insights'
import { fetchProfitLines } from '@/lib/profitability-server'
import { summarize } from '@/lib/profitability'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Everything the dashboard needs, regardless of which path fetched it
/* eslint-disable @typescript-eslint/no-explicit-any */
interface DashboardData {
  accounts: any[]
  recentTx: any[]
  monthlyTx: any[]
  profile: any
  overrides: any[]
  rawBudgets: any[]
  budgetTx: any[]
  upcomingSubs: any[]
  historyTx: any[]
  receivableInvoices: any[]
  unbilledInvoices: any[]
  contrastPayeeId: string | null
  commissionStyles: any[]
  commissionDueStyles: any[]
  dueBills: any[]
}

// Fallback path (migration_v34 not run yet): the original ~15 parallel queries
async function fetchDashboardFallback(
  supabase: SupabaseClient,
  uid: string,
  startOfMonth: string,
  endOfMonth: string,
  historyStart: string,
  todayStr: string,
): Promise<DashboardData> {
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
      .eq('user_id', uid)
      .eq('is_active', true)
      .order('created_at'),
    supabase
      .from('transactions')
      .select(`*, account:accounts!account_id(id,name,color,type,custom_type_id), category:categories(id,name,icon,color,avatar_url)`)
      .eq('user_id', uid)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('transactions')
      .select('type, amount, date')
      .eq('user_id', uid)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth),
    supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single(),
    supabase
      .from('builtin_account_type_overrides')
      .select('*')
      .eq('user_id', uid),
    supabase
      .from('budgets')
      .select('*, category:categories(id,name,icon,color,avatar_url)')
      .eq('user_id', uid)
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('category_id, amount, payee_id, type')
      .eq('user_id', uid)
      .in('type', ['expense', 'income'])
      .not('category_id', 'is', null)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth),
    supabase
      .from('bills')
      .select('*, category:categories(id,name,icon,color,avatar_url)')
      .eq('user_id', uid)
      .eq('is_recurring', true)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(3),
    supabase
      .from('transactions')
      .select('id, type, amount, date, name, category:categories(id,name,icon,color,avatar_url)')
      .eq('user_id', uid)
      .gte('date', historyStart)
      .order('date', { ascending: false })
      .limit(300),
    supabase
      .from('recoverable_invoices')
      .select('balance_due')
      .eq('user_id', uid)
      .in('status', ['sent', 'overdue'])
      .gt('balance_due', 0),
    supabase
      .from('supplier_invoices')
      .select('id, amount, invoice_date, linked_customer_name, supplier:suppliers(name)')
      .eq('user_id', uid)
      .eq('is_recoverable', true)
      .eq('recoverable_status', 'pending_billing')
      .order('invoice_date', { ascending: false }),
    supabase
      .from('payees')
      .select('id')
      .eq('user_id', uid)
      .ilike('name', 'contrast')
      .maybeSingle(),
    supabase
      .from('commission_styles')
      .select('commission_inr, order_status')
      .eq('user_id', uid)
      .not('order_status', 'in', '(received,cancelled)'),
    supabase
      .from('commission_styles')
      .select('commission_inr, expected_payment_date')
      .eq('user_id', uid)
      .eq('order_status', 'shipped')
      .lte('expected_payment_date', todayStr),
    supabase
      .from('bills')
      .select('id, name, amount, due_date')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .lte('due_date', todayStr),
  ])

  return {
    accounts: accounts ?? [],
    recentTx: recentTx ?? [],
    monthlyTx: monthlyTx ?? [],
    profile,
    overrides: overrides ?? [],
    rawBudgets: rawBudgets ?? [],
    budgetTx: budgetTx ?? [],
    upcomingSubs: upcomingSubs ?? [],
    historyTx: historyTx ?? [],
    receivableInvoices: receivableInvoices ?? [],
    unbilledInvoices: unbilledInvoices ?? [],
    contrastPayeeId: contrastPayee?.id ?? null,
    commissionStyles: commissionStyles ?? [],
    commissionDueStyles: commissionDueStyles ?? [],
    dueBills: dueBills ?? [],
  }
}

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

  // Fast path: ONE round trip for all dashboard data (migration_v34) + profit lines
  const [{ data: dash, error: dashError }, profitLines] = await Promise.all([
    supabase.rpc('get_dashboard_data', {
      p_month_start: startOfMonth,
      p_month_end: endOfMonth,
      p_history_start: historyStart,
      p_today: todayStr,
    }),
    fetchProfitLines(supabase, user!.id),
  ])

  const d: DashboardData = !dashError && dash
    ? {
        accounts: dash.accounts ?? [],
        recentTx: dash.recent_tx ?? [],
        monthlyTx: dash.monthly_tx ?? [],
        profile: dash.profile ?? null,
        overrides: dash.overrides ?? [],
        rawBudgets: dash.budgets ?? [],
        budgetTx: dash.budget_tx ?? [],
        upcomingSubs: dash.upcoming_subs ?? [],
        historyTx: dash.history_tx ?? [],
        receivableInvoices: dash.receivable_invoices ?? [],
        unbilledInvoices: dash.unbilled_invoices ?? [],
        contrastPayeeId: dash.contrast_payee_id ?? null,
        commissionStyles: dash.commission_styles ?? [],
        commissionDueStyles: dash.commission_due_styles ?? [],
        dueBills: dash.due_bills ?? [],
      }
    : await fetchDashboardFallback(supabase, user!.id, startOfMonth, endOfMonth, historyStart, todayStr)

  // Month-to-date profitability (1st → today)
  const profitMTD = summarize(profitLines, startOfMonth, todayStr)

  // Net spend per category — expense adds, income subtracts; excludes Contrast payee
  const spentMap: Record<string, number> = {}
  for (const tx of d.budgetTx) {
    if (!tx.category_id) continue
    if (d.contrastPayeeId && tx.payee_id === d.contrastPayeeId) continue
    const delta = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
    spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + delta
  }
  for (const k of Object.keys(spentMap)) {
    if (spentMap[k] < 0) spentMap[k] = 0
  }
  const budgets: Budget[] = d.rawBudgets.map(b => {
    const spent = spentMap[b.category_id] ?? 0
    const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
    return { ...b, spent, remaining: effective - spent, percentage: effective > 0 ? (spent / effective) * 100 : 0 }
  })

  // Compute top insights for dashboard widget
  const topInsights: Insight[] = generateInsights({
    transactions: d.historyTx as never[],
    accounts: d.accounts,
    budgets,
    currentMonth: now,
  }).slice(0, 2)

  const totalReceivables = d.receivableInvoices.reduce((s, inv) => s + (inv.balance_due ?? 0), 0)

  const commissionPending = d.commissionStyles.reduce((s, c) => s + (Number(c.commission_inr) || 0), 0)
  const commissionPendingCount = d.commissionStyles.length

  // Overdue alerts for the top banner (refresh-based, disappears once paid/received)
  const commissionDueTotal = d.commissionDueStyles.reduce((s, c) => s + (Number(c.commission_inr) || 0), 0)
  const commissionDueCount = d.commissionDueStyles.length
  const billsDueTotal = d.dueBills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const billsDueCount = d.dueBills.length

  // Compute monthly sub total for widget
  const subMonthlyTotal = d.upcomingSubs.reduce((s: number, b: Bill) => {
    const monthly = b.recurrence_interval === 'weekly'
      ? b.amount * (52 / 12)
      : b.recurrence_interval === 'yearly'
      ? b.amount / 12
      : b.amount
    return s + monthly
  }, 0)

  return (
    <DashboardClient
      accounts={d.accounts}
      recentTransactions={d.recentTx}
      monthlyTransactions={d.monthlyTx}
      chartTransactions={d.historyTx as { type: string; amount: number; date: string }[]}
      profile={d.profile}
      builtinOverrides={d.overrides}
      budgets={budgets}
      upcomingSubs={d.upcomingSubs as Bill[]}
      subMonthlyTotal={subMonthlyTotal}
      topInsights={topInsights}
      totalReceivables={totalReceivables}
      commissionPending={commissionPending}
      commissionPendingCount={commissionPendingCount}
      commissionDueTotal={commissionDueTotal}
      commissionDueCount={commissionDueCount}
      billsDueTotal={billsDueTotal}
      billsDueCount={billsDueCount}
      profitMTD={profitMTD}
      unbilledInvoices={d.unbilledInvoices as unknown as { id: string; amount: number; invoice_date: string; linked_customer_name: string | null; supplier: { name: string } | null }[]}
    />
  )
}
