import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — mark multiple recoverable invoices as billed
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { invoice_ids: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_ids } = body
  if (!invoice_ids?.length) {
    return NextResponse.json({ error: 'No invoices selected' }, { status: 400 })
  }

  // RETURN WHAT ACTUALLY CHANGED. Reporting only success let the UI mark rows
  // as billed that the database had quietly declined — anything not owned by
  // this user, or not flagged recoverable, is filtered out here and the caller
  // had no way to know.
  const { data, error } = await supabase
    .from('supplier_invoices')
    .update({
      recoverable_status: 'billed',
      updated_at: new Date().toISOString(),
    })
    .in('id', invoice_ids)
    .eq('user_id', user.id)
    .eq('is_recoverable', true)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const updated_ids = (data ?? []).map(r => r.id)
  return NextResponse.json({
    success: true,
    updated_ids,
    updated: updated_ids.length,
    requested: invoice_ids.length,
  })
}
