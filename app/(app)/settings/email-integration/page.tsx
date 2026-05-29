export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailIntegrationSettings from '@/components/inbox/EmailIntegrationSettings'

export default async function EmailIntegrationPage() {
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <EmailIntegrationSettings
        initialIntegration={integration ?? null}
        initialSenders={senders ?? []}
      />
    </div>
  )
}
