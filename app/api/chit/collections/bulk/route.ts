import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { collectionTransaction, CHIT_INCOME_CATEGORY, alreadyPosted } from '@/lib/chit/posting'

export const dynamic = 'force-dynamic'

/**
 * Mark several members paid for a month in one go.
 *
 * Each entry becomes a real INCOME transaction, exactly like a single collection
 * — the bulk part is only about saving clicks, not about cutting corners. So the
 * same guards apply per row: an installment already recorded is skipped, not
 * doubled, and if one row's transaction fails the others still go through and the
 * failure is reported rather than swallowed.
 *
 * Body: { group_id, paid_date, entries: [{ member_id, month_number, amount, account_id }] }
 * account_id / amount may be omitted per entry to fall back to the top-level default.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const groupId = String(body.group_id ?? '')
  const paidDate = (body.paid_date as string) || new Date().toISOString().split('T')[0]
  const defaultAccount = String(body.account_id ?? '')
  const entries = (body.entries as { member_id: string; month_number: number; amount?: number; account_id?: string }[]) ?? []

  if (!groupId || entries.length === 0) return NextResponse.json({ error: 'group_id and entries required' }, { status: 400 })

  const { data: group } = await supabase.from('chit_groups')
    .select('name').eq('id', groupId).eq('user_id', user.id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const category = await ensureCategory(supabase, user.id, CHIT_INCOME_CATEGORY, 'income')

  // Names once, not per row.
  const memberIds = [...new Set(entries.map(e => e.member_id))]
  const { data: memberRows } = await supabase.from('chit_members')
    .select('id, name').in('id', memberIds).eq('user_id', user.id)
  const nameOf = new Map((memberRows ?? []).map(m => [m.id, m.name]))

  // What's already collected this month, so we never double a slot.
  const months = [...new Set(entries.map(e => e.month_number))]
  const { data: existing } = await supabase.from('chit_collections')
    .select('id, member_id, month_number, income_transaction_id')
    .eq('group_id', groupId).eq('user_id', user.id).in('month_number', months)
  const priorKey = new Map(
    (existing ?? []).map(c => [`${c.member_id}:${c.month_number}`, c]),
  )

  let done = 0, skipped = 0
  const failed: string[] = []

  for (const e of entries) {
    const accountId = e.account_id || defaultAccount
    const amount = Number(e.amount ?? 0)
    const name = nameOf.get(e.member_id) ?? 'Member'

    if (!accountId) { failed.push(`${name}: no account`); continue }
    if (!(amount > 0)) { failed.push(`${name}: no amount`); continue }

    const prior = priorKey.get(`${e.member_id}:${e.month_number}`)
    if (prior && alreadyPosted(prior.income_transaction_id)) { skipped++; continue }

    const txn = collectionTransaction({
      userId: user.id, accountId, amount, date: paidDate,
      groupName: group.name, memberName: name, monthNumber: e.month_number,
    })

    const { data: posted, error: txErr } = await supabase.from('transactions')
      .insert({ ...txn, category_id: category }).select('id').single()
    if (txErr) { failed.push(`${name}: ${txErr.message}`); continue }

    const row = {
      user_id: user.id, group_id: groupId, member_id: e.member_id, month_number: e.month_number,
      amount, paid_date: paidDate, account_id: accountId, income_transaction_id: posted.id,
    }
    const { error: cErr } = prior
      ? await supabase.from('chit_collections').update(row).eq('id', prior.id)
      : await supabase.from('chit_collections').insert(row)

    if (cErr) {
      await supabase.from('transactions').delete().eq('id', posted.id)   // roll the money back
      failed.push(`${name}: ${cErr.message}`)
      continue
    }

    await supabase.from('chit_receivables')
      .update({ status: 'PAID' })
      .eq('user_id', user.id).eq('group_id', groupId).eq('member_id', e.member_id).eq('month_number', e.month_number)

    done++
  }

  return NextResponse.json({ done, skipped, failed })
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
