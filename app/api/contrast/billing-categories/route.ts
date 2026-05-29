import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET  – list all billing categories for the user
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('contrast_billing_categories')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST – create a new billing category
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('contrast_billing_categories')
    .insert({ user_id: user.id, name: name.trim() })
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
