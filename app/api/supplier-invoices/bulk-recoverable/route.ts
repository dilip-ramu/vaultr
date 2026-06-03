import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — mark multiple invoices as billable to customer (recoverable)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { invoice_ids: string[]; linked_customer_name?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_ids, linked_customer_name } = body
  if (!invoice_ids?.length) {
    return NextResponse.json({ error: 'No invoices selected' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    is_recoverable: true,
    billed_to_customer: false,
    recoverable_status: 'pending_billing',
    updated_at: new Date().toISOString(),
  }
  if (linked_customer_name) update.linked_customer_name = linked_customer_name

  const { error } = await supabase
    .from('supplier_invoices')
    .update(update)
    .in('id', invoice_ids)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
