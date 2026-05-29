export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailDocumentsClient from '@/components/inbox/EmailDocumentsClient'

export default async function EmailDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: documents } = await supabase
    .from('email_documents')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'ignored')
    .order('received_at', { ascending: false })
    .limit(500)

  const { data: senders } = await supabase
    .from('monitored_senders')
    .select('email, name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('email')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <EmailDocumentsClient
        initialDocuments={documents ?? []}
        senderOptions={senders ?? []}
      />
    </div>
  )
}
