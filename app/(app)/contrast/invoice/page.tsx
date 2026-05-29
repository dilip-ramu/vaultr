import { createClient } from '@/lib/supabase/server'
import ContrastInvoiceClient from '@/components/contrast/ContrastInvoiceClient'

export const dynamic = 'force-dynamic'

export default async function ContrastInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get profile (company name)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()

  // Get Contrast payee id (for expenses)
  const { data: contrastPayees } = await supabase
    .from('payees')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', '%contrast%')
    .order('name')
  const contrastPayee = contrastPayees?.[0] ?? null

  // Get Contrast customer id (for courier bills)
  const { data: contrastCustomers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', '%contrast%')
    .order('name')
  const contrastCustomer = contrastCustomers?.[0] ?? null

  // Queued expenses — only those WITH a billing category assigned
  // (assigning a billing category in Contrast Expenses = queuing for invoice)
  const { data: queuedExpenses } = contrastPayee
    ? await supabase
        .from('transactions')
        .select(`
          id, name, amount, date, type, notes, is_contrast_billed,
          contrast_billing_category_id, contrast_invoice_id,
          category:categories(id, name, icon, color),
          billing_category:contrast_billing_categories(id, name)
        `)
        .eq('user_id', user!.id)
        .eq('payee_id', contrastPayee.id)
        .eq('is_contrast_billed', false)
        .is('contrast_invoice_id', null)
        .not('contrast_billing_category_id', 'is', null)
        .order('date', { ascending: false })
    : { data: [] }

  // Count of unbilled expenses WITHOUT a billing category (to show a nudge)
  const { count: uncategorizedCount } = contrastPayee
    ? await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('payee_id', contrastPayee.id)
        .eq('is_contrast_billed', false)
        .is('contrast_invoice_id', null)
        .is('contrast_billing_category_id', null)
    : { count: 0 }

  // All unbilled courier bills sent TO Contrast customer (direction = 'sent')
  const { data: allCourierBills } = contrastCustomer
    ? await supabase
        .from('bills')
        .select('id, name, amount, due_date, status, contrast_invoice_id')
        .eq('user_id', user!.id)
        .eq('customer_id', contrastCustomer.id)
        .eq('direction', 'sent')
        .eq('status', 'pending')
        .is('contrast_invoice_id', null)
        .order('due_date', { ascending: false })
    : { data: [] }

  // All payroll months — finalized OR not. Invoice is created before payroll
  // is finalized (forex rate is only known after Contrast payment is received).
  const { data: payrollMonths } = await supabase
    .from('payroll_months')
    .select(`
      id, payroll_month, payment_date, billed_euros, expended_rate, is_finalized,
      entries:payroll_entries(
        id, salary_euro, expended_rate, salary_inr, final_payable,
        employee:payroll_employees(id, name)
      )
    `)
    .eq('user_id', user!.id)
    .order('payroll_month', { ascending: false })

  return (
    <ContrastInvoiceClient
      allExpenses={(queuedExpenses ?? []) as never[]}
      allCourierBills={(allCourierBills ?? []) as never[]}
      payrollMonths={(payrollMonths ?? []) as never[]}
      companyName={profile?.full_name ?? ''}
      uncategorizedCount={uncategorizedCount ?? 0}
    />
  )
}
