export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailDocumentsClient from '@/components/inbox/EmailDocumentsClient'

export default async function FetchInvoicesTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Supplier-only view: pull senders flagged as supplier-document sources.
  // A sender that's also flagged for bank alerts is fine — both flags can be on.
  const { data: allSenders } = await supabase
    .from('monitored_senders')
    .select('email, name, is_document, is_bank_alert')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('email')

  const documentSenderEmails = (allSenders ?? [])
    .filter(s => s.is_document)
    .map(s => s.email.toLowerCase())

  // Hide rows that came from senders we DON'T consider supplier-documents,
  // belt-and-suspenders against rows created before the role flags existed.
  const nonDocEmails = new Set(
    (allSenders ?? []).filter(s => !s.is_document).map(s => s.email.toLowerCase())
  )

  let documentsQuery = supabase
    .from('email_documents')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'ignored')
    .order('received_at', { ascending: false })
    .limit(500)

  if (documentSenderEmails.length > 0) {
    documentsQuery = documentsQuery.in('sender_email', documentSenderEmails)
  } else {
    documentsQuery = documentsQuery.in('sender_email', ['__none__'])
  }

  const { data: rawDocuments } = await documentsQuery

  const documents = (rawDocuments ?? []).filter(
    d => !nonDocEmails.has((d.sender_email ?? '').toLowerCase())
  )

  const senders = (allSenders ?? [])
    .filter(s => s.is_document)
    .map(({ email, name }) => ({ email, name }))

  return (
    <EmailDocumentsClient
      initialDocuments={documents}
      senderOptions={senders}
      hideHeader
    />
  )
}
