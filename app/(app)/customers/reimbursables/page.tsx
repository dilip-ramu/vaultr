import { createClient } from '@/lib/supabase/server'
import ReimbursableExpensesClient from '@/components/reimbursables/ReimbursableExpensesClient'
import { getReimbursableCustomers, resolveActiveCustomer } from '@/lib/reimbursables/customers'

export const dynamic = 'force-dynamic'

/**
 * Reimbursables → Expenses.
 * Was `/contrast` (single-customer, Contrast-hardcoded); now the general
 * multi-customer view under /customers/reimbursables. The DB/API layer still
 * uses the historical `contrast_*` names — those get unified in the deferred
 * Batch E.
 */
export default async function ReimbursableExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const { customer: customerParam } = await searchParams

  // Multi-customer: figure out which reimbursable customer the user is viewing.
  // The picker writes ?customer=<id>; if none, fall back to the first customer
  // that has a payee linked (typically Contrast).
  const reimbursables = await getReimbursableCustomers(supabase, uid)
  const active = resolveActiveCustomer(reimbursables, customerParam ?? null)

  // Resolve the payee row for the active customer (already in the helper).
  const payee = active ? { id: active.payee_id!, name: active.name } : null

  // Legacy fallback: if no reimbursable customer is set up yet, look for the
  // old "Contrast" payee by name so this still works pre-migration.
  let resolvedPayee = payee
  if (!resolvedPayee) {
    const { data: legacy } = await supabase
      .from('payees')
      .select('id, name')
      .eq('user_id', uid)
      .ilike('name', '%contrast%')
      .order('name')
    resolvedPayee = legacy?.[0] ?? null
  }

  // Billing categories — scoped to the active customer if the column exists
  // (post-migration v47). Falls back to legacy un-scoped rows.
  let billingCategoriesQuery = supabase
    .from('contrast_billing_categories')
    .select('*')
    .eq('user_id', uid)
    .order('name')
  if (active) billingCategoriesQuery = billingCategoriesQuery.eq('customer_id', active.id)
  const { data: billingCategories } = await billingCategoriesQuery

  const migrationsRun = billingCategories !== null

  let transactions: unknown[] = []

  if (resolvedPayee) {
    if (migrationsRun) {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id, name, amount, date, type, notes, is_contrast_billed,
          contrast_billing_category_id, contrast_invoice_id, created_at,
          account:accounts!account_id(id, name, color, type),
          category:categories(id, name, icon, color),
          billing_category:contrast_billing_categories(id, name),
          attachments(id, file_name, file_path, content_type, file_size)
        `)
        .eq('user_id', uid)
        .eq('payee_id', resolvedPayee.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!error) {
        transactions = data ?? []
      } else {
        const { data: fallback } = await supabase
          .from('transactions')
          .select(`
            id, name, amount, date, type, notes, created_at,
            account:accounts!account_id(id, name, color, type),
            category:categories(id, name, icon, color),
            attachments(id, file_name, file_path, content_type, file_size)
          `)
          .eq('user_id', uid)
          .eq('payee_id', resolvedPayee.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })

        transactions = (fallback ?? []).map(t => ({
          ...t,
          is_contrast_billed: false,
          contrast_billing_category_id: null,
          contrast_invoice_id: null,
          billing_category: null,
        }))
      }
    } else {
      const { data: fallback } = await supabase
        .from('transactions')
        .select(`
          id, name, amount, date, type, notes, created_at,
          account:accounts!account_id(id, name, color, type),
          category:categories(id, name, icon, color),
          attachments(id, file_name, file_path, content_type, file_size)
        `)
        .eq('user_id', uid)
        .eq('payee_id', resolvedPayee.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      transactions = (fallback ?? []).map(t => ({
        ...t,
        is_contrast_billed: false,
        contrast_billing_category_id: null,
        contrast_invoice_id: null,
        billing_category: null,
      }))
    }
  }

  return (
    <ReimbursableExpensesClient
      transactions={transactions as never[]}
      billingCategories={(billingCategories ?? []) as never[]}
      payeeFound={!!resolvedPayee}
      payeeName={resolvedPayee?.name ?? active?.name ?? 'Contrast'}
      migrationsRun={migrationsRun}
    />
  )
}
