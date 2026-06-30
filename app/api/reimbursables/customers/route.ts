import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST – mark an existing customer as reimbursable by creating (or linking) a
// payee that points at them. Idempotent: if a payee for that customer already
// exists, just returns it.
// Body: { customer_id: UUID }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { customer_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const customerId = body.customer_id
  if (!customerId) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })

  // 1. Verify the customer belongs to this user, get their name.
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // 2. Already linked? Return existing payee.
  const { data: existingLinked } = await supabase
    .from('payees')
    .select('id, name, customer_id')
    .eq('user_id', user.id)
    .eq('customer_id', customerId)
    .maybeSingle()
  if (existingLinked) return NextResponse.json({ payee: existingLinked, created: false })

  // 3. Re-use a payee that matches by name and isn't linked yet.
  const { data: namedPayee } = await supabase
    .from('payees')
    .select('id, name, customer_id')
    .eq('user_id', user.id)
    .ilike('name', customer.name)
    .is('customer_id', null)
    .maybeSingle()

  if (namedPayee) {
    const { data: linked } = await supabase
      .from('payees')
      .update({ customer_id: customerId })
      .eq('id', namedPayee.id)
      .select('id, name, customer_id')
      .single()
    return NextResponse.json({ payee: linked, created: false })
  }

  // 4. Create a fresh payee bound to this customer.
  const { data: created, error } = await supabase
    .from('payees')
    .insert({ user_id: user.id, name: customer.name, customer_id: customerId })
    .select('id, name, customer_id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payee: created, created: true }, { status: 201 })
}

// DELETE – unlink a customer from reimbursables. Body or query: customer_id.
// The customer row stays; only the payee.customer_id is cleared. (We keep the
// payee so historical transactions still resolve.)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = new URL(req.url).searchParams.get('customer_id')
  if (!customerId) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })

  const { error } = await supabase
    .from('payees')
    .update({ customer_id: null })
    .eq('user_id', user.id)
    .eq('customer_id', customerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
