import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findDuplicate, type TxnLike } from '@/lib/bank-alert/drafts'

type Ctx = { params: Promise<{ id: string }> }

// POST — approve a draft into a real transaction.
// Body: { force?: boolean }  — force skips the duplicate guard.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { force?: boolean } = {}
  try { body = await req.json() } catch { /* no body is fine */ }

  const { data: draft } = await supabase
    .from('transaction_drafts').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (draft.status === 'approved') return NextResponse.json({ error: 'Already approved' }, { status: 400 })
  if (!draft.matched_account_id) return NextResponse.json({ error: 'Pick an account first' }, { status: 400 })
  if (draft.amount == null) return NextResponse.json({ error: 'Amount is missing' }, { status: 400 })

  const txnDate = (draft.txn_date as string) || new Date().toISOString().slice(0, 10)

  // Duplicate guard — same account + amount within 48h
  if (!body.force) {
    const since = new Date(); since.setDate(since.getDate() - 3)
    const { data: recent } = await supabase
      .from('transactions')
      .select('id, account_id, amount, date, type, name')
      .eq('user_id', user.id)
      .eq('account_id', draft.matched_account_id)
      .gte('date', since.toISOString().slice(0, 10))
    const dup = findDuplicate(
      { accountId: draft.matched_account_id, amount: Number(draft.amount), date: txnDate },
      (recent ?? []) as TxnLike[],
    )
    if (dup) {
      return NextResponse.json({
        duplicate: true,
        message: 'Looks like a possible duplicate — a transaction with the same amount exists in this account within 48 hours.',
        existing: dup,
      }, { status: 409 })
    }
  }

  // Currency: store INR amount. For a non-INR alert, convert at the market rate.
  const currency = (draft.currency as string) || 'INR'
  let inrAmount = Number(draft.amount)
  let originalAmount: number | null = null
  let exchangeRate: number | null = null
  if (currency !== 'INR') {
    const { data: rate } = await supabase
      .from('currency_rates').select('market_rate')
      .eq('user_id', user.id).eq('currency', currency)
      .order('effective_from', { ascending: false }).limit(1).maybeSingle()
    if (rate?.market_rate) {
      originalAmount = Number(draft.amount)
      exchangeRate = Number(rate.market_rate)
      inrAmount = Math.round(originalAmount * exchangeRate * 100) / 100
    } else {
      return NextResponse.json({ error: `No exchange rate set for ${currency}. Add it under Currencies, then approve.` }, { status: 400 })
    }
  }

  // Create the transaction
  const { data: txn, error: txErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      type: draft.direction === 'credit' ? 'income' : 'expense',
      account_id: draft.matched_account_id,
      amount: inrAmount,
      original_currency: currency,
      original_amount: originalAmount,
      exchange_rate_used: exchangeRate,
      date: txnDate,
      name: (draft.name as string) || (draft.merchant as string) || null,
      category_id: draft.category_id ?? null,
      payee_id: draft.payee_id ?? null,
      notes: 'Imported from bank alert',
    })
    .select('id').single()
  if (txErr || !txn) return NextResponse.json({ error: txErr?.message ?? 'Failed to create transaction' }, { status: 500 })

  await supabase.from('transaction_drafts')
    .update({ status: 'approved', transaction_id: txn.id })
    .eq('id', id).eq('user_id', user.id)

  // v68 — if the draft has a staged attachment, link it to the new
  // transaction. The file already lives in Storage; we just insert a
  // pointer row into the attachments table.
  const draftAny = draft as unknown as {
    attachment_path?: string | null; attachment_name?: string | null;
    attachment_size?: number | null; attachment_content_type?: string | null
  }
  if (draftAny.attachment_path && draftAny.attachment_name) {
    await supabase.from('attachments').insert({
      user_id:        user.id,
      transaction_id: txn.id,
      file_path:      draftAny.attachment_path,
      file_name:      draftAny.attachment_name,
      file_size:      draftAny.attachment_size ?? null,
      content_type:   draftAny.attachment_content_type ?? null,
    })
  }

  // Remember the merchant → category/payee/name mapping for next time
  if (draft.merchant && (draft.category_id || draft.payee_id)) {
    await supabase.from('merchant_rules').upsert({
      user_id: user.id,
      merchant_pattern: String(draft.merchant).slice(0, 60),
      default_name: draft.name ?? null,
      category_id: draft.category_id ?? null,
      payee_id: draft.payee_id ?? null,
    }, { onConflict: 'user_id,merchant_pattern' })
  }

  return NextResponse.json({ approved: true, transaction_id: txn.id })
}
