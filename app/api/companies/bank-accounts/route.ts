// Bank accounts belonging to a company. Owner-only.
//
// One rule is enforced here rather than trusted to the UI: setting an account as
// default clears the others first. A partial unique index would reject the
// second default anyway, so doing it in the wrong order produces an error the
// user cannot act on.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s : null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  let q = supabase.from('company_bank_accounts').select('*').eq('user_id', user.id)
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q.order('sort_order').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const companyId = String(b?.company_id ?? '')
  if (!companyId) return NextResponse.json({ error: 'company_id is required' }, { status: 400 })

  // The company must be yours. Without this check an account could be attached
  // to somebody else's company id.
  const { data: owned } = await supabase.from('companies')
    .select('id').eq('id', companyId).eq('user_id', user.id).limit(1)
  if (!owned?.length) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const { count } = await supabase.from('company_bank_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('company_id', companyId)

  // The first account a company gets is its default — otherwise a company would
  // have accounts and still print nothing.
  const makeDefault = b?.is_default === true || (count ?? 0) === 0
  if (makeDefault) {
    await supabase.from('company_bank_accounts').update({ is_default: false })
      .eq('user_id', user.id).eq('company_id', companyId).eq('is_default', true)
  }

  const { data, error } = await supabase.from('company_bank_accounts').insert({
    user_id: user.id, company_id: companyId,
    label: clean(b?.label),
    bank_name: clean(b?.bank_name),
    account_name: clean(b?.account_name),
    account_number: clean(b?.account_number),
    ifsc: clean(b?.ifsc)?.toUpperCase() ?? null,
    swift_code: clean(b?.swift_code)?.toUpperCase() ?? null,
    branch: clean(b?.branch),
    is_default: makeDefault,
    sort_order: Number(b?.sort_order) || (count ?? 0),
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const id = String(b?.id ?? '')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: rows } = await supabase.from('company_bank_accounts')
    .select('id, company_id').eq('id', id).eq('user_id', user.id).limit(1)
  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  if (b?.is_default === true) {
    await supabase.from('company_bank_accounts').update({ is_default: false })
      .eq('user_id', user.id).eq('company_id', row.company_id).eq('is_default', true)
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of ['label', 'bank_name', 'account_name', 'account_number', 'branch'] as const) {
    if (f in b) patch[f] = clean(b[f])
  }
  for (const f of ['ifsc', 'swift_code'] as const) {
    if (f in b) patch[f] = clean(b[f])?.toUpperCase() ?? null
  }
  for (const f of ['is_default', 'is_active'] as const) {
    if (typeof b?.[f] === 'boolean') patch[f] = b[f]
  }
  if (typeof b?.sort_order === 'number') patch.sort_order = b.sort_order

  const { data, error } = await supabase.from('company_bank_accounts')
    .update(patch).eq('id', id).eq('user_id', user.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Documents referencing it keep working: the foreign key is ON DELETE SET
  // NULL, so an old invoice falls back to the company's default rather than
  // breaking. If you need the exact historical wording preserved, deactivate
  // the account instead of deleting it.
  const { error } = await supabase.from('company_bank_accounts')
    .delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
