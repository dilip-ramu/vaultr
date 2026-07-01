import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Reimbursement invoice — finalize.
 * Batch E · Deploy 5: writes flipped to recoverable_invoices +
 * recoverable_invoice_lines. Historical field mapping:
 *   items.amount_inr  → line.amount
 *   items.sort_order  → line.line_number
 *   items.description → line.description (added by v60a)
 *   items.item_type   → line.item_type
 * Constant fields required by recoverable_invoice_lines' NOT NULL:
 *   awb='' | hsn_sac='996812' | qty=1 | rates+amounts=0
 * (the item_type marker tells the reimbursables UI to ignore them)
 *
 * status is set to 'finalized' — added to the recoverable_invoices status
 * CHECK in v58 so this write is legal on the unified table.
 */

function round2(n: number) { return Math.round(n * 100) / 100 }

interface InvoiceItem {
  item_type: 'salary' | 'courier' | 'expense' | 'fixed_expense' | 'deduction'
  description: string
  salary_amount?: number | null
  expended_rate?: number | null
  amount_inr: number
  sort_order: number
}

interface SalaryEmployee {
  employee_id: string
  salary_amount: number
}

// POST /api/contrast/invoices/[id]/finalize
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

  const subtotal   = round2(items.reduce((s, i) => s + i.amount_inr, 0))
  const gst_amount = round2(subtotal * 0.18)
  const total      = round2(subtotal + gst_amount)

  // ── Step 1: Save line items (delete-then-insert; idempotent for retries) ──
  await supabase
    .from('recoverable_invoice_lines')
    .delete()
    .eq('invoice_id', id)
    .eq('user_id', user.id)

  if (items.length > 0) {
    const { error: itemErr } = await supabase
      .from('recoverable_invoice_lines')
      .insert(items.map(it => ({
        user_id:       user.id,
        invoice_id:    id,
        line_number:   it.sort_order,
        awb:           '',
        shipment_date: null,
        hsn_sac:       '996812',
        qty:           1,
        base_rate:     0,
        rate:          0,
        amount:        it.amount_inr,
        cgst_rate:     0,
        cgst_amount:   0,
        sgst_rate:     0,
        sgst_amount:   0,
        item_type:     it.item_type,
        description:   it.description,
        salary_amount: it.salary_amount ?? null,
        salary_currency: 'EUR',
        expended_rate: it.expended_rate ?? null,
      })))
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  // ── Step 2: Mark invoice as finalized ─────────────────────────────────────
  // gst_amount is split into cgst_amount for storage — sum matches on read.
  // sent_at gets the finalize timestamp (Deploy 4's read adapter maps sent_at
  // → finalized_at for the client).
  const nowIso = new Date().toISOString()
  const { data: invoice, error: invErr } = await supabase
    .from('recoverable_invoices')
    .update({
      status: 'finalized',
      subtotal,
      cgst_amount: gst_amount,
      sgst_amount: 0,
      total,
      balance_due: total,      // unpaid until a linked income transaction lands
      sent_at: nowIso,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('invoice_type', 'reimbursement')
    .select(`
      id, invoice_number, invoice_month, invoice_date, status,
      subtotal, cgst_amount, sgst_amount, total,
      notes, sent_at, created_at, customer_id
    `)
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
    await supabase.from('recoverable_invoices')
      .update({ status: 'draft', sent_at: null, subtotal: 0, cgst_amount: 0, total: 0, balance_due: 0 })
      .eq('id', id).eq('user_id', user.id).eq('invoice_type', 'reimbursement')
    await supabase.from('recoverable_invoice_lines').delete().eq('invoice_id', id).eq('user_id', user.id)
    console.error(`[finalize] Reverted invoice ${id}: ${reason}`)
  }

  try {
    if (transaction_ids.length > 0) {
      const { error: txErr } = await supabase
        .from('transactions')
        .update({ is_contrast_billed: true, contrast_invoice_id: id })
        .in('id', transaction_ids).eq('user_id', user.id)
      if (txErr) throw new Error(`Transactions: ${txErr.message}`)
    }

    if (recoverable_invoice_ids.length > 0) {
      const { error: riErr } = await supabase
        .from('recoverable_invoices')
        .update({ contrast_invoice_id: id })
        .in('id', recoverable_invoice_ids).eq('user_id', user.id)
      if (riErr) throw new Error(`Courier invoices: ${riErr.message}`)
    }

    if (salary_employees.length > 0 && invoice_month) {
      const totalBilledEuros = round2(salary_employees.reduce((s, e) => s + e.salary_amount, 0))

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

      await supabase.from('payroll_entries').delete()
        .eq('payroll_month_id', pm.id).eq('user_id', user.id)

      const { error: peErr } = await supabase.from('payroll_entries').insert(
        salary_employees.map(e => ({
          user_id: user.id,
          payroll_month_id: pm.id,
          employee_id: e.employee_id,
          salary_amount: e.salary_amount,
          expended_rate: 0,
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

  // Adapt the response to the client's expected historical shape.
  return NextResponse.json({
    invoice: {
      id:             invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_month:  invoice.invoice_month ?? '',
      invoice_date:   invoice.invoice_date,
      status:         invoice.status,
      subtotal:       Number(invoice.subtotal ?? 0),
      gst_amount:     Number(invoice.cgst_amount ?? 0) + Number(invoice.sgst_amount ?? 0),
      total:          Number(invoice.total ?? 0),
      notes:          invoice.notes,
      finalized_at:   invoice.sent_at,
      created_at:     invoice.created_at,
      customer_id:    invoice.customer_id,
    },
    subtotal,
    gst_amount,
    total,
  })
}
