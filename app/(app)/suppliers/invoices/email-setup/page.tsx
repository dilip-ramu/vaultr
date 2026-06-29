export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailIntegrationSettings from '@/components/inbox/EmailIntegrationSettings'

export default async function EmailSetupTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: integration }, { data: senders }] = await Promise.all([
    supabase
      .from('email_integrations')
      .select('id, provider, email_address, is_active, last_checked_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('monitored_senders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  return (
    <EmailIntegrationSettings
      initialIntegration={integration ?? null}
      initialSenders={senders ?? []}
      hideHeader
    />
  )
}
