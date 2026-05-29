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

  // All unbilled Contrast expenses (all months, with billing category)
  const { data: allExpenses } = contrastPayee
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
        .order('date', { ascending: false })
    : { data: [] }

  // All unbilled courier bills for Contrast customer
  const { data: allCourierBills } = contrastCustomer
    ? await supabase
        .from('bills')
        .select('id, name, amount, due_date, status, contrast_invoice_id')
        .eq('user_id', user!.id)
        .eq('customer_id', contrastCustomer.id)
        .eq('status', 'pending')
        .is('contrast_invoice_id', null)
        .order('due_date', { ascending: false })
    : { data: [] }

  // All finalized payroll months — try without contrast_invoice_id first for resilience
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
    .eq('is_finalized', true)
    .order('payroll_month', { ascending: false })

  return (
    <ContrastInvoiceClient
      allExpenses={(allExpenses ?? []) as never[]}
      allCourierBills={(allCourierBills ?? []) as never[]}
      payrollMonths={(payrollMonths ?? []) as never[]}
      companyName={profile?.full_name ?? ''}
    />
  )
}
