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
  return NextResponse.json({ company: data }, { status: 201 })
}
