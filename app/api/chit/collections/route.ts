import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { collectionTransaction, CHIT_INCOME_CATEGORY, alreadyPosted } from '@/lib/chit/posting'

export const dynamic = 'force-dynamic'

// GET ?group_id= — collections for a group.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!groupId) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  const { data, error } = await supabase.from('chit_collections')
    .select('*, member:chit_members(name)').eq('user_id', user.id).eq('group_id', groupId)
    .order('month_number', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ collections: data ?? [] })
}

// POST — record a collection AND post it as real INCOME to the chosen account.
// This is the answer to "choose which company got payment, then the transaction
// gets recorded for the associated bank account": you pass the account, it posts.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const groupId = String(body.group_id ?? '')
  const memberId = String(body.member_id ?? '')
  const monthNumber = Number(body.month_number)
  const amount = Number(body.amount)
  const accountId = String(body.account_id ?? '')

  if (!groupId || !memberId || !monthNumber) return NextResponse.json({ error: 'group, member and month are required' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
  if (!accountId) return NextResponse.json({ error: 'Choose which account received the money' }, { status: 400 })

  // Already collected this slot? It's an edit, not a new payment — and if it's
  // already posted, block it so we don't double the income.
  const { data: prior } = await supabase.from('chit_collections')
    .select('id, income_transaction_id')
    .eq('group_id', groupId).eq('member_id', memberId).eq('month_number', monthNumber).maybeSingle()
  if (prior && alreadyPosted(prior.income_transaction_id)) {
    return NextResponse.json({ error: 'This installment is already recorded as received.' }, { status: 409 })
  }

  const [{ data: group }, { data: member }] = await Promise.all([
    supabase.from('chit_groups').select('name').eq('id', groupId).eq('user_id', user.id).maybeSingle(),
    supabase.from('chit_members').select('name').eq('id', memberId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!group || !member) return NextResponse.json({ error: 'Group or member not found' }, { status: 404 })

  const category = await ensureCategory(supabase, user.id, CHIT_INCOME_CATEGORY, 'income')
  const date = (body.paid_date as string) || new Date().toISOString().split('T')[0]

  const txn = collectionTransaction({
    userId: user.id, accountId, amount, date,
    groupName: group.name, memberName: member.name, monthNumber,
  })

  const { data: posted, error: txErr } = await supabase.from('transactions')
    .insert({ ...txn, category_id: category }).select('id').single()
  if (txErr) return NextResponse.json({ error: `Could not post the collection: ${txErr.message}` }, { status: 500 })

  const row = {
    user_id: user.id, group_id: groupId, member_id: memberId, month_number: monthNumber,
    amount, paid_date: date, account_id: accountId, income_transaction_id: posted.id,
    notes: (body.notes as string)?.trim() || null,
  }

  const { data: collection, error } = prior
    ? await supabase.from('chit_collections').update(row).eq('id', prior.id).select('*').single()
    : await supabase.from('chit_collections').insert(row).select('*').single()

  if (error) {
    // Roll the money back — a posted transaction with no collection row would be
    // orphaned income the app can't reconcile.
    await supabase.from('transactions').delete().eq('id', posted.id)
    return NextResponse.json({ error: `Could not save the collection: ${error.message}` }, { status: 500 })
  }

  // Mark the matching receivable paid, if one exists.
  await supabase.from('chit_receivables')
    .update({ status: 'PAID', collection_id: collection.id })
    .eq('user_id', user.id).eq('group_id', groupId).eq('member_id', memberId).eq('month_number', monthNumber)

  return NextResponse.json({ collection, transaction_id: posted.id })
}

// DELETE ?id= OR ?group_id=&member_id=&month_number= — reverse a collection.
//
// A mistake has to be undoable, and undoing it must also delete the INCOME
// transaction it created — otherwise the money stays in your books while the
// chit says it was never collected, and the two quietly disagree forever. So the
// transaction goes first, then the collection row, then the receivable flips back
// to unpaid.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const id = sp.get('id')
  const groupId = sp.get('group_id')
  const memberId = sp.get('member_id')
  const monthNumber = sp.get('month_number')

  // Locate the collection either by its id, or by the slot it occupies.
  let q = supabase.from('chit_collections')
    .select('id, group_id, member_id, month_number, income_transaction_id')
    .eq('user_id', user.id)
  if (id) q = q.eq('id', id)
  else if (groupId && memberId && monthNumber) {
    q = q.eq('group_id', groupId).eq('member_id', memberId).eq('month_number', Number(monthNumber))
  } else {
    return NextResponse.json({ error: 'Pass id, or group_id + member_id + month_number' }, { status: 400 })
  }

  const { data: coll } = await q.maybeSingle()
  if (!coll) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })

  // A transaction may be SHARED — a consolidated payment covers several months
  // through one transaction. If other months still point at it, we must not delete
  // it; we SHRINK it by this month's amount and rename it to the months that
  // remain. Only when this was the last month on the transaction do we delete it.
  if (coll.income_transaction_id) {
    const { data: siblings } = await supabase.from('chit_collections')
      .select('id, month_number, amount, member_id, group_id')
      .eq('income_transaction_id', coll.income_transaction_id).eq('user_id', user.id)
      .neq('id', coll.id)

    if ((siblings ?? []).length > 0) {
      // Shared: reduce the transaction and rebuild its name from the survivors.
      const [{ data: grp }, { data: mem }] = await Promise.all([
        supabase.from('chit_groups').select('name').eq('id', coll.group_id).maybeSingle(),
        supabase.from('chit_members').select('name').eq('id', coll.member_id).maybeSingle(),
      ])
      const remMonths = (siblings ?? []).map(s => s.month_number).sort((a, b) => a - b)
      const remTotal = Math.round((siblings ?? []).reduce((t, s) => t + Number(s.amount), 0) * 100) / 100
      const list = remMonths.length === 1 ? `month ${remMonths[0]}` : `months ${remMonths.join(', ')}`
      await supabase.from('transactions')
        .update({ amount: remTotal, name: `${grp?.name ?? 'Chit'} — ${mem?.name ?? ''} — ${list}` })
        .eq('id', coll.income_transaction_id).eq('user_id', user.id)
    } else {
      // Last one on it — delete the transaction. If this fails we stop, rather than
      // leave the collection gone but its money lingering in the books.
      const { error: txErr } = await supabase.from('transactions')
        .delete().eq('id', coll.income_transaction_id).eq('user_id', user.id)
      if (txErr) return NextResponse.json({ error: `Could not remove the transaction: ${txErr.message}` }, { status: 500 })
    }
  }

  const { error: delErr } = await supabase.from('chit_collections')
    .delete().eq('id', coll.id).eq('user_id', user.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // The slot is owed again.
  await supabase.from('chit_receivables')
    .update({ status: 'PENDING', collection_id: null })
    .eq('user_id', user.id).eq('group_id', coll.group_id)
    .eq('member_id', coll.member_id).eq('month_number', coll.month_number)

  return NextResponse.json({ ok: true })
}

async function ensureCategory(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string,
  name: string, type: 'income' | 'expense',
): Promise<string | null> {
  const { data: found } = await supabase.from('categories')
    .select('id').eq('user_id', userId).eq('name', name).eq('type', type).maybeSingle()
  if (found) return found.id
  const { data: made } = await supabase.from('categories')
    .insert({ user_id: userId, name, type }).select('id').single()
  return made?.id ?? null
}
