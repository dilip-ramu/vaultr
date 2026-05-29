import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function round2(n: number) { return Math.round(n * 100) / 100 }

interface InvoiceItem {
  item_type: 'salary' | 'courier' | 'expense'
  description: string
  salary_euro?: number | null
  expended_rate?: number | null
  amount_inr: number
  sort_order: number
}

interface SalaryEmployee {
  employee_id: string
  salary_euro: number
}

// POST /api/contrast/invoices/[id]/finalize
// Body: { items, transaction_ids, recoverable_invoice_ids, salary_employees, invoice_month }
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
    recoverable_invoice_ids: string[]
    salary_employees: SalaryEmployee[]
    invoice_month: string
  }

  const { items, transaction_ids, recoverable_invoice_ids, salary_employees, invoice_month } = body

  // Compute EUR totals (amount_inr field stores EUR amounts — legacy field name)
  const subtotal   = round2(items.reduce((s, i) => s + i.amount_inr, 0))
  const gst_amount = round2(subtotal * 0.18)
  const total      = round2(subtotal + gst_amount)

  // ── Step 1: Save line items ────────────────────────────────────────────────
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

  // ── Step 3: Link source records — revert everything on failure ─────────────
  const revert = async (reason: string) => {
    if (transaction_ids.length > 0) {
      await supabase.from('transactions')
        .update({ is_contrast_billed: false, contrast_invoice_id: null })
        .in('id', transaction_ids).eq('user_id', user.id)
    }
    if (recoverable_invoice_ids.length > 0) {
      await supabase.from('recoverable_invoices')
        .update({ contrast_invoice_id: null })
        .in('id', recoverable_invoice_ids).eq('user_id', user.id)
    }
    // Delete auto-created payroll month if not yet finalized
    if (salary_employees.length > 0 && invoice_month) {
      const { data: pm } = await supabase
        .from('payroll_months')
        .select('id, is_finalized')
        .eq('user_id', user.id)
        .eq('payroll_month', invoice_month)
        .eq('contrast_invoice_id', id)
        .maybeSingle()
      if (pm && !pm.is_finalized) {
        await supabase.from('payroll_entries').delete().eq('payroll_month_id', pm.id).eq('user_id', user.id)
        await supabase.from('payroll_months').delete().eq('id', pm.id).eq('user_id', user.id)
      }
    }
    await supabase.from('contrast_invoices')
      .update({ status: 'draft', finalized_at: null }).eq('id', id).eq('user_id', user.id)
    await supabase.from('contrast_invoice_items').delete().eq('invoice_id', id)
    console.error(`[finalize] Reverted invoice ${id}: ${reason}`)
  }

  try {
    // Mark expense transactions as billed
    if (transaction_ids.length > 0) {
      const { error: txErr } = await supabase
        .from('transactions')
        .update({ is_contrast_billed: true, contrast_invoice_id: id })
        .in('id', transaction_ids).eq('user_id', user.id)
      if (txErr) throw new Error(`Transactions: ${txErr.message}`)
    }

    // Link courier (recoverable) invoices to this contrast invoice
    if (recoverable_invoice_ids.length > 0) {
      const { error: riErr } = await supabase
        .from('recoverable_invoices')
        .update({ contrast_invoice_id: id })
        .in('id', recoverable_invoice_ids).eq('user_id', user.id)
      if (riErr) throw new Error(`Courier invoices: ${riErr.message}`)
    }

    // Auto-create payroll month + entries for included salary lines
    if (salary_employees.length > 0 && invoice_month) {
      const totalBilledEuros = round2(salary_employees.reduce((s, e) => s + e.salary_euro, 0))

      // Upsert so retries don't duplicate months
      const { data: pm, error: pmErr } = await supabase
        .from('payroll_months')
        .upsert(
          {
            user_id: user.id,
            payroll_month: invoice_month,
            billed_euros: totalBilledEuros,
            is_finalized: false,
            contrast_invoice_id: id,
          },
          { onConflict: 'user_id,payroll_month' }
        )
        .select()
        .single()
      if (pmErr) throw new Error(`Payroll month: ${pmErr.message}`)

      // Replace entries (safe for retries)
      await supabase.from('payroll_entries').delete()
        .eq('payroll_month_id', pm.id).eq('user_id', user.id)

      const { error: peErr } = await supabase.from('payroll_entries').insert(
        salary_employees.map(e => ({
          user_id: user.id,
          payroll_month_id: pm.id,
          employee_id: e.employee_id,
          salary_euro: e.salary_euro,
          expended_rate: 0,   // filled later in Monthly Processing after receiving payment
          salary_inr: 0,
          final_payable: 0,
        }))
      )
      if (peErr) throw new Error(`Payroll entries: ${peErr.message}`)
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
