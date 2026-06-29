import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkBankAlerts } from '@/lib/email/bankAlerts'
import type { AccountRef, MerchantRule } from '@/lib/bank-alert/drafts'

// POST — fetch new bank-alert emails into the Transaction Inbox.
// Returns immediately; the IMAP work runs in the background (after()).
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: integration }, { data: senders }, { data: accounts }, { data: rules }] = await Promise.all([
    supabase.from('email_integrations').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    supabase.from('monitored_senders').select('email, default_account_id').eq('user_id', user.id).eq('is_active', true).eq('kind', 'bank_alert'),
    supabase.from('accounts').select('id, name, account_number, matching_digits, type').eq('user_id', user.id).eq('is_active', true),
    supabase.from('merchant_rules').select('merchant_pattern, default_name, category_id, payee_id').eq('user_id', user.id),
  ])

  if (!integration) return NextResponse.json({ error: 'Connect your email first (Suppliers → Documents → Email Setup).' }, { status: 404 })
  if (!senders || senders.length === 0) {
    return NextResponse.json({ error: 'No bank-alert senders configured yet. Add one in the Transaction Inbox settings.' }, { status: 400 })
  }

  after(async () => {
    try {
      await checkBankAlerts({
        userId: user.id,
        emailAddress: integration.email_address,
        encryptedPassword: integration.encrypted_password,
        encryptionIv: integration.encryption_iv,
        senders: senders,
        accounts: (accounts ?? []) as AccountRef[],
        merchantRules: (rules ?? []) as MerchantRule[],
        supabase,
      })
    } catch (e) {
      console.error('[txn-inbox/check] failed:', e)
    } finally {
      await supabase.from('email_integrations').update({ last_checked_at: new Date().toISOString() }).eq('id', integration.id)
    }
  })

  return NextResponse.json({ started: true })
}
