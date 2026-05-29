import { createClient } from '@/lib/supabase/server'
import ContrastInvoiceClient from '@/components/contrast/ContrastInvoiceClient'

export const dynamic = 'force-dynamic'

export default async function ContrastInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get finalized payroll months (for month selector)
  const { data: payrollMonths } = await supabase
    .from('payroll_months')
    .select(`
      id, payroll_month, payment_date, billed_euros, received_inr,
      bank_charges, effective_rate, expended_rate, is_finalized, contrast_invoice_id,
      entries:payroll_entries(
        id, salary_euro, expended_rate, salary_inr, final_payable,
        employee:payroll_employees(id, name)
      )
    `)
    .eq('user_id', user!.id)
    .eq('is_finalized', true)
    .order('payroll_month', { ascending: false })

  // Get Contrast customer id
  const { data: contrastCustomer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', '%contrast%')
    .maybeSingle()

  // Get unbilled courier bills for Contrast
  const { data: courierBills } = contrastCustomer
    ? await supabase
        .from('bills')
        .select('id, name, amount, due_date, direction, status, contrast_invoice_id')
        .eq('user_id', user!.id)
        .eq('customer_id', contrastCustomer.id)
        .eq('status', 'pending')
        .is('contrast_invoice_id', null)
        .order('due_date', { ascending: false })
    : { data: [] }

  // Get Contrast payee id
  const { data: contrastPayee } = await supabase
    .from('payees')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', 'contrast')
    .maybeSingle()

  // Get unbilled Contrast expenses (with billing categories)
  const { data: contrastExpenses } = contrastPayee
    ? await supabase
        .from('transactions')
        .select(`
          id, name, amount, date, type, is_contrast_billed,
          contrast_billing_category_id, contrast_invoice_id,
          billing_category:contrast_billing_categories(id, name),
          category:categories(id, name)
        `)
        .eq('user_id', user!.id)
        .eq('payee_id', contrastPayee.id)
        .eq('is_contrast_billed', false)
        .is('contrast_invoice_id', null)
        .order('date', { ascending: false })
    : { data: [] }

  // Get profile (company name)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()

  return (
    <ContrastInvoiceClient
      payrollMonths={(payrollMonths ?? []) as never[]}
      courierBills={(courierBills ?? []) as never[]}
      contrastExpenses={(contrastExpenses ?? []) as never[]}
      companyName={profile?.full_name ?? ''}
    />
  )
}
