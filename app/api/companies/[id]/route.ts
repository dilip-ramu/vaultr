import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

// Whitelisted updatable fields — never let the client write user_id, etc.
const UPDATABLE = new Set([
  'name', 'is_default',
  'address', 'gstin', 'phone', 'email',
  'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name',
  'invoice_prefix', 'cgst_rate', 'sgst_rate', 'hsn_sac',
  'payment_terms', 'terms_conditions',
  'logo_path',
])

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (UPDATABLE.has(k)) updates[k] = v
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // When promoting this company to default, demote any other default first.
  if (updates.is_default === true) {
    await supabase.from('companies').update({ is_default: false })
      .eq('user_id', user.id).eq('is_default', true).neq('id', id)
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id).eq('user_id', user.id)
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ company: data })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Don't allow deleting the last remaining company.
  const { count } = await supabase.from('companies').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'You need at least one company. Add another before deleting this one.' }, { status: 400 })
  }

  // Was this one the default? If so, promote the oldest remaining to default.
  const { data: existing } = await supabase.from('companies').select('is_default').eq('id', id).eq('user_id', user.id).maybeSingle()
  const wasDefault = !!existing?.is_default

  const { error } = await supabase.from('companies').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (wasDefault) {
    const { data: nextDefault } = await supabase.from('companies')
      .select('id').eq('user_id', user.id)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (nextDefault) {
      await supabase.from('companies').update({ is_default: true }).eq('id', nextDefault.id)
    }
  }

  return NextResponse.json({ success: true })
}
