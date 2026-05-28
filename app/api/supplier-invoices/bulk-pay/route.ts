import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — mark multiple invoices as paid (optionally create a batch)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    invoice_ids: string[]
    payment_date: string
    payment_reference?: string
    bank_reference?: string
    batch_reference?: string
    notes?: string
    create_batch?: boolean
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_ids, payment_date, payment_reference, create_batch, batch_reference, bank_reference, notes } = body

  if (!invoice_ids?.length) {
    return NextResponse.json({ error: 'No invoices selected' }, { status: 400 })
  }

  // Fetch invoices to verify ownership + get total
  const { data: invoices } = await supabase
    .from('supplier_invoices')
    .select('id, amount')
    .in('id', invoice_ids)
    .eq('user_id', user.id)

  if (!invoices || invoices.length !== invoice_ids.length) {
    return NextResponse.json({ error: 'One or more invoices not found' }, { status: 404 })
  }

  const totalAmount = invoices.reduce((sum, i) => sum + Number(i.amount), 0)

  let batchId: string | null = null

  if (create_batch) {
    const { data: batch, error: batchErr } = await supabase
      .from('bulk_payment_batches')
      .insert({
        user_id: user.id,
        batch_reference: batch_reference ?? `BATCH-${Date.now()}`,
        payment_date,
        bank_reference: bank_reference ?? null,
        total_amount: totalAmount,
        invoice_count: invoices.length,
        notes: notes ?? null,
      })
      .select()
      .single()

    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 })
    batchId = batch.id
  }

  // Mark all invoices paid
  const { error: updateErr } = await supabase
    .from('supplier_invoices')
    .update({
      is_paid: true,
      status: 'paid',
      payment_date,
      payment_reference: payment_reference ?? null,
      bulk_payment_batch_id: batchId,
      updated_at: new Date().toISOString(),
    })
    .in('id', invoice_ids)
    .eq('user_id', user.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, batch_id: batchId, total_amount: totalAmount })
}
