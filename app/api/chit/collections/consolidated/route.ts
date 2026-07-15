import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CHIT_INCOME_CATEGORY } from '@/lib/chit/posting'

export const dynamic = 'force-dynamic'

/**
 * One member paying several months at once → ONE transaction, not one per month.
 *
 * Five months of installments is one thing that happened — the member handed over
 * a lump sum — so it should be a single line in the books, named for what it is:
 * "<chit> — <member> — months 3, 4, 5". The individual chit_collections still
 * exist (so each month is tracked and reversible), but they all point at the same
 * income transaction.
 *
 * Reversing one of those months later doesn't delete the shared transaction — it
 * SHRINKS it. See the DELETE handler in ../route.ts.
 *
 * Body: { group_id, member_id, account_id, paid_date,
 *         entries: [{ month_number, amount }] }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const groupId = String(body.group_id ?? '')
  const memberId = String(body.member_id ?? '')
  const accountId = String(body.account_id ?? '')
  const paidDate = (body.paid_date as string) || new Date().toISOString().split('T')[0]
  const entries = (body.entries as { month_number: number; amount: number }[]) ?? []

  if (!groupId || !memberId || !accountId || entries.length === 0) {
    return NextResponse.json({ error: 'group_id, member_id, account_id and entries required' }, { status: 400 })
  }

  const [{ data: group }, { data: member }] = await Promise.all([
    supabase.from('chit_groups').select('name').eq('id', groupId).eq('user_id', user.id).maybeSingle(),
    supabase.from('chit_members').select('name').eq('id', memberId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!group || !member) return NextResponse.json({ error: 'Group or member not found' }, { status: 404 })

  // Drop months already recorded — a second payment for a paid slot is a mistake,
  // not a doubling.
  const wantMonths = entries.map(e => e.month_number)
  const { data: existing } = await supabase.from('chit_collections')
    .select('month_number, income_transaction_id')
    .eq('group_id', groupId).eq('member_id', memberId).eq('user_id', user.id).in('month_number', wantMonths)
  const alreadyPaid = new Set((existing ?? []).filter(e => e.income_transaction_id).map(e => e.month_number))

  const fresh = entries.filter(e => !alreadyPaid.has(e.month_number) && Number(e.amount) > 0)
  if (fresh.length === 0) {
    return NextResponse.json({ error: 'All those months are already recorded.' }, { status: 409 })
  }

  const months = fresh.map(e => e.month_number).sort((a, b) => a - b)
  const total = Math.round(fresh.reduce((t, e) => t + Number(e.amount), 0) * 100) / 100
  const category = await ensureCategory(supabase, user.id, CHIT_INCOME_CATEGORY, 'income')

  // The one consolidated transaction.
  const { data: posted, error: txErr } = await supabase.from('transactions').insert({
    user_id: user.id,
    account_id: accountId,
    type: 'income',
    amount: total,
    date: paidDate,
    name: consolidatedName(group.name, member.name, months),
    notes: `Chit: ${group.name}, ${member.name}, months ${months.join(', ')}`,
    category_id: category,
  }).select('id').single()
  if (txErr) return NextResponse.json({ error: `Could not post the payment: ${txErr.message}` }, { status: 500 })

  // A collection row per month, all linked to that one transaction.
  const rows = fresh.map(e => ({
    user_id: user.id, group_id: groupId, member_id: memberId, month_number: e.month_number,
    amount: Number(e.amount), paid_date: paidDate, account_id: accountId, income_transaction_id: posted.id,
  }))

  // Upsert-ish: an unpaid row for the slot may already exist; delete any then insert.
  await supabase.from('chit_collections')
    .delete().eq('group_id', groupId).eq('member_id', memberId).eq('user_id', user.id).in('month_number', months)

  const { error: cErr } = await supabase.from('chit_collections').insert(rows)
  if (cErr) {
    await supabase.from('transactions').delete().eq('id', posted.id)   // roll the money back
    return NextResponse.json({ error: `Could not save the collections: ${cErr.message}` }, { status: 500 })
  }

  await supabase.from('chit_receivables')
    .update({ status: 'PAID' })
    .eq('user_id', user.id).eq('group_id', groupId).eq('member_id', memberId).in('month_number', months)

  return NextResponse.json({ done: months.length, months, transaction_id: posted.id, total })
}

/** "UC G1 — Anbu — months 3, 4, 5" */
export function consolidatedName(groupName: string, memberName: string, months: number[]): string {
  const list = months.slice().sort((a, b) => a - b)
  const monthText = list.length === 1 ? `month ${list[0]}` : `months ${list.join(', ')}`
  return `${groupName} — ${memberName} — ${monthText}`
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
