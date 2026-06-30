import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBankAlerts } from '@/lib/email/bankAlerts'
import type { AccountRef, MerchantRule } from '@/lib/bank-alert/drafts'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// GET /api/cron/fetch-bank-alerts — Vercel cron every 6h. Fetches bank-alert
// emails into each user's Transaction Inbox.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = adminClient()
  const summary: { user: string; added: number; checked: number }[] = []

  const { data: integrations } = await supabase
    .from('email_integrations').select('*').eq('is_active', true)

  for (const integ of integrations ?? []) {
    const uid = integ.user_id
    const [{ data: senders }, { data: accounts }, { data: rules }] = await Promise.all([
      supabase.from('monitored_senders').select('email, default_account_id').eq('user_id', uid).eq('is_active', true).eq('is_bank_alert', true),
      supabase.from('accounts').select('id, name, account_number, matching_digits, type').eq('user_id', uid).eq('is_active', true),
      supabase.from('merchant_rules').select('merchant_pattern, default_name, category_id, payee_id').eq('user_id', uid),
    ])
    if (!senders || senders.length === 0) continue

    try {
      const r = await checkBankAlerts({
        userId: uid,
        emailAddress: integ.email_address,
        encryptedPassword: integ.encrypted_password,
        encryptionIv: integ.encryption_iv,
        senders: senders,
        accounts: (accounts ?? []) as AccountRef[],
        merchantRules: (rules ?? []) as MerchantRule[],
        supabase,
      })
      summary.push({ user: uid, added: r.added, checked: r.checked })
      await supabase.from('email_integrations').update({ last_checked_at: new Date().toISOString() }).eq('id', integ.id)
    } catch (e) {
      console.error('[cron/fetch-bank-alerts]', uid, e)
    }
  }

  return NextResponse.json({ ok: true, summary })
}
