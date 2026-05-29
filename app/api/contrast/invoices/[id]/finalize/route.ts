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

  // Compute totals
  const subtotal = items.reduce((s, i) => s + i.amount_inr, 0)
  const gst_amount = Math.round(subtotal * 0.18 * 100) / 100
  const total = Math.round((subtotal + gst_amount) * 100) / 100

  // Delete old items and re-insert (idempotent)
  await supabase.from('contrast_invoice_items').delete().eq('invoice_id', id)

  if (items.length > 0) {
    // Only insert known DB columns — strip display-only fields (inr_source, forex_rate, etc.)
    const { error: itemErr } = await supabase
      .from('contrast_invoice_items')
      .insert(items.map(({ item_type, description, salary_euro, expended_rate, amount_inr, sort_order }) => ({
        invoice_id: id, item_type, description, salary_euro, expended_rate, amount_inr, sort_order,
      })))
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  // Mark invoice as finalized
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

  // Mark transactions as billed
  if (transaction_ids.length > 0) {
    await supabase
      .from('transactions')
      .update({ is_contrast_billed: true, contrast_invoice_id: id })
      .in('id', transaction_ids)
      .eq('user_id', user.id)
  }

  // Mark bills as billed
  if (bill_ids.length > 0) {
    await supabase
      .from('bills')
      .update({ contrast_invoice_id: id })
      .in('id', bill_ids)
      .eq('user_id', user.id)
  }

  // Link payroll months
  if (payroll_month_ids.length > 0) {
    await supabase
      .from('payroll_months')
      .update({ contrast_invoice_id: id })
      .in('id', payroll_month_ids)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ invoice, subtotal, gst_amount, total })
}
