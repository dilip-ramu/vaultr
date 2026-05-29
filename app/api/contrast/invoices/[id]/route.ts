import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// PATCH /api/contrast/invoices/[id]
// Body: { notes?: string }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { notes?: string }

  const { data, error } = await supabase
    .from('contrast_invoices')
    .update({ notes: body.notes ?? null })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/contrast/invoices/[id]
// Unlinks all transactions, bills, payroll months then deletes the invoice.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params

  // Verify ownership
  const { data: inv, error: fetchErr } = await supabase
    .from('contrast_invoices')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // 1. Unmark transactions — restore to unbilled / unqueued
  await supabase
    .from('transactions')
    .update({ is_contrast_billed: false, contrast_invoice_id: null })
    .eq('contrast_invoice_id', id)
    .eq('user_id', user.id)

  // 2. Unlink courier (recoverable) invoices
  await supabase
    .from('recoverable_invoices')
    .update({ contrast_invoice_id: null })
    .eq('contrast_invoice_id', id)
    .eq('user_id', user.id)

  // 3. Unlink payroll months
  await supabase
    .from('payroll_months')
    .update({ contrast_invoice_id: null })
    .eq('contrast_invoice_id', id)
    .eq('user_id', user.id)

  // 4. Delete invoice (items cascade-delete via FK)
  const { error: delErr } = await supabase
    .from('contrast_invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
