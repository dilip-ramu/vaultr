import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Reimbursement invoice — single-row PATCH + DELETE.
 * Batch E · Deploy 5: writes flipped to recoverable_invoices with
 * invoice_type='reimbursement'. Every WHERE clause carries invoice_type as
 * belt-and-suspenders so this route can NEVER touch a real tax invoice
 * even if it were called with the wrong id.
 */

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
    .from('recoverable_invoices')
    .update({ notes: body.notes ?? null })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('invoice_type', 'reimbursement')          // ← never touch a tax invoice
    .select(`
      id, invoice_number, invoice_month, invoice_date, status,
      subtotal, cgst_amount, sgst_amount, total,
      notes, sent_at, created_at, customer_id
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    id:             data.id,
    invoice_number: data.invoice_number,
    invoice_month:  data.invoice_month ?? '',
    invoice_date:   data.invoice_date,
    status:         data.status,
    subtotal:       Number(data.subtotal ?? 0),
    gst_amount:     Number(data.cgst_amount ?? 0) + Number(data.sgst_amount ?? 0),
    total:          Number(data.total ?? 0),
    notes:          data.notes,
    finalized_at:   data.sent_at,
    created_at:     data.created_at,
    customer_id:    data.customer_id,
  })
}

// DELETE /api/contrast/invoices/[id]
// Unlinks all transactions, courier invoices, payroll months, then deletes.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params

  // Verify ownership + type. Rejects if id is a tax invoice.
  const { data: inv, error: fetchErr } = await supabase
    .from('recoverable_invoices')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('invoice_type', 'reimbursement')
    .single()

  if (fetchErr || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // 1. Unmark transactions — restore to unbilled / unqueued.
  //    transactions.contrast_invoice_id still points at the shared UUID —
  //    this works whether the invoice lives in contrast_invoices or
  //    recoverable_invoices (same id in both until Deploy 6).
  await supabase
    .from('transactions')
    .update({ is_contrast_billed: false, contrast_invoice_id: null })
    .eq('contrast_invoice_id', id)
    .eq('user_id', user.id)

  // 2. Unlink courier (tax) invoices that were bundled into this reimbursement
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

  // 4. Delete the invoice. recoverable_invoice_lines cascade via FK.
  const { error: delErr } = await supabase
    .from('recoverable_invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('invoice_type', 'reimbursement')

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
