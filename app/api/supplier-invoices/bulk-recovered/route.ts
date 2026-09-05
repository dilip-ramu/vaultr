import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — mark multiple invoices as payment received from customer (recovered)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { invoice_ids: string[]; recovered_date?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_ids, recovered_date } = body
  if (!invoice_ids?.length) {
    return NextResponse.json({ error: 'No invoices selected' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('supplier_invoices')
    .update({
      recoverable_status: 'recovered',
      recovered_date: recovered_date ?? new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    })
    .in('id', invoice_ids)
    .eq('user_id', user.id)
    .eq('is_recoverable', true)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const updated_ids = (data ?? []).map(r => r.id)
  return NextResponse.json({ success: true, updated_ids, updated: updated_ids.length, requested: invoice_ids.length })
}
