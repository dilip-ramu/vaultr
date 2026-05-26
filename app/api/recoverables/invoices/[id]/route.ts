import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/recoverables/invoices/[id] ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: invoice }, { data: lines }] = await Promise.all([
    supabase
      .from('recoverable_invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('recoverable_invoice_lines')
      .select('*')
      .eq('invoice_id', id)
      .order('line_number', { ascending: true }),
  ])

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let customer = null
  if ((invoice as { customer_id: string | null }).customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('*')
      .eq('id', (invoice as { customer_id: string }).customer_id)
      .eq('user_id', user.id)
      .single()
    customer = c
  }

  return NextResponse.json({ invoice, lines: lines ?? [], customer })
}

// ── PATCH /api/recoverables/invoices/[id] ─────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch invoice to verify ownership and get current total
  const { data: invoice } = await supabase
    .from('recoverable_invoices')
    .select('id, total, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { status: 'paid' | 'cancelled'; paidAmount?: number; paidAt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status, paidAmount, paidAt } = body

  if (status !== 'paid' && status !== 'cancelled') {
    return NextResponse.json({ error: 'status must be paid or cancelled' }, { status: 400 })
  }

  const invoiceTotal = Number((invoice as { total: number }).total)

  const updatePayload: Record<string, unknown> = { status }

  if (status === 'paid') {
    const paid = paidAmount ?? invoiceTotal
    updatePayload.paid_amount = paid
    updatePayload.paid_at     = paidAt ?? new Date().toISOString()
    updatePayload.balance_due = 0
  }

  const { data: updated, error: updateErr } = await supabase
    .from('recoverable_invoices')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // If paid, mark linked allocations as paid
  if (status === 'paid') {
    const { data: lines } = await supabase
      .from('recoverable_invoice_lines')
      .select('allocation_id')
      .eq('invoice_id', id)

    const allocationIds = (lines ?? [])
      .map((l: { allocation_id: string | null }) => l.allocation_id)
      .filter((v): v is string => v !== null)

    if (allocationIds.length > 0) {
      await supabase
        .from('recoverable_allocations')
        .update({ status: 'paid' })
        .in('id', allocationIds)
    }
  }

  return NextResponse.json({ invoice: updated })
}

// ── DELETE /api/recoverables/invoices/[id] ────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext,
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: existing } = await supabase
    .from('recoverable_invoices')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Collect allocation ids from lines before cascading delete
  const { data: lines } = await supabase
    .from('recoverable_invoice_lines')
    .select('allocation_id')
    .eq('invoice_id', id)

  const allocationIds = (lines ?? [])
    .map((l: { allocation_id: string | null }) => l.allocation_id)
    .filter((v): v is string => v !== null)

  // Revert allocations to pending
  if (allocationIds.length > 0) {
    await supabase
      .from('recoverable_allocations')
      .update({ status: 'pending', billed_at: null })
      .in('id', allocationIds)
  }

  // Delete invoice (FK cascade removes lines)
  const { error } = await supabase
    .from('recoverable_invoices')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
