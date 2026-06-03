import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — mark invoices as unpaid and delete their linked transactions.
// If an invoice belongs to a bulk payment batch, the entire batch is reversed:
// the batch transaction is deleted and ALL invoices in the batch are marked unpaid.
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

  // Fetch the requested invoices (paid only — skip already-unpaid)
  const { data: invoices, error: fetchErr } = await supabase
    .from('supplier_invoices')
    .select('id, bulk_payment_batch_id')
    .in('id', invoice_ids)
    .eq('user_id', user.id)
    .eq('is_paid', true)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json({ success: true, unpaid_ids: [] })

  // Collect all invoice IDs that will end up unpaid (may expand due to batches)
  const allUnpaidIds = new Set<string>(invoices.map(i => i.id))

  // Separate batch invoices from single-payment invoices
  const batchIds = new Set<string>()
  const singleIds: string[] = []

  for (const inv of invoices) {
    if (inv.bulk_payment_batch_id) {
      batchIds.add(inv.bulk_payment_batch_id)
    } else {
      singleIds.push(inv.id)
    }
  }

  // ── Handle batch reversals ──────────────────────────────────────────────────
  for (const batchId of batchIds) {
    // Expand: get ALL invoices in this batch so they all get marked unpaid
    const { data: batchInvoices } = await supabase
      .from('supplier_invoices')
      .select('id')
      .eq('bulk_payment_batch_id', batchId)
      .eq('user_id', user.id)

    batchInvoices?.forEach(i => allUnpaidIds.add(i.id))

    // Delete the batch transaction (linked via supplier_payment_batch_id)
    await supabase
      .from('transactions')
      .delete()
      .eq('supplier_payment_batch_id', batchId)
      .eq('user_id', user.id)
  }

  // ── Handle single-invoice reversals ─────────────────────────────────────────
  if (singleIds.length) {
    await supabase
      .from('transactions')
      .delete()
      .in('supplier_invoice_id', singleIds)
      .eq('user_id', user.id)
  }

  // ── Mark all affected invoices as unpaid ────────────────────────────────────
  const finalIds = [...allUnpaidIds]
  const { error: updateErr } = await supabase
    .from('supplier_invoices')
    .update({
      is_paid: false,
      status: 'pending',
      payment_date: null,
      payment_reference: null,
      bulk_payment_batch_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', finalIds)
    .eq('user_id', user.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, unpaid_ids: finalIds })
}
