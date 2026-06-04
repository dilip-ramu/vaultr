import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET  – list all contrast invoices
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('contrast_invoices')
    .select('*, items:contrast_invoice_items(*)')
    .eq('user_id', user.id)
    .order('invoice_month', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST – create (draft) invoice for a month
// Body: { invoice_month: "YYYY-MM" }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { invoice_month } = await req.json() as { invoice_month: string }
  if (!invoice_month) return NextResponse.json({ error: 'invoice_month required' }, { status: 400 })

  // Generate invoice number: PI-YYYYMM-NNN
  // Fast path: atomic claim in Postgres (migration_v33) — race-safe, and never
  // reuses a number after a delete (max+1 instead of count+1).
  let invoice_number: string
  const { data: claimed, error: rpcError } = await supabase
    .rpc('claim_contrast_invoice_number', { p_month: invoice_month })
  if (!rpcError && typeof claimed === 'string' && claimed.length > 0) {
    invoice_number = claimed
  } else {
    // Fallback (migration not run yet): count-based numbering
    const { count } = await supabase
      .from('contrast_invoices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    const seq = String((count ?? 0) + 1).padStart(3, '0')
    invoice_number = `PI-${invoice_month.replace('-', '')}-${seq}`
  }

  const { data, error } = await supabase
    .from('contrast_invoices')
    .insert({
      user_id: user.id,
      invoice_number,
      invoice_month,
      invoice_date: new Date().toISOString().split('T')[0],
      status: 'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
