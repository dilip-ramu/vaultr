import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

// POST — create income + forex expense transactions and link them to the month
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { account_id: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { account_id } = body
  if (!account_id) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })

  const { data: month } = await supabase
    .from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!month) return NextResponse.json({ error: 'Month not found' }, { status: 404 })
  if (month.income_transaction_id) return NextResponse.json({ error: 'Income already logged for this month' }, { status: 400 })

  const receivedInr = Number(month.received_inr ?? 0)
  const bankCharges = Number(month.bank_charges ?? 0)

  if (receivedInr <= 0) return NextResponse.json({ error: 'No received INR amount to log' }, { status: 400 })

  const { data: account } = await supabase
    .from('accounts').select('id, name').eq('id', account_id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const txDate = month.payment_date ?? new Date().toISOString().slice(0, 10)

  // Income name = "Business Income - {Month Year}"
  const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const [yr, mo] = month.payroll_month.split('-')
  const monthLabel = `${MONTHS_LONG[parseInt(mo, 10) - 1]} ${yr}`
  const incomeName = `Business Income - ${monthLabel}`

  // 1. Create income transaction
  const { data: incomeTx, error: incomeErr } = await supabase
    .from('transactions')
    .insert({
      user_id:    user.id,
      account_id: account_id,
      type:       'income',
      amount:     receivedInr,
      date:       txDate,
      name:       incomeName,
      notes:      `Payroll income — ${month.payroll_month}`,
    })
    .select('id')
    .single()

  if (incomeErr || !incomeTx) {
    return NextResponse.json({ error: incomeErr?.message ?? 'Failed to create income transaction' }, { status: 500 })
  }

  // 2. Create forex expense transaction (only if bank_charges > 0)
  let forexTxId: string | null = null
  if (bankCharges > 0) {
    const { data: forexTx, error: forexErr } = await supabase
      .from('transactions')
      .insert({
        user_id:    user.id,
        account_id: account_id,
        type:       'expense',
        amount:     bankCharges,
        date:       txDate,
        name:       'Bank Forex Charges',
        notes:      `Payroll forex charges — ${month.payroll_month}`,
      })
      .select('id')
      .single()

    if (!forexErr && forexTx) forexTxId = forexTx.id
  }

  // 3. Store transaction IDs on the month
  const { data: updatedMonth, error: updateErr } = await supabase
    .from('payroll_months')
    .update({
      income_transaction_id: incomeTx.id,
      forex_transaction_id:  forexTxId,
    })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 4. Settle the linked reimbursement invoice. Logging the received income is
  //    the signal that the customer has paid us, so we mark the reimbursement
  //    invoice paid. That fires the v65 DB trigger, which cascades the bundled
  //    courier tax invoices to paid and unlocks the payroll month for salary
  //    processing. Guard the status so we don't re-stamp an already-paid row.
  let settledInvoiceId: string | null = null
  if (month.contrast_invoice_id) {
    const { data: inv } = await supabase
      .from('recoverable_invoices')
      .select('id, total, status')
      .eq('id', month.contrast_invoice_id)
      .eq('user_id', user.id)
      .eq('invoice_type', 'reimbursement')
      .maybeSingle()
    if (inv && inv.status !== 'paid' && inv.status !== 'cancelled') {
      const { error: payErr } = await supabase
        .from('recoverable_invoices')
        .update({ status: 'paid', paid_amount: inv.total, balance_due: 0, paid_at: txDate })
        .eq('id', inv.id).eq('user_id', user.id)
      if (!payErr) settledInvoiceId = inv.id
    }
  }

  return NextResponse.json({ month: updatedMonth, account, settledInvoiceId })
}

// DELETE — reverse income logging: delete both transactions, clear IDs on month
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: month } = await supabase
    .from('payroll_months').select('income_transaction_id, forex_transaction_id, contrast_invoice_id, status')
    .eq('id', id).eq('user_id', user.id).single()
  if (!month) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const txIds = [month.income_transaction_id, month.forex_transaction_id].filter(Boolean) as string[]
  if (txIds.length > 0) {
    await supabase.from('transactions').delete().in('id', txIds).eq('user_id', user.id)
  }

  // Un-settle the linked reimbursement invoice — reversing the income means it
  // is no longer paid. The v65 cascade only fires on the transition INTO paid,
  // so we undo its effects by hand: revert the reimbursement invoice, the
  // courier invoices bundled inside it, and re-lock the payroll month.
  if (month.contrast_invoice_id) {
    const { data: inv } = await supabase
      .from('recoverable_invoices')
      .select('id, total, status')
      .eq('id', month.contrast_invoice_id)
      .eq('user_id', user.id)
      .eq('invoice_type', 'reimbursement')
      .maybeSingle()
    if (inv && inv.status === 'paid') {
      await supabase
        .from('recoverable_invoices')
        .update({ status: 'sent', paid_amount: 0, balance_due: inv.total, paid_at: null })
        .eq('id', inv.id).eq('user_id', user.id)

      // Bundled courier invoices that cascaded to paid → back to sent.
      const { data: couriers } = await supabase
        .from('recoverable_invoices')
        .select('id, total')
        .eq('user_id', user.id)
        .eq('contrast_invoice_id', inv.id)
        .eq('invoice_type', 'tax_invoice')
        .eq('status', 'paid')
      for (const c of couriers ?? []) {
        await supabase
          .from('recoverable_invoices')
          .update({ status: 'sent', paid_amount: 0, balance_due: (c as { total: number }).total, paid_at: null })
          .eq('id', (c as { id: string }).id).eq('user_id', user.id)
      }

      // Re-lock the month if the cascade had unlocked it (and it isn't finalized).
      if (month.status === 'ready_to_process') {
        await supabase.from('payroll_months')
          .update({ status: 'pending' })
          .eq('id', id).eq('user_id', user.id)
      }
    }
  }

  const { data: updatedMonth } = await supabase
    .from('payroll_months')
    .update({ income_transaction_id: null, forex_transaction_id: null })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  return NextResponse.json({ month: updatedMonth })
}
