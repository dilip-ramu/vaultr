import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeInvoiceStatus } from '@/lib/suppliers/types'

// GET — list supplier invoices with filters
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const supplierId   = searchParams.get('supplier_id')
  const status       = searchParams.get('status')
  const recoverable  = searchParams.get('recoverable')      // 'true' | 'false'
  const recStatus    = searchParams.get('recoverable_status')
  const category     = searchParams.get('category')
  const dateFrom     = searchParams.get('date_from')
  const dateTo       = searchParams.get('date_to')
  const customer     = searchParams.get('customer')

  let query = supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(id, name, supplier_code, currency)')
    .eq('user_id', user.id)
    .order('invoice_date', { ascending: false })

  if (supplierId)  query = query.eq('supplier_id', supplierId)
  if (status)      query = query.eq('status', status)
  if (recoverable) query = query.eq('is_recoverable', recoverable === 'true')
  if (recStatus)   query = query.eq('recoverable_status', recStatus)
  if (category)    query = query.eq('category', category)
  if (dateFrom)    query = query.gte('invoice_date', dateFrom)
  if (dateTo)      query = query.lte('invoice_date', dateTo)
  if (customer)    query = query.ilike('linked_customer_name', `%${customer}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recompute live status for each invoice (overdue detection)
  const enriched = (data ?? []).map(inv => ({
    ...inv,
    status: computeInvoiceStatus(inv),
  }))

  return NextResponse.json({ invoices: enriched })
}

// POST — create supplier invoice
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Auto-compute status
  const status = computeInvoiceStatus({
    is_paid: Boolean(body.is_paid),
    due_date: body.due_date as string | null,
    status: 'pending',
  })

  // Auto-set recoverable_status when marked recoverable
  const recoverable_status = body.is_recoverable && !body.recoverable_status
    ? 'pending_billing'
    : body.recoverable_status ?? null

  const { data, error } = await supabase
    .from('supplier_invoices')
    .insert({
      ...body,
      user_id: user.id,
      status,
      recoverable_status,
    })
    .select('*, supplier:suppliers(id, name, supplier_code)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data }, { status: 201 })
}
