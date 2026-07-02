import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncCustomerMirror } from '../route'
import { normalizeTemplate, normalizeAccent } from '@/lib/companies/templates'

type RouteContext = { params: Promise<{ id: string }> }

// Whitelisted updatable fields — never let the client write user_id, etc.
const UPDATABLE = new Set([
  'name', 'is_default',
  'address', 'gstin', 'phone', 'email',
  'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name', 'swift_code',
  'invoice_prefix', 'cgst_rate', 'sgst_rate', 'hsn_sac',
  'payment_terms', 'terms_conditions',
  'logo_path',
  'invoice_template', 'invoice_accent',
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

  // Normalize the presentation fields so a bad value degrades to a safe
  // default instead of tripping the DB CHECK constraint.
  if ('invoice_template' in updates) updates.invoice_template = normalizeTemplate(updates.invoice_template)
  if ('invoice_accent'   in updates) updates.invoice_accent   = normalizeAccent(updates.invoice_accent)

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

  // v67 — reconcile the customers mirror based on the toggle.
  // "is_available_as_customer" isn't a column on companies; the client sends
  // it in the body and we act on it directly (create/refresh/remove mirror).
  const wantMirror = body.is_available_as_customer === true
  const dropMirror = body.is_available_as_customer === false
  if (wantMirror) {
    await syncCustomerMirror(supabase, user.id, data as {
      id: string; name: string; address: string | null; gstin: string | null;
      phone: string | null; email: string | null
    })
  } else if (dropMirror) {
    // Only remove the mirror if nothing references it as a customer_id
    // (invoices etc.). Otherwise leave it in place — historical rows should
    // keep resolving to a customer name.
    const { data: mirror } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .eq('mirrored_company_id', id)
      .maybeSingle()
    if (mirror) {
      const { count: invCount } = await supabase
        .from('recoverable_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('customer_id', mirror.id)
      if ((invCount ?? 0) === 0) {
        await supabase.from('customers').delete().eq('id', mirror.id).eq('user_id', user.id)
      }
      // Silently keep the mirror if invoices exist. UI should reflect this
      // by re-checking the toggle if the server didn't drop it.
    }
  }

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
