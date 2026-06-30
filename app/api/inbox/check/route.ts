import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkMailbox } from '@/lib/email/imap'

// POST — trigger manual mailbox check (returns immediately; work runs in background via after())
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

  // Fetch active monitored senders flagged as supplier-document sources.
  // A sender may also be flagged as a bank-alert — that's handled by the
  // transaction inbox separately.
  const { data: senders, error: sendErr } = await supabase
    .from('monitored_senders')
    .select('email')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('is_document', true)

  if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 })
  if (!senders || senders.length === 0) {
    return NextResponse.json({ error: 'No supplier senders configured. Add one under Setup → Email (with the Supplier role).' }, { status: 400 })
  }

  const monitoredEmails = senders.map(s => s.email)

  // Run the mailbox check AFTER the response is sent so the browser is never blocked.
  // after() keeps the serverless function alive until the callback completes.
  after(async () => {
    try {
      await checkMailbox({
        userId: user.id,
        integrationId: integration.id,
        emailAddress: integration.email_address,
        encryptedPassword: integration.encrypted_password,
        encryptionIv: integration.encryption_iv,
        monitoredEmails,
        supabase,
      })
    } catch (e) {
      console.error('[inbox/check] Background mailbox check failed:', e)
    } finally {
      // Update last_checked_at regardless of outcome
      await supabase
        .from('email_integrations')
        .update({ last_checked_at: new Date().toISOString() })
        .eq('id', integration.id)
        .eq('user_id', user.id)
    }
  })

  // Return immediately — client will poll for results
  return NextResponse.json({ started: true })
}
