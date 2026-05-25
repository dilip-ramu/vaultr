import { createClient } from '@/lib/supabase/server'
import CourierInvoiceForm from '@/components/logistics/courier-invoices/CourierInvoiceForm'
import type { Account } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function NewCourierInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('account_balances')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .order('name')

  return (
    <CourierInvoiceForm
      mode="create"
      accounts={(accounts ?? []) as unknown as Account[]}
    />
  )
}
