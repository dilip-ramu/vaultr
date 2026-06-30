import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailSetupClient, { type Sender } from '@/components/setup/EmailSetupClient'

export const dynamic = 'force-dynamic'

export default async function SetupEmailTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: integration }, { data: senders }, { data: accounts }] = await Promise.all([
    supabase
      .from('email_integrations')
      .select('id, provider, email_address, is_active, last_checked_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('monitored_senders')
      .select('id, email, name, is_active, is_document, is_bank_alert, default_account_id')
      .eq('user_id', user.id)
      .order('email'),
    supabase
      .from('account_balances')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <EmailSetupClient
      initialIntegration={integration ?? null}
      initialSenders={(senders ?? []) as Sender[]}
      accounts={accounts ?? []}
    />
  )
}
