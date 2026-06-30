import { createClient } from '@/lib/supabase/server'
import ContrastInvoiceClient from '@/components/contrast/ContrastInvoiceClient'
import { getReimbursableCustomers, resolveActiveCustomer } from '@/lib/reimbursables/customers'

export const dynamic = 'force-dynamic'

export default async function ContrastInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const { customer: customerParam } = await searchParams

  // Get profile (company name)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', uid)
    .single()

  // ── Active reimbursable customer (+ billing currency) ─────────────────────
  const reimbursables = await getReimbursableCustomers(supabase, uid)
  const active = resolveActiveCustomer(reimbursables, customerParam ?? null)

  let activeCustomer: { id: string; name: string; billing_currency: string } | null = null
  if (active) {
    const { data: full } = await supabase
      .from('customers')
      .select('id, name, billing_currency')
      .eq('id', active.id)
      .eq('user_id', uid)
      .maybeSingle()
    activeCustomer = full as { id: string; name: string; billing_currency: string } | null
  }
  // Legacy fallback for the Contrast customer if none configured yet.
  if (!activeCustomer) {
    const { data: legacy } = await supabase
      .from('customers')
      .select('id, name, billing_currency')
      .eq('user_id', uid)
      .ilike('name', '%contrast%')
      .order('name')
    activeCustomer = (legacy?.[0] as { id: string; name: string; billing_currency: string } | undefined) ?? null
  }

  const billingCurrency = activeCustomer?.billing_currency ?? 'EUR'

  // ── Latest market rate for the customer's currency ────────────────────────
  // The user types their own preferred billing rate; we just show this as a
  // hint so they know what the market is doing.
  const { data: latestRateRows } = await supabase
    .from('currency_rates')
    .select('market_rate, effective_from')
    .eq('user_id', uid)
    .eq('currency', billingCurrency)
    .order('effective_from', { ascending: false })
    .limit(1)
  const marketRate = latestRateRows?.[0]?.market_rate
    ? Number(latestRateRows[0].market_rate)
    : null
  const marketRateAsOf = latestRateRows?.[0]?.effective_from ?? null

  // ── Employees billable to THIS customer ───────────────────────────────────
  const { data: employees } = activeCustomer
    ? await supabase
        .from('employees')
        .select('id, name, salary_euro, designation, works_for_customer_id, exclude_from_invoicing')
        .eq('user_id', uid)
        .eq('is_active', true)
        .eq('works_for_customer_id', activeCustomer.id)
        .eq('exclude_from_invoicing', false)
        .order('name')
    : { data: [] }

  // ── Unlinked courier (recoverable) invoices for THIS customer ─────────────
  const { data: courierInvoices } = activeCustomer
    ? await supabase
        .from('recoverable_invoices')
        .select('id, invoice_number, total, invoice_date, status, customer_name')
        .eq('user_id', uid)
        .eq('customer_id', activeCustomer.id)
        .is('contrast_invoice_id', null)
        .not('status', 'eq', 'cancelled')
        .order('invoice_date', { ascending: false })
    : { data: [] }

  // ── Payee linked to THIS customer (for expense transactions) ──────────────
  const { data: payeeRows } = activeCustomer
    ? await supabase
        .from('payees')
        .select('id, name')
        .eq('user_id', uid)
        .eq('customer_id', activeCustomer.id)
        .order('name')
    : { data: [] }
  let payee: { id: string; name: string } | null = ((payeeRows ?? [])[0] as { id: string; name: string } | undefined) ?? null
  // Legacy fallback: pre-migration the link doesn't exist, name-match.
  if (!payee && activeCustomer) {
    const { data: legacyPayees } = await supabase
      .from('payees')
      .select('id, name')
      .eq('user_id', uid)
      .ilike('name', `%${activeCustomer.name}%`)
      .order('name')
    payee = legacyPayees?.[0] ?? null
  }

  // ── Queued expenses — categorized, unbilled ───────────────────────────────
  const { data: queuedExpenses } = payee
    ? await supabase
        .from('transactions')
        .select(`
          id, name, amount, date, type, notes, is_contrast_billed,
          contrast_billing_category_id, contrast_invoice_id,
          category:categories(id, name, icon, color),
          billing_category:contrast_billing_categories(id, name)
        `)
        .eq('user_id', uid)
        .eq('payee_id', payee.id)
        .eq('is_contrast_billed', false)
        .is('contrast_invoice_id', null)
        .not('contrast_billing_category_id', 'is', null)
        .order('date', { ascending: false })
    : { data: [] }

  // ── Count of uncategorized expenses (nudge banner) ────────────────────────
  const { count: uncategorizedCount } = payee
    ? await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('payee_id', payee.id)
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
      customerId={activeCustomer?.id ?? null}
      customerName={activeCustomer?.name ?? 'Contrast'}
      billingCurrency={billingCurrency}
      marketRate={marketRate}
      marketRateAsOf={marketRateAsOf}
    />
  )
}
