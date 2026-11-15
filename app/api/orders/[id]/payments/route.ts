import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { paymentProblem, paymentTransaction, type PaymentKind } from '@/lib/orders/payments'

/**
 * Payments against an order.
 *
 * POST   records one and posts the bank entry it is.
 * DELETE removes one and the entry it posted — that exact entry, by id, and
 *        nothing else.
 *
 * The transaction is written FIRST and rolled back if the payment row fails.
 * The other order would leave a payment pointing at nothing, which reads on
 * screen as money that moved and cannot be found in the ledger.
 */

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const input = {
    kind: String(body.kind ?? '') as PaymentKind,
    amount: Number(body.amount),
    date: String(body.date ?? ''),
    accountId: String(body.accountId ?? ''),
    partyName: (body.partyName as string | null) ?? null,
    reference: (body.reference as string | null) ?? null,
    note: (body.note as string | null) ?? null,
  }

  // Checked again here. The form can be bypassed; the ledger cannot.
  const bad = paymentProblem(input)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const { data: order } = await supabase.from('orders')
    .select('id, number').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const { data: account } = await supabase.from('accounts')
    .select('id').eq('id', input.accountId).eq('user_id', user.id).maybeSingle()
  if (!account) return NextResponse.json({ error: 'That account does not exist' }, { status: 400 })

  const draft = paymentTransaction(input, String(order.number))
  const { data: txn, error: txnErr } = await supabase.from('transactions')
    .insert({
      user_id: user.id,
      ...draft,
      order_id: id,
      category_id: (body.categoryId as string | null) || null,
    })
    .select('id').single()
  if (txnErr || !txn) {
    return NextResponse.json({ error: `Could not post the payment: ${txnErr?.message ?? 'unknown error'}` }, { status: 500 })
  }

  const { data: payment, error } = await supabase.from('order_payments')
    .insert({
      order_id: id, user_id: user.id,
      kind: input.kind, amount: draft.amount, paid_date: input.date,
      account_id: input.accountId,
      supplier_id: (body.supplierId as string | null) || null,
      party_name: input.partyName,
      reference: input.reference, note: input.note,
      transaction_id: txn.id,
    })
    .select('*').single()

  if (error || !payment) {
    // Roll the money back. A bank entry with nothing pointing at it is worse
    // than no entry at all: it shows up in the balances and explains nothing.
    await supabase.from('transactions').delete().eq('id', txn.id).eq('user_id', user.id)
    return NextResponse.json({ error: `Could not save the payment: ${error?.message ?? 'unknown error'}` }, { status: 500 })
  }

  return NextResponse.json({ payment })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const paymentId = new URL(req.url).searchParams.get('paymentId')
  if (!paymentId) return NextResponse.json({ error: 'Which payment?' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: payment } = await supabase.from('order_payments')
    .select('id, transaction_id').eq('id', paymentId).eq('order_id', id).eq('user_id', user.id).maybeSingle()
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const { error } = await supabase.from('order_payments')
    .delete().eq('id', paymentId).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The entry this payment posted, by id. Never a query by amount and date,
  // which would happily delete somebody else's identical payment.
  if (payment.transaction_id) {
    await supabase.from('transactions')
      .delete().eq('id', payment.transaction_id).eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true })
}
