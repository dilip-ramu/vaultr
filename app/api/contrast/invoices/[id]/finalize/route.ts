import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface InvoiceItem {
  item_type: 'salary' | 'courier' | 'expense'
  description: string
  salary_euro?: number | null
  expended_rate?: number | null
  amount_inr: number
  sort_order: number
}

// POST /api/contrast/invoices/[id]/finalize
// Body: { items: InvoiceItem[], transaction_ids: string[], bill_ids: string[], payroll_month_ids: string[] }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as {
    items: InvoiceItem[]
    transaction_ids: string[]
    bill_ids: string[]
    payroll_month_ids: string[]
  }

  const { items, transaction_ids, bill_ids, payroll_month_ids } = body

  // Compute totals (amounts stored as EUR in amount_inr field)
  const subtotal   = Math.round(items.reduce((s, i) => s + i.amount_inr, 0) * 100) / 100
  const gst_amount = Math.round(subtotal * 0.18 * 100) / 100
  const total      = Math.round((subtotal + gst_amount) * 100) / 100

  // ── Step 1: Save line items ────────────────────────────────────────────────
  // If this fails, nothing is marked — safe to return error immediately.
  await supabase.from('contrast_invoice_items').delete().eq('invoice_id', id)

  if (items.length > 0) {
    const { error: itemErr } = await supabase
      .from('contrast_invoice_items')
      .insert(items.map(({ item_type, description, salary_euro, expended_rate, amount_inr, sort_order }) => ({
        invoice_id: id, item_type, description, salary_euro, expended_rate, amount_inr, sort_order,
      })))
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  // ── Step 2: Mark invoice as finalized ─────────────────────────────────────
  // If this fails, nothing is marked — safe to return error.
  const { data: invoice, error: invErr } = await supabase
    .from('contrast_invoices')
    .update({
      status: 'finalized',
      subtotal,
      gst_amount,
      total,
      finalized_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  // ── Step 3: Mark source records as billed ─────────────────────────────────
  // These run AFTER the invoice is confirmed saved. If they fail, we revert
  // everything so the user can retry without being stuck.
  const revert = async (reason: string) => {
    // Unmark transactions
    if (transaction_ids.length > 0) {
      await supabase
        .from('transactions')
        .update({ is_contrast_billed: false, contrast_invoice_id: null })
        .in('id', transaction_ids)
        .eq('user_id', user.id)
    }
    // Unmark bills
    if (bill_ids.length > 0) {
      await supabase
        .from('bills')
        .update({ contrast_invoice_id: null })
        .in('id', bill_ids)
        .eq('user_id', user.id)
    }
    // Unlink payroll months
    if (payroll_month_ids.length > 0) {
      await supabase
        .from('payroll_months')
        .update({ contrast_invoice_id: null })
        .in('id', payroll_month_ids)
        .eq('user_id', user.id)
    }
    // Reset invoice back to draft so user can retry
    await supabase
      .from('contrast_invoices')
      .update({ status: 'draft', finalized_at: null })
      .eq('id', id)
      .eq('user_id', user.id)
    // Remove saved items so they can be re-inserted on retry
    await supabase.from('contrast_invoice_items').delete().eq('invoice_id', id)
    console.error(`[finalize] Reverted invoice ${id}: ${reason}`)
  }

  try {
    if (transaction_ids.length > 0) {
      const { error: txErr } = await supabase
        .from('transactions')
        .update({ is_contrast_billed: true, contrast_invoice_id: id })
        .in('id', transaction_ids)
        .eq('user_id', user.id)
      if (txErr) throw new Error(`Transactions: ${txErr.message}`)
    }

    if (bill_ids.length > 0) {
      const { error: billErr } = await supabase
        .from('bills')
        .update({ contrast_invoice_id: id })
        .in('id', bill_ids)
        .eq('user_id', user.id)
      if (billErr) throw new Error(`Bills: ${billErr.message}`)
    }

    if (payroll_month_ids.length > 0) {
      const { error: pmErr } = await supabase
        .from('payroll_months')
        .update({ contrast_invoice_id: id })
        .in('id', payroll_month_ids)
        .eq('user_id', user.id)
      if (pmErr) throw new Error(`Payroll: ${pmErr.message}`)
    }
  } catch (e) {
    await revert((e as Error).message)
    return NextResponse.json(
      { error: `Finalization failed and was fully reverted — ${(e as Error).message}. Please try again.` },
      { status: 500 }
    )
  }

  return NextResponse.json({ invoice, subtotal, gst_amount, total })
}
