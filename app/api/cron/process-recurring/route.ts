import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS so we can process all users in one cron run
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function nextDate(date: string, interval: string): string {
  const d = new Date(date)
  switch (interval) {
    case 'daily':   d.setDate(d.getDate() + 1);           break
    case 'weekly':  d.setDate(d.getDate() + 7);           break
    case 'monthly': d.setMonth(d.getMonth() + 1);         break
    case 'yearly':  d.setFullYear(d.getFullYear() + 1);   break
  }
  return d.toISOString().split('T')[0]
}

// GET /api/cron/process-recurring — called by Vercel cron at 3am UTC (8:30am IST) daily
export async function GET(req: NextRequest) {
  // Verify this is called by Vercel cron or with the correct secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = adminClient()
  const today = new Date().toISOString().split('T')[0]

  // Find all due recurring invoices with auto-pay configured
  const { data: invoices, error } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(id, name, default_category_id)')
    .eq('is_recurring', true)
    .eq('is_paid', false)
    .not('auto_pay_account_id', 'is', null)
    .lte('invoice_date', today)
    .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${today}`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json({ processed: 0, skipped: 0 })

  let processed = 0
  let skipped = 0

  for (const inv of invoices) {
    const supplier = inv.supplier as { id: string; name: string; default_category_id: string | null } | null
    const nextInvoiceDate = nextDate(inv.invoice_date, inv.recurrence_interval ?? 'monthly')
    const shouldStop = inv.recurrence_end_date && nextInvoiceDate > inv.recurrence_end_date

    if (inv.skip_next_autopay) {
      // Skip this occurrence — advance date without paying
      await supabase
        .from('supplier_invoices')
        .update({
          invoice_date:        nextInvoiceDate,
          skip_next_autopay:   false,
          updated_at:          new Date().toISOString(),
        })
        .eq('id', inv.id)
      skipped++
      continue
    }

    // ── Normal auto-pay ──────────────────────────────────────────────────────

    // 1. Create expense transaction
    const txName = supplier?.name ? `${supplier.name} payment` : 'Recurring payment'
    const { data: tx } = await supabase
      .from('transactions')
      .insert({
        user_id:             inv.user_id,
        account_id:          inv.auto_pay_account_id,
        type:                'expense',
        amount:              Number(inv.amount),
        date:                today,
        name:                txName,
        notes:               `Auto-pay · ${inv.invoice_number ?? inv.recurrence_interval ?? 'recurring'}`,
        category_id:         supplier?.default_category_id ?? null,
        supplier_invoice_id: inv.id,
      })
      .select('id')
      .single()

    // 2. Copy invoice attachment to transaction
    if (tx?.id && inv.attachment_path && inv.attachment_name) {
      await supabase.from('attachments').insert({
        user_id:        inv.user_id,
        transaction_id: tx.id,
        file_path:      inv.attachment_path,
        file_name:      inv.attachment_name,
        file_size:      inv.attachment_size ?? null,
        content_type:   null,
      })
    }

    // 3. Mark current invoice as paid
    await supabase
      .from('supplier_invoices')
      .update({
        is_paid:        true,
        status:         'paid',
        payment_date:   today,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', inv.id)

    // 4. Spawn next occurrence (unless the subscription has ended)
    if (!shouldStop) {
      const { id: _id, created_at: _ca, updated_at: _ua, ...base } = inv as Record<string, unknown>
      await supabase.from('supplier_invoices').insert({
        ...base,
        id:                  undefined,   // let DB generate
        invoice_date:        nextInvoiceDate,
        due_date:            null,
        is_paid:             false,
        status:              'pending',
        payment_date:        null,
        payment_reference:   null,
        bulk_payment_batch_id: null,
        skip_next_autopay:   false,
        supplier_invoice_id: null,        // not a linked transaction
        created_at:          undefined,
        updated_at:          undefined,
      })
    }

    processed++
  }

  console.log(`[cron/process-recurring] ${today}: processed=${processed} skipped=${skipped}`)
  return NextResponse.json({ processed, skipped, date: today })
}
