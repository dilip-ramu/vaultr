import { createClient } from '@/lib/supabase/server'
import ContrastExpensesClient from '@/components/contrast/ContrastExpensesClient'

export const dynamic = 'force-dynamic'

export default async function ContrastExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Find the "Contrast" payee for this user
  const { data: payee } = await supabase
    .from('payees')
    .select('id, name')
    .eq('user_id', user!.id)
    .ilike('name', 'contrast')
    .maybeSingle()

  let transactions: unknown[] = []

  if (payee) {
    const { data } = await supabase
      .from('transactions')
      .select(`
        id, name, amount, date, type, notes, is_contrast_billed, created_at,
        account:accounts!account_id(id, name, color, type),
        category:categories(id, name, icon, color),
        attachments(id, file_name, file_path, content_type, file_size)
      `)
      .eq('user_id', user!.id)
      .eq('payee_id', payee.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    transactions = data ?? []
  }

  return (
    <ContrastExpensesClient
      transactions={transactions as never[]}
      payeeFound={!!payee}
      payeeName={payee?.name ?? 'Contrast'}
    />
  )
}
