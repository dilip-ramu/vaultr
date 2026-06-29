export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailDocumentsClient from '@/components/inbox/EmailDocumentsClient'

export default async function SupplierDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Supplier-only view: bank-alert senders (kind='bank_alert') belong to the
  // Transaction Inbox and must not appear here, both for the dropdown options
  // and for any pre-existing email_documents rows that were captured before
  // we started filtering on kind.
  const { data: allSenders } = await supabase
    .from('monitored_senders')
    .select('email, name, kind')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('email')

  const documentSenderEmails = (allSenders ?? [])
    .filter(s => s.kind === 'document')
    .map(s => s.email.toLowerCase())

  const bankAlertEmails = new Set(
    (allSenders ?? []).filter(s => s.kind === 'bank_alert').map(s => s.email.toLowerCase())
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
    d => !bankAlertEmails.has((d.sender_email ?? '').toLowerCase())
  )

  const senders = (allSenders ?? [])
    .filter(s => s.kind === 'document')
    .map(({ email, name }) => ({ email, name }))

  return (
    <EmailDocumentsClient
      initialDocuments={documents}
      senderOptions={senders}
      hideHeader
    />
  )
}
