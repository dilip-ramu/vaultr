import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET – list billing categories. Optional ?customer=<id> filter for the
// active reimbursable customer.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const customerId = new URL(req.url).searchParams.get('customer')

  let query = supabase
    .from('contrast_billing_categories')
    .select('*')
    .eq('user_id', user.id)
    .order('name')
  if (customerId) query = query.eq('customer_id', customerId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST – create a new billing category, tagged to a customer.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { name, customer_id } = await req.json() as { name?: string; customer_id?: string }
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('contrast_billing_categories')
    .insert({ user_id: user.id, name: name.trim(), customer_id: customer_id ?? null })
    .select()
    .single()

  if (error) {
    // unique violation → return existing
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('contrast_billing_categories')
        .select('*').eq('user_id', user.id).eq('name', name.trim()).single()
      return NextResponse.json(existing)
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
