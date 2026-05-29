import { createClient } from '@/lib/supabase/server'
import ContrastExpensesClient from '@/components/contrast/ContrastExpensesClient'

export const dynamic = 'force-dynamic'

export default async function ContrastExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Find any payee whose name contains "contrast" (case-insensitive)
  // This handles "Contrast", "Contrast Company A/S", etc.
  const { data: payees } = await supabase
    .from('payees')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', '%contrast%')
    .order('name')

  const payee = payees?.[0] ?? null

  // Billing categories — may not exist if migration v19 hasn't run; handle gracefully
  const { data: billingCategories } = await supabase
    .from('contrast_billing_categories')
    .select('*')
    .eq('user_id', user!.id)
    .order('name')

  const migrationsRun = billingCategories !== null // null means table doesn't exist

  let transactions: unknown[] = []

  if (payee) {
    if (migrationsRun) {
      // Full query with new columns (migrations v18 + v19 applied)
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
        .eq('user_id', user!.id)
        .eq('payee_id', payee.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!error) {
        transactions = data ?? []
      } else {
        // Columns might not exist yet — fall back to base query
        const { data: fallback } = await supabase
          .from('transactions')
          .select(`
            id, name, amount, date, type, notes, created_at,
            account:accounts!account_id(id, name, color, type),
            category:categories(id, name, icon, color),
            attachments(id, file_name, file_path, content_type, file_size)
          `)
          .eq('user_id', user!.id)
          .eq('payee_id', payee.id)
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
      // Migrations not run — use base query only
      const { data: fallback } = await supabase
        .from('transactions')
        .select(`
          id, name, amount, date, type, notes, created_at,
          account:accounts!account_id(id, name, color, type),
          category:categories(id, name, icon, color),
          attachments(id, file_name, file_path, content_type, file_size)
        `)
        .eq('user_id', user!.id)
        .eq('payee_id', payee.id)
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
    <ContrastExpensesClient
      transactions={transactions as never[]}
      billingCategories={(billingCategories ?? []) as never[]}
      payeeFound={!!payee}
      payeeName={payee?.name ?? 'Contrast'}
      migrationsRun={migrationsRun}
    />
  )
}
