import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeInvoiceStatus, type SupplierInvoiceStatus } from '@/lib/suppliers/types'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(*)')
    .eq('id', id).eq('user_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ invoice: { ...data, status: computeInvoiceStatus(data) } })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Fetch current to compute new status
  const { data: current } = await supabase
    .from('supplier_invoices')
    .select('is_paid, due_date, status, is_recoverable, recoverable_status')
    .eq('id', id).eq('user_id', user.id)
    .single()

  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const merged = { ...current, ...body }
  const status = computeInvoiceStatus({
    is_paid: Boolean(merged.is_paid),
    due_date: merged.due_date as string | null,
    status: merged.status as SupplierInvoiceStatus,
  })

  // Auto-set recoverable_status when marking recoverable for first time
  let recoverable_status = body.recoverable_status ?? current.recoverable_status
  if (body.is_recoverable === true && !current.is_recoverable && !recoverable_status) {
    recoverable_status = 'pending_billing'
  }
  if (body.is_recoverable === false) {
    recoverable_status = null
  }

  const { data, error } = await supabase
    .from('supplier_invoices')
    .update({ ...body, status, recoverable_status, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
    .select('*, supplier:suppliers(id, name, supplier_code)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('supplier_invoices')
    .delete()
    .eq('id', id).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
