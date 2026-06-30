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

  // ── Contrast customer (for recoverable invoice matching) ──────────────────
  const { data: contrastCustomers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', '%contrast%')
    .order('name')
  const contrastCustomer = contrastCustomers?.[0] ?? null

  // ── Employees billable to THIS customer (works_for + not excluded) ────────
  // Was: every active employee — which incorrectly added "Me" staff to the
  // Contrast invoice. Now: only employees whose Works-for is Contrast AND
  // whose "Include salary in client invoice" is on.
  const { data: employees } = contrastCustomer
    ? await supabase
        .from('employees')
        .select('id, name, salary_euro, designation, works_for_customer_id, exclude_from_invoicing')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .eq('works_for_customer_id', contrastCustomer.id)
        .eq('exclude_from_invoicing', false)
        .order('name')
    : { data: [] }

  // ── Unlinked courier (recoverable) invoices for Contrast ──────────────────
  // These are invoices in the Recoverables module sent to Contrast Company A/S
  // that haven't been included in a proforma invoice yet.
  const { data: courierInvoices } = contrastCustomer
    ? await supabase
        .from('recoverable_invoices')
        .select('id, invoice_number, total, invoice_date, status, customer_name')
        .eq('user_id', user!.id)
        .eq('customer_id', contrastCustomer.id)
        .is('contrast_invoice_id', null)
        .not('status', 'eq', 'cancelled')
        .order('invoice_date', { ascending: false })
    : { data: [] }

  // ── Contrast payee (for expense transactions) ─────────────────────────────
  const { data: contrastPayees } = await supabase
    .from('payees')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', '%contrast%')
    .order('name')
  const contrastPayee = contrastPayees?.[0] ?? null

  // ── Queued expenses — categorized, unbilled ───────────────────────────────
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

  // ── Count of uncategorized expenses (nudge banner) ────────────────────────
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

  return (
    <ContrastInvoiceClient
      employees={(employees ?? []) as never[]}
      courierInvoices={(courierInvoices ?? []) as never[]}
      allExpenses={(queuedExpenses ?? []) as never[]}
      companyName={profile?.full_name ?? ''}
      uncategorizedCount={uncategorizedCount ?? 0}
    />
  )
}
