import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { from, to } = await req.json() as { from: string; to: string }

  const [
    txRes, acRes, riRes, siRes, ceRes, ciRes, peRes, stRes, blRes,
  ] = await Promise.all([

    // Transactions
    supabase.from('transactions')
      .select('id, date, type, name, amount, currency, notes, category:categories(name), payee:payees(name), account:accounts(name, type)')
      .eq('user_id', user.id)
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false }),

    // Bank accounts (point-in-time — no date filter)
    supabase.from('accounts')
      .select('id, name, type, balance, account_number, bank_name, currency, is_active')
      .eq('user_id', user.id)
      .order('name'),

    // Recoverable invoices
    supabase.from('recoverable_invoices')
      .select('id, invoice_number, invoice_date, due_date, total, status, notes, customer_name')
      .eq('user_id', user.id)
      .gte('invoice_date', from).lte('invoice_date', to)
      .order('invoice_date', { ascending: false }),

    // Supplier invoices
    supabase.from('supplier_invoices')
      .select('id, invoice_number, invoice_date, due_date, total_amount, status, category, supplier:suppliers(name)')
      .eq('user_id', user.id)
      .gte('invoice_date', from).lte('invoice_date', to)
      .order('invoice_date', { ascending: false }),

    // Contrast expenses (transactions with billing category set)
    supabase.from('transactions')
      .select('id, date, name, amount, notes, category:categories(name), billing_category:contrast_billing_categories(name)')
      .eq('user_id', user.id)
      .not('contrast_billing_category_id', 'is', null)
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false }),

    // Contrast invoices
    supabase.from('contrast_invoices')
      .select('id, invoice_number, invoice_month, invoice_date, subtotal, gst_amount, total, status, notes')
      .eq('user_id', user.id)
      .gte('invoice_date', from).lte('invoice_date', to)
      .order('invoice_date', { ascending: false }),

    // Payroll entries (joined to months, filtered by payroll_month)
    supabase.from('payroll_entries')
      .select(`
        salary_euro, expended_rate, salary_inr,
        allowances, overtime, incentives, deductions, advance, final_payable,
        employee:employees(name, employee_id, designation),
        payroll_month:payroll_months(payroll_month, is_finalized, is_paid, payment_date)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),

    // Staff (all employees — point-in-time)
    supabase.from('employees')
      .select('employee_id, name, designation, salary_euro, account_number, ifsc, bank_name, branch, is_active, joining_date')
      .eq('user_id', user.id)
      .order('name'),

    // Bills & subscriptions
    supabase.from('bills')
      .select('id, name, amount, currency, due_date, status, notes, direction, frequency')
      .eq('user_id', user.id)
      .order('due_date', { ascending: false }),
  ])

  return NextResponse.json({
    transactions:        txRes.data  ?? [],
    accounts:            acRes.data  ?? [],
    recoverable_invoices: riRes.data ?? [],
    supplier_invoices:   siRes.data  ?? [],
    contrast_expenses:   ceRes.data  ?? [],
    contrast_invoices:   ciRes.data  ?? [],
    payroll_entries:     peRes.data  ?? [],
    staff:               stRes.data  ?? [],
    bills:               blRes.data  ?? [],
    meta: { from, to, exported_at: new Date().toISOString() },
  })
}
