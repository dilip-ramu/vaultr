import { createClient } from '@/lib/supabase/server'
import ReimbursableInvoiceClient from '@/components/reimbursables/ReimbursableInvoiceClient'
import { getReimbursableCustomers, resolveActiveCustomer } from '@/lib/reimbursables/customers'

export const dynamic = 'force-dynamic'

/**
 * Reimbursables → New invoice.
 * Was `/contrast/invoice`; this is the multi-customer, non-Contrast-hardcoded
 * home for the same builder. The DB/API layer still uses the historical
 * `contrast_*` names — those get unified in the deferred Batch E.
 */
export default async function ReimbursableNewInvoicePage({
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

  // v63: also pull fixed_expenses + customer address so we can build the
  // PDF's Bill-To block dynamically instead of hardcoding Contrast A/S.
  type ActiveCustomer = {
    id: string
    name: string
    billing_currency: string
    fixed_expenses: { description: string; amount: number; currency?: string }[] | null
    address: string | null
    country: string | null
    email: string | null
  }
  let activeCustomer: ActiveCustomer | null = null
  if (active) {
    const { data: full } = await supabase
      .from('customers')
      .select('id, name, billing_currency, fixed_expenses, address, country, email')
      .eq('id', active.id)
      .eq('user_id', uid)
      .maybeSingle()
    activeCustomer = (full ?? null) as ActiveCustomer | null
  }
  // Legacy fallback for the Contrast customer if none configured yet.
  if (!activeCustomer) {
    const { data: legacy } = await supabase
      .from('customers')
      .select('id, name, billing_currency, fixed_expenses, address, country, email')
      .eq('user_id', uid)
      .ilike('name', '%contrast%')
      .order('name')
    activeCustomer = ((legacy?.[0] ?? null) as ActiveCustomer | null)
  }

  // Bill-From: fetch EVERY company the user has so they can pick from any of
  // them per-invoice (default company preselected). Includes logo public URL
  // — the companies bucket is public so getPublicUrl gives us a stable link.
  const { data: allCompanies } = await supabase
    .from('companies')
    .select('id, name, address, gstin, phone, email, bank_account_name, bank_account_number, bank_ifsc, bank_name, logo_path, is_default')
    .eq('user_id', uid)
    .order('is_default', { ascending: false })
    .order('name')
  type CompanyRow = {
    id: string; name: string
    address: string | null; gstin: string | null; phone: string | null; email: string | null
    bank_account_name: string | null; bank_account_number: string | null
    bank_ifsc: string | null; bank_name: string | null
    logo_path: string | null; is_default: boolean
  }
  const companies = ((allCompanies ?? []) as CompanyRow[]).map(c => {
    let logoUrl: string | null = null
    if (c.logo_path) {
      const { data } = supabase.storage.from('vaultr-avatars').getPublicUrl(c.logo_path)
      logoUrl = data.publicUrl ?? null
    }
    return {
      id:                  c.id,
      name:                c.name,
      address:             c.address,
      gstin:               c.gstin,
      phone:               c.phone,
      email:               c.email,
      bank_account_name:   c.bank_account_name,
      bank_account_number: c.bank_account_number,
      bank_ifsc:           c.bank_ifsc,
      bank_name:           c.bank_name,
      logo_url:            logoUrl,
      is_default:          c.is_default,
    }
  })
  const defaultCompany = companies.find(c => c.is_default) ?? companies[0] ?? null

  // No-customer fallback is INR (matches the app-wide default). In practice a
  // customer is always chosen before the invoice can be finalised, so this
  // only affects the empty-state render.
  const billingCurrency = activeCustomer?.billing_currency ?? 'INR'

  // ── Latest market rate for the customer's currency ────────────────────────
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
        .select('id, name, salary_amount, designation, works_for_customer_id, exclude_from_invoicing')
        .eq('user_id', uid)
        .eq('is_active', true)
        .eq('works_for_customer_id', activeCustomer.id)
        .eq('exclude_from_invoicing', false)
        .order('name')
    : { data: [] }

  // ── Unlinked courier (recoverable) invoices for THIS customer ─────────────
  // Batch E fix: recoverable_invoices now holds BOTH tax invoices and
  // reimbursement invoices, distinguished by invoice_type. Without this
  // filter, the courier-charges picker was accidentally offering the user's
  // own reimbursement invoices as bundleable courier items — showing them
  // with EUR-denominated totals rendered as ₹ and causing visible glitches.
  const { data: courierInvoices } = activeCustomer
    ? await supabase
        .from('recoverable_invoices')
        .select('id, invoice_number, total, invoice_date, status, customer_name')
        .eq('user_id', uid)
        .eq('customer_id', activeCustomer.id)
        .eq('invoice_type', 'tax_invoice')          // ← only real tax invoices
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
    <ReimbursableInvoiceClient
      employees={(employees ?? []) as never[]}
      courierInvoices={(courierInvoices ?? []) as never[]}
      allExpenses={(queuedExpenses ?? []) as never[]}
      companyName={defaultCompany?.name ?? profile?.full_name ?? ''}
      uncategorizedCount={uncategorizedCount ?? 0}
      customerId={activeCustomer?.id ?? null}
      customerName={activeCustomer?.name ?? ''}
      billingCurrency={billingCurrency}
      marketRate={marketRate}
      marketRateAsOf={marketRateAsOf}
      initialFixedExpenses={activeCustomer?.fixed_expenses ?? []}
      companies={companies}
      defaultCompanyId={defaultCompany?.id ?? null}
      profileFullName={profile?.full_name ?? null}
      billTo={activeCustomer ? {
        name:    activeCustomer.name,
        address: activeCustomer.address ?? undefined,
        country: activeCustomer.country ?? undefined,
        email:   activeCustomer.email ?? undefined,
      } : undefined}
    />
  )
}
