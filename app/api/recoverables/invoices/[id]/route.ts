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
      .eq('invoice_type', 'tax_invoice')  // Batch E: this API serves tax invoices only
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

interface PatchBody {
  status?: 'paid' | 'cancelled' | 'sent'
  revert?: boolean
  // Full payment recording
  paidAmount?:       number
  tdsAmount?:        number
  adjustmentAmount?: number
  adjustmentNotes?:  string | null
  accountId?:        string
  paymentDate?:      string
  // Legacy
  paidAt?:           string
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invoice } = await supabase
    .from('recoverable_invoices')
    .select('id, total, balance_due, status, invoice_number, customer_name, transaction_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('invoice_type', 'tax_invoice')  // Batch E: this API serves tax invoices only
    .single()

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: PatchBody
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    status,
    paidAmount    = 0,
    tdsAmount     = 0,
    adjustmentAmount = 0,
    adjustmentNotes  = null,
    accountId,
    paymentDate,
    paidAt,
  } = body

  // ── Revert to unpaid ──────────────────────────────────────────────────
  if (body.revert) {
    const invoiceTotal = Number(invoice.total)

    // Delete associated income transaction (works once v13 migration has run)
    const txId = (invoice as { transaction_id?: string | null }).transaction_id
    if (txId) {
      await supabase.from('transactions').delete().eq('id', txId).eq('user_id', user.id)
    }

    const { data: updated, error: e } = await supabase
      .from('recoverable_invoices')
      .update({
        status:            'sent',
        paid_amount:       0,
        tds_amount:        0,
        adjustment_amount: 0,
        adjustment_notes:  null,
        balance_due:       invoiceTotal,
        paid_at:           null,
      })
      .eq('id', id)
      .select()
      .single()

    if (e) return NextResponse.json({ error: e.message }, { status: 500 })

    // Clear transaction_id (best-effort — only works after v13 migration)
    await supabase
      .from('recoverable_invoices')
      .update({ transaction_id: null })
      .eq('id', id)
      .eq('user_id', user.id)

    // Revert allocations back to billed
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
        .update({ status: 'billed' })
        .in('id', allocationIds)
    }

    // Remove TDS entries for this invoice
    await supabase
      .from('recoverable_tds_entries')
      .delete()
      .eq('invoice_id', id)
      .eq('user_id', user.id)

    return NextResponse.json({ invoice: updated })
  }

  // ── Simple cancellation ────────────────────────────────────────────────
  if (status === 'cancelled') {
    const { data: updated, error: e } = await supabase
      .from('recoverable_invoices')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    return NextResponse.json({ invoice: updated })
  }

  // ── Mark as sent (issue a draft) ───────────────────────────────────────
  if (status === 'sent') {
    const { data: updated, error: e } = await supabase
      .from('recoverable_invoices')
      .update({ status: 'sent' })
      .eq('id', id)
      .select()
      .single()
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    return NextResponse.json({ invoice: updated })
  }

  // ── Payment recording ──────────────────────────────────────────────────
  const invoiceTotal  = Number(invoice.total)
  const currentBalance = Number(invoice.balance_due)

  const paid = Number(paidAmount)       || 0
  const tds  = Number(tdsAmount)        || 0
  const adj  = Number(adjustmentAmount) || 0
  const totalAccounted = paid + tds + adj
  const newBalance = Math.max(0, Math.round((currentBalance - totalAccounted) * 100) / 100)
  const newStatus  = newBalance <= 0 ? 'paid' : 'sent'

  // ── Update invoice ────────────────────────────────────────────────────
  const updatePayload: Record<string, unknown> = {
    status:            newStatus,
    paid_amount:       paid,
    tds_amount:        tds,
    adjustment_amount: adj,
    adjustment_notes:  adjustmentNotes,
    balance_due:       newBalance,
  }
  if (newStatus === 'paid') {
    updatePayload.paid_at = paymentDate
      ? new Date(paymentDate).toISOString()
      : (paidAt ?? new Date().toISOString())
  }

  const { data: updated, error: updateErr } = await supabase
    .from('recoverable_invoices')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // ── Create income transaction ─────────────────────────────────────────
  let transactionId: string | null = null
  if (paid > 0 && accountId) {
    const txDate = paymentDate ?? new Date().toISOString().slice(0, 10)
    const { data: tx } = await supabase
      .from('transactions')
      .insert({
        user_id:    user.id,
        account_id: accountId,
        type:       'income',
        amount:     paid,
        date:       txDate,
        name:       `${invoice.invoice_number} – ${invoice.customer_name}`,
        notes:      tds > 0 || adj > 0
          ? `Invoice total ₹${invoiceTotal}${tds > 0 ? `, TDS ₹${tds}` : ''}${adj > 0 ? `, Adj ₹${adj}` : ''}`
          : null,
      })
      .select('id')
      .single()
    if (tx) transactionId = (tx as { id: string }).id
  }

  // ── Store transaction_id on invoice (best-effort — needs migration v13) ─
  if (transactionId) {
    await supabase
      .from('recoverable_invoices')
      .update({ transaction_id: transactionId })
      .eq('id', id)
      .eq('user_id', user.id)
    // ignore error — column may not exist yet if v13 migration hasn't run
  }

  // ── Log TDS / adjustment entry ────────────────────────────────────────
  let tdsError: string | null = null
  if (tds > 0 || adj > 0) {
    const { error: tdsErr } = await supabase.from('recoverable_tds_entries').insert({
      user_id:           user.id,
      invoice_id:        id,
      invoice_number:    invoice.invoice_number,
      customer_name:     invoice.customer_name,
      invoice_total:     invoiceTotal,
      paid_amount:       paid,
      tds_amount:        tds,
      adjustment_amount: adj,
      adjustment_notes:  adjustmentNotes,
      account_id:        accountId ?? null,
      payment_date:      paymentDate ?? new Date().toISOString().slice(0, 10),
      transaction_id:    transactionId,
    })
    if (tdsErr) {
      console.error('TDS insert error:', tdsErr.message)
      tdsError = tdsErr.message
    }
  }

  // ── Mark allocations paid if fully settled ────────────────────────────
  if (newStatus === 'paid') {
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

  return NextResponse.json({ invoice: updated, transactionId, tdsError })
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
