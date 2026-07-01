import { createClient } from '@/lib/supabase/server'
import ForecastClient from '@/components/forecast/ForecastClient'
import { buildForecast, type ForecastItem } from '@/lib/forecast'
import { cardOverview, type CardTxn } from '@/lib/cards'
import { isLiability } from '@/lib/account-metrics'

export const dynamic = 'force-dynamic'

export default async function ForecastPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const today = new Date().toISOString().split('T')[0]

  const [
    { data: accounts },
    { data: customerInvoices },
    { data: commissionStyles },
    { data: supplierInvoices },
    { data: bills },
    { data: payrollMonths },
    { data: payrollEntries },
    { data: cardAccounts },
    { data: cardStatements },
  ] = await Promise.all([
    supabase.from('account_balances')
      .select('id, type, balance, include_in_net_worth')
      .eq('user_id', uid).eq('is_active', true),
    supabase.from('recoverable_invoices')
      .select('invoice_number, customer_name, balance_due, due_date, invoice_date')
      .eq('user_id', uid).eq('invoice_type', 'tax_invoice')  // Batch E: skip reimbursements
      .in('status', ['sent', 'overdue']).gt('balance_due', 0),
    supabase.from('commission_styles')
      .select('style_ref, commission_inr, expected_payment_date')
      .eq('user_id', uid).eq('order_status', 'shipped')
      .not('expected_payment_date', 'is', null),
    supabase.from('supplier_invoices')
      .select('invoice_number, payee_name, amount, due_date, invoice_date, supplier:suppliers(name)')
      .eq('user_id', uid).eq('is_paid', false).neq('status', 'cancelled'),
    supabase.from('bills')
      .select('name, amount, due_date')
      .eq('user_id', uid).eq('status', 'pending'),
    supabase.from('payroll_months')
      .select('id, payroll_month, payment_date')
      .eq('user_id', uid).eq('is_finalized', true).eq('is_paid', false),
    supabase.from('payroll_entries')
      .select('payroll_month_id, final_payable')
      .eq('user_id', uid),
    supabase.from('accounts')
      .select('id, name, initial_balance, statement_day, statement_due_day')
      .eq('user_id', uid).eq('type', 'credit').eq('is_active', true)
      .not('statement_day', 'is', null),
    supabase.from('card_statements')
      .select('account_id, statement_date, bank_amount')
      .eq('user_id', uid),
  ])

  // Starting balance: cash-like accounts only (credit/loan are obligations)
  const startingBalance = (accounts ?? [])
    .filter(a => !isLiability(a.type))
    .reduce((s, a) => s + (Number(a.balance) || 0), 0)

  const items: ForecastItem[] = []

  for (const inv of customerInvoices ?? []) {
    items.push({
      label: `${inv.invoice_number} · ${inv.customer_name}`,
      kind: 'customer_invoice', direction: 'in',
      amount: Number(inv.balance_due),
      date: inv.due_date ?? inv.invoice_date,
    })
  }

  for (const cs of commissionStyles ?? []) {
    if (!Number(cs.commission_inr)) continue
    items.push({
      label: `Commission${cs.style_ref ? ` · ${cs.style_ref}` : ''}`,
      kind: 'commission', direction: 'in',
      amount: Number(cs.commission_inr),
      date: cs.expected_payment_date!,
    })
  }

  for (const inv of supplierInvoices ?? []) {
    const sup = inv.supplier as { name: string } | { name: string }[] | null
    const supName = Array.isArray(sup) ? sup[0]?.name : sup?.name
    items.push({
      label: `${supName ?? inv.payee_name ?? 'Supplier'}${inv.invoice_number ? ` · ${inv.invoice_number}` : ''}`,
      kind: 'supplier_invoice', direction: 'out',
      amount: Number(inv.amount),
      date: inv.due_date ?? inv.invoice_date,
    })
  }

  for (const b of bills ?? []) {
    items.push({
      label: b.name, kind: 'bill', direction: 'out',
      amount: Number(b.amount), date: b.due_date,
    })
  }

  // Unpaid finalized payroll: total payable, expected on payment_date or the
  // 1st of the month after the payroll month
  const entryTotals = new Map<string, number>()
  for (const e of payrollEntries ?? []) {
    entryTotals.set(e.payroll_month_id, (entryTotals.get(e.payroll_month_id) ?? 0) + Number(e.final_payable))
  }
  for (const pm of payrollMonths ?? []) {
    const total = entryTotals.get(pm.id) ?? 0
    if (!total) continue
    const [y, m] = pm.payroll_month.split('-').map(Number)
    const fallback = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
    items.push({
      label: `Payroll · ${pm.payroll_month}`,
      kind: 'payroll', direction: 'out',
      amount: total,
      date: pm.payment_date ?? fallback,
    })
  }

  // Card dues: latest closed statement's remaining due
  if ((cardAccounts ?? []).length > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - 14)
    const idList = (cardAccounts ?? []).map(c => c.id).join(',')
    const { data: cardTxns } = await supabase
      .from('transactions')
      .select('account_id, to_account_id, type, amount, date')
      .eq('user_id', uid)
      .gte('date', since.toISOString().split('T')[0])
      .or(`account_id.in.(${idList}),to_account_id.in.(${idList})`)

    for (const card of cardAccounts ?? []) {
      const bankAmounts: Record<string, number> = {}
      for (const s of cardStatements ?? []) {
        if (s.account_id === card.id) bankAmounts[s.statement_date] = Number(s.bank_amount)
      }
      const o = cardOverview({
        accountId: card.id,
        initialBalance: Number(card.initial_balance) || 0,
        statementDay: card.statement_day!,
        dueDay: card.statement_due_day,
        txns: (cardTxns ?? []) as CardTxn[],
        bankAmounts,
        today,
        historyMonths: 2,
      })
      const latest = o.cycles[0]
      if (latest && latest.remainingDue > 0) {
        items.push({
          label: `${card.name} card payment`,
          kind: 'card_due', direction: 'out',
          amount: latest.remainingDue,
          date: latest.dueDate,
        })
      }
    }
  }

  const forecast = buildForecast({ startingBalance, items, today })

  return <ForecastClient forecast={forecast} />
}
