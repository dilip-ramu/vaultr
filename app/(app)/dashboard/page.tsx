import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import type { Budget, Bill } from '@/lib/types'
import { generateInsights, type Insight } from '@/lib/insights'
import { fetchProfitLines } from '@/lib/profitability-server'
import { summarize } from '@/lib/profitability'
import { cardOverview, type CardTxn } from '@/lib/cards'
import { getBillablePayeeIds } from '@/lib/reimbursables/customers'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CardDue {
  /** The statement this due belongs to. Marking it paid needs this. */
  statementDate: string
  id: string
  name: string
  color: string | null
  amount: number
  dueDate: string
}

// Card payments still owed (remaining due > 0 only)
async function fetchCardDues(supabase: SupabaseClient, uid: string, today: string): Promise<CardDue[]> {
  const { data: cards } = await supabase
    .from('accounts')
    .select('id, name, color, initial_balance, statement_day, statement_due_day')
    .eq('user_id', uid).eq('type', 'credit').eq('is_active', true)
    .not('statement_day', 'is', null)
  if (!cards?.length) return []

  const since = new Date()
  since.setMonth(since.getMonth() - 14)
  const idList = cards.map(c => c.id).join(',')

  const [{ data: txns }, { data: statements }] = await Promise.all([
    supabase
      .from('transactions')
      .select('account_id, to_account_id, type, amount, date')
      .eq('user_id', uid)
      .gte('date', since.toISOString().split('T')[0])
      .or(`account_id.in.(${idList}),to_account_id.in.(${idList})`),
    supabase
      .from('card_statements')
      // payment_transaction_id is what says "you already paid this statement".
      // Without it the dashboard can't know, and nags you forever.
      .select('account_id, statement_date, bank_amount, payment_transaction_id')
      .eq('user_id', uid),
  ])

  const dues: CardDue[] = []
  for (const card of cards) {
    const bankAmounts: Record<string, number> = {}
    const paidDates: string[] = []
    for (const s of statements ?? []) {
      if (s.account_id !== card.id) continue
      bankAmounts[s.statement_date] = Number(s.bank_amount)
      if ((s as { payment_transaction_id?: string | null }).payment_transaction_id) {
        paidDates.push(s.statement_date)
      }
    }
    const o = cardOverview({
      accountId: card.id,
      initialBalance: Number(card.initial_balance) || 0,
      statementDay: card.statement_day!,
      dueDay: card.statement_due_day,
      txns: (txns ?? []) as CardTxn[],
      bankAmounts,
      paidDates,
      today,
      historyMonths: 2,
    })
    const latest = o.cycles[0]
    // `settled` — the same rule the Cards page uses. Checking remainingDue alone
    // meant a statement you paid ON its close date stayed "due" forever.
    if (latest && !latest.settled && latest.remainingDue > 0) {
      dues.push({
        id: card.id, name: card.name, color: card.color,
        amount: latest.remainingDue, dueDate: latest.dueDate,
        statementDate: latest.statementDate,
      })
    }
  }
  return dues.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

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
      .eq('invoice_type', 'tax_invoice')  // Batch E: skip reimbursements
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const cy = now.getFullYear()
  const cm = now.getMonth()
  const todayStr = now.toISOString().split('T')[0]
  const startOfMonth = `${cy}-${String(cm + 1).padStart(2, '0')}-01`
  const endOfMonth = new Date(cy, cm + 1, 0).toISOString().split('T')[0]
  const historyStart = new Date(cy, cm - 4, 1).toISOString().split('T')[0]

  // ── Pulse-band period (Month / Quarter / Year / Custom) ──────────────────
  const sp = await searchParams
  const period = ['month', 'quarter', 'year', 'custom'].includes(sp.period ?? '') ? sp.period! : 'month'
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const iso = (y: number, m0: number, d: number) => `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  let periodStart = startOfMonth, periodEnd = endOfMonth, periodLabel = `${MON[cm]} ${cy}`
  if (period === 'quarter') {
    const q = Math.floor(cm / 3)
    periodStart = iso(cy, q * 3, 1); periodEnd = new Date(cy, q * 3 + 3, 0).toISOString().split('T')[0]
    periodLabel = `Q${q + 1} ${cy}`
  } else if (period === 'year') {
    periodStart = `${cy}-01-01`; periodEnd = `${cy}-12-31`; periodLabel = `${cy}`
  } else if (period === 'custom' && sp.from && sp.to) {
    periodStart = sp.from; periodEnd = sp.to
    periodLabel = `${new Date(sp.from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(sp.to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  }

  // Fast path: ONE round trip for all dashboard data (migration_v34) + profit lines + card dues
  // Also: every payee linked to a customer = reimbursable, exclude them from
  // "your" spending (generalised from the old "Contrast"-by-name rule).
  const [{ data: dash, error: dashError }, profitLines, cardDues, billablePayeeIds, { data: fxRows }] = await Promise.all([
    supabase.rpc('get_dashboard_data', {
      p_month_start: startOfMonth,
      p_month_end: endOfMonth,
      p_history_start: historyStart,
      p_today: todayStr,
    }),
    fetchProfitLines(supabase, user!.id),
    fetchCardDues(supabase, user!.id, todayStr),
    getBillablePayeeIds(supabase, user!.id),
    // Accounts can hold foreign currency. Totalling them without rates would be
    // adding rupees to euros — so the rates come with the data, not after it.
    supabase.from('currency_rates').select('currency, market_rate').eq('user_id', user!.id),
  ])
  const billableSet = new Set<string>(billablePayeeIds)

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

  // For non-month periods, re-scope the pulse-band income/expense to the range.
  if (period !== 'month') {
    const { data: ptx } = await supabase
      .from('transactions')
      .select('type, amount, date')
      .eq('user_id', user!.id)
      .gte('date', periodStart)
      .lte('date', periodEnd)
    d.monthlyTx = ptx ?? []
  }

  // Month-to-date profitability (1st → today)
  const profitMTD = summarize(profitLines, startOfMonth, todayStr)

  // Net spend per category — expense adds, income subtracts.
  // Skip any payee linked to a customer (= reimbursable). Also keep the
  // legacy contrast_payee_id check as a belt-and-suspenders for pre-link
  // data (the RPC still returns it).
  const spentMap: Record<string, number> = {}
  for (const tx of d.budgetTx) {
    if (!tx.category_id) continue
    if (tx.payee_id && billableSet.has(tx.payee_id)) continue
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

  // ── Per-payee expense breakdown (current month, by category) ───────────────
  // One ring per payee, arc segments coloured per category. Contrast IS
  // included here — the user wants to see it on the dashboard even though it's
  // excluded from budgets/insights (where it would distort the limits).
  const { data: payeeRingsRaw } = await supabase
    .from('transactions')
    .select('amount, payee_id, category_id, payees:payee_id(id, name), categories:category_id(id, name, color)')
    .eq('user_id', user!.id)
    .eq('type', 'expense')
    .gte('date', startOfMonth)
    .lte('date', endOfMonth)

  type PayeeSlice = { categoryId: string; categoryName: string; color: string; amount: number }
  type PayeeRing = { payeeId: string; payeeName: string; total: number; slices: PayeeSlice[] }
  const payeeMap = new Map<string, PayeeRing>()
  for (const tx of (payeeRingsRaw ?? []) as unknown as Array<{
    amount: number; payee_id: string | null; category_id: string | null;
    payees: { id: string; name: string } | null;
    categories: { id: string; name: string; color: string } | null;
  }>) {
    const pid = tx.payees?.id ?? '__none__'
    const pname = tx.payees?.name ?? 'No payee'
    const ring = payeeMap.get(pid) ?? { payeeId: pid, payeeName: pname, total: 0, slices: [] }
    const amt = Math.abs(Number(tx.amount) || 0)
    if (amt === 0) continue
    ring.total += amt
    const cid = tx.categories?.id ?? '__none__'
    const cname = tx.categories?.name ?? 'Uncategorised'
    const ccolor = tx.categories?.color ?? '#94a3b8'
    const existing = ring.slices.find(s => s.categoryId === cid)
    if (existing) existing.amount += amt
    else ring.slices.push({ categoryId: cid, categoryName: cname, color: ccolor, amount: amt })
    payeeMap.set(pid, ring)
  }
  const payeeRings: PayeeRing[] = Array.from(payeeMap.values())
    .map(r => ({ ...r, slices: r.slices.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.total - a.total)

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
      period={period}
      periodLabel={periodLabel}
      periodFrom={sp.from ?? ''}
      periodTo={sp.to ?? ''}
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
      cardDues={cardDues}
      fxRates={(fxRows ?? []) as { currency: string; market_rate: number }[]}
      unbilledInvoices={d.unbilledInvoices as unknown as { id: string; amount: number; invoice_date: string; linked_customer_name: string | null; supplier: { name: string } | null }[]}
      payeeRings={payeeRings}
    />
  )
}
