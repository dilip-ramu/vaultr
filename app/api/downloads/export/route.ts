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

    // Transactions — use * to avoid missing-column errors on optional fields
    supabase.from('transactions')
      .select('*, category:categories(name), payee:payees(name), account:accounts(name, type)')
      .eq('user_id', user.id)
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false }),

    // Bank accounts — use * so we get whatever columns exist
    supabase.from('accounts')
      .select('*')
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
      .select('*, supplier:suppliers(name)')
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

    // Payroll entries
    supabase.from('payroll_entries')
      .select('*, employee:employees(name, employee_id, designation), payroll_month:payroll_months(payroll_month, is_finalized, is_paid, payment_date)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),

    // Staff — use * so new columns (account_type etc.) are included automatically
    supabase.from('employees')
      .select('*')
      .eq('user_id', user.id)
      .order('name'),

    // Bills & subscriptions
    supabase.from('bills')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date', { ascending: false }),
  ])

  // Log any query errors server-side for debugging
  const errors: Record<string, string> = {}
  if (txRes.error)  errors.transactions        = txRes.error.message
  if (acRes.error)  errors.accounts            = acRes.error.message
  if (riRes.error)  errors.recoverable_invoices = riRes.error.message
  if (siRes.error)  errors.supplier_invoices   = siRes.error.message
  if (ceRes.error)  errors.contrast_expenses   = ceRes.error.message
  if (ciRes.error)  errors.contrast_invoices   = ciRes.error.message
  if (peRes.error)  errors.payroll_entries     = peRes.error.message
  if (stRes.error)  errors.staff               = stRes.error.message
  if (blRes.error)  errors.bills               = blRes.error.message

  if (Object.keys(errors).length > 0) {
    console.error('[downloads/export] query errors:', errors)
  }

  return NextResponse.json({
    transactions:         txRes.data  ?? [],
    accounts:             acRes.data  ?? [],
    recoverable_invoices: riRes.data  ?? [],
    supplier_invoices:    siRes.data  ?? [],
    contrast_expenses:    ceRes.data  ?? [],
    contrast_invoices:    ciRes.data  ?? [],
    payroll_entries:      peRes.data  ?? [],
    staff:                stRes.data  ?? [],
    bills:                blRes.data  ?? [],
    meta: { from, to, exported_at: new Date().toISOString() },
    // Include query errors in response so the client can surface them
    query_errors: Object.keys(errors).length > 0 ? errors : undefined,
  })
}
