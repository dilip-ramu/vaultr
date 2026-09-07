// A company's bank accounts, and which one its documents use by default.
//
// There is no separate bank table. These ARE the accounts on the Accounts page,
// filtered by company_id. "Adding" one to a company means tagging an existing
// account with that company — never re-typing an account number that the app
// already holds, because two copies of a number is one copy too many.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BILLING_ACCOUNT_COLUMNS } from '@/lib/companies/bankAccounts'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const [{ data: assigned }, { data: available }, { data: company }] = await Promise.all([
    supabase.from('accounts').select(BILLING_ACCOUNT_COLUMNS)
      .eq('user_id', user.id).eq('company_id', companyId).order('name'),
    // Everything that could be attached: not yet tied to any company. An
    // account already tied to ANOTHER company is deliberately not offered —
    // moving it would silently change that company's invoices too.
    supabase.from('accounts').select(BILLING_ACCOUNT_COLUMNS)
      .eq('user_id', user.id).is('company_id', null).eq('is_active', true).order('name'),
    supabase.from('companies').select('default_bank_account_id')
      .eq('id', companyId).eq('user_id', user.id).maybeSingle(),
  ])

  return NextResponse.json({
    accounts: assigned ?? [],
    available: available ?? [],
    defaultAccountId: (company as { default_bank_account_id?: string | null } | null)?.default_bank_account_id ?? null,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const action = String(b?.action ?? '')
  const companyId = String(b?.companyId ?? '')
  const accountId = String(b?.accountId ?? '')
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const { data: owned } = await supabase.from('companies')
    .select('id').eq('id', companyId).eq('user_id', user.id).limit(1)
  if (!owned?.length) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  // ── Tag an account to this company ───────────────────────────────────────
  if (action === 'attach') {
    if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
    const { data: acct } = await supabase.from('accounts')
      .select('id, company_id').eq('id', accountId).eq('user_id', user.id).maybeSingle()
    if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    if (acct.company_id && acct.company_id !== companyId) {
      return NextResponse.json(
        { error: 'That account already belongs to another company. Change it on the Accounts page first.' },
        { status: 400 },
      )
    }

    const { error } = await supabase.from('accounts')
      .update({ company_id: companyId, updated_at: new Date().toISOString() })
      .eq('id', accountId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // The first account a company gets becomes its default, otherwise the
    // company would have an account and still print nothing.
    const { data: c } = await supabase.from('companies')
      .select('default_bank_account_id').eq('id', companyId).eq('user_id', user.id).maybeSingle()
    if (!c?.default_bank_account_id) {
      await supabase.from('companies')
        .update({ default_bank_account_id: accountId }).eq('id', companyId).eq('user_id', user.id)
    }
    return NextResponse.json({ ok: true })
  }

  // ── Untag it. The ACCOUNT is untouched — only the company link goes. ──────
  if (action === 'detach') {
    if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
    const { error } = await supabase.from('accounts')
      .update({ company_id: null, updated_at: new Date().toISOString() })
      .eq('id', accountId).eq('user_id', user.id).eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // A default that is no longer this company's account must not stay.
    await supabase.from('companies').update({ default_bank_account_id: null })
      .eq('id', companyId).eq('user_id', user.id).eq('default_bank_account_id', accountId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'set_default') {
    if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
    const { data: acct } = await supabase.from('accounts')
      .select('id').eq('id', accountId).eq('user_id', user.id).eq('company_id', companyId).maybeSingle()
    if (!acct) return NextResponse.json({ error: 'That account does not belong to this company' }, { status: 400 })

    const { error } = await supabase.from('companies')
      .update({ default_bank_account_id: accountId }).eq('id', companyId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
