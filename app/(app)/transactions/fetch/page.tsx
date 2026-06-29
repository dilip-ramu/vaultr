import { createClient } from '@/lib/supabase/server'
import TransactionInboxClient from '@/components/txn-inbox/TransactionInboxClient'

export const dynamic = 'force-dynamic'

export default async function FetchTransactionsTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: drafts }, { data: accounts }, { data: categories }, { data: payees }, { data: senders }, { data: integration }] = await Promise.all([
    supabase.from('transaction_drafts')
      .select('*')
      .eq('user_id', uid)
      .in('status', ['pending', 'needs_account'])
      .order('received_at', { ascending: false }),
    supabase.from('account_balances')
      .select('id, name, type, currency, color, avatar_url, custom_type_id, custom_type_name, custom_type_color, custom_type_icon, custom_type_avatar_url')
      .eq('user_id', uid).eq('is_active', true),
    supabase.from('categories').select('id, name, type, icon, color').eq('user_id', uid),
    supabase.from('payees').select('id, name').eq('user_id', uid).order('name'),
    supabase.from('monitored_senders').select('id, email, name, is_active, default_account_id').eq('user_id', uid).eq('kind', 'bank_alert').order('email'),
    supabase.from('email_integrations').select('email_address, last_checked_at').eq('user_id', uid).eq('is_active', true).maybeSingle(),
  ])

  return (
    <TransactionInboxClient
      drafts={drafts ?? []}
      accounts={accounts ?? []}
      categories={categories ?? []}
      payees={payees ?? []}
      senders={senders ?? []}
      integration={integration ?? null}
      hideHeader
    />
  )
}
