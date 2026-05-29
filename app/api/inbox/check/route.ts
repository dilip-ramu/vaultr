import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkMailbox } from '@/lib/email/imap'

// POST — trigger manual mailbox check
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch integration
  const { data: integration, error: intErr } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (intErr) return NextResponse.json({ error: intErr.message }, { status: 500 })
  if (!integration) return NextResponse.json({ error: 'No active email integration found. Please connect your email first.' }, { status: 404 })

  // Fetch active monitored senders
  const { data: senders, error: sendErr } = await supabase
    .from('monitored_senders')
    .select('email')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 })
  if (!senders || senders.length === 0) {
    return NextResponse.json({ error: 'No active monitored senders. Please add at least one sender to monitor.' }, { status: 400 })
  }

  const monitoredEmails = senders.map(s => s.email)

  try {
    const result = await checkMailbox({
      userId: user.id,
      integrationId: integration.id,
      emailAddress: integration.email_address,
      encryptedPassword: integration.encrypted_password,
      encryptionIv: integration.encryption_iv,
      monitoredEmails,
      supabase,
    })

    // Update last_checked_at
    await supabase
      .from('email_integrations')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', integration.id)
      .eq('user_id', user.id)

    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json({ error: `Mailbox check failed: ${(e as Error).message}` }, { status: 500 })
  }
}
