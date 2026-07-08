import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BillsClient from '@/components/bills/BillsClient'
import type { Bill, Account, Category, Customer } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Bills — payables timeline grouped by due window (frame 20d). Reachable at
 *  /bills; not in the primary nav (bills also live under Suppliers → Invoices). */
export default async function BillsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: bills }, { data: accounts }, { data: categories }, { data: customers }] = await Promise.all([
    supabase.from('bills').select('*').eq('user_id', user.id).order('due_date', { ascending: true }),
    supabase.from('account_balances').select('*').eq('user_id', user.id).eq('is_active', true),
    supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
    supabase.from('customers').select('*').eq('user_id', user.id).order('name'),
  ])

  return (
    <BillsClient
      initialBills={(bills ?? []) as Bill[]}
      accounts={(accounts ?? []) as Account[]}
      categories={(categories ?? []) as Category[]}
      customers={(customers ?? []) as Customer[]}
    />
  )
}
