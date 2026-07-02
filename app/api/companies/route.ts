import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — list companies for the current user
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data ?? [] })
}

// POST — create a new company
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // If the new company is being created as default, clear the existing default
  // first so the partial-unique index doesn't reject the insert.
  const isDefault = !!body.is_default
  if (isDefault) {
    await supabase.from('companies').update({ is_default: false }).eq('user_id', user.id).eq('is_default', true)
  } else {
    // If the user has no companies yet, make the first one default automatically.
    const { count } = await supabase.from('companies').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    if ((count ?? 0) === 0) body.is_default = true
  }

  const insertRow = {
    user_id: user.id,
    name,
    is_default: !!body.is_default,
    address:             body.address             ?? null,
    gstin:               body.gstin               ?? null,
    phone:               body.phone               ?? null,
    email:               body.email               ?? null,
    bank_account_name:   body.bank_account_name   ?? null,
    bank_account_number: body.bank_account_number ?? null,
    bank_ifsc:           body.bank_ifsc           ?? null,
    bank_name:           body.bank_name           ?? null,
    swift_code:          body.swift_code          ?? null,
    invoice_prefix:      body.invoice_prefix      ?? 'INV-',
    cgst_rate:           body.cgst_rate           ?? 9,
    sgst_rate:           body.sgst_rate           ?? 9,
    hsn_sac:             body.hsn_sac             ?? '996812',
    payment_terms:       body.payment_terms       ?? 'due_on_receipt',
    terms_conditions:    body.terms_conditions    ?? null,
  }

  const { data, error } = await supabase.from('companies').insert(insertRow).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // v67 — sync the customers mirror for cross-company billing when the
  // "Available as a customer" toggle is on. Best-effort; a failure here
  // doesn't block the primary insert.
  if (body.is_available_as_customer) {
    await syncCustomerMirror(supabase, user.id, data)
  }
  return NextResponse.json({ company: data }, { status: 201 })
}

/**
 * v67 — mirror a company into the customers table.
 *   ─ enable=true  → INSERT or UPDATE the mirror row
 *   ─ enable=false → DELETE the mirror IF no invoice references it
 * Returns quietly; callers don't need to handle errors specially since a
 * mirror-sync failure never breaks the primary company insert/update.
 */
async function syncCustomerMirror(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  company: {
    id: string; name: string; address: string | null; gstin: string | null;
    phone: string | null; email: string | null; country?: string | null
  },
) {
  // Does a mirror already exist for this company?
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .eq('mirrored_company_id', company.id)
    .maybeSingle()

  const payload = {
    user_id:            userId,
    name:               company.name,
    address:            company.address,
    gst_number:         company.gstin,
    email:              company.email,
    phone:              company.phone,
    country:            company.country ?? 'India',
    mirrored_company_id: company.id,
  }
  if (existing) {
    await supabase.from('customers').update(payload).eq('id', existing.id).eq('user_id', userId)
  } else {
    await supabase.from('customers').insert(payload)
  }
}

export { syncCustomerMirror }
