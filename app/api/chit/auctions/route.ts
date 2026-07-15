import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAuction, type GroupParams } from '@/lib/chit/auction'
import { payoutTransaction, CHIT_EXPENSE_CATEGORY, alreadyPosted } from '@/lib/chit/posting'
import type { ChitGroup } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'

const toParams = (g: ChitGroup): GroupParams => ({
  chitValue: Number(g.chit_value),
  members: g.members,
  commissionPct: Number(g.commission_pct),
  bidCeilingPct: Number(g.bid_ceiling_pct),
  model: g.commission_model,
})

// GET ?group_id= — auction history for a group.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!groupId) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  const { data, error } = await supabase.from('chit_auctions')
    .select('*').eq('user_id', user.id).eq('group_id', groupId)
    .order('month_number', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ auctions: data ?? [] })
}

// POST — conduct an auction. The maths is computed HERE from the stored group,
// not trusted from the client, so a tampered payload can't mis-pay a winner.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const groupId = String(body.group_id ?? '')
  const monthNumber = Number(body.month_number)
  if (!groupId || !monthNumber) return NextResponse.json({ error: 'group_id and month_number required' }, { status: 400 })

  const { data: group } = await supabase.from('chit_groups')
    .select('*').eq('id', groupId).eq('user_id', user.id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // A member wins the pot ONCE — that's the whole structure of a chit. Reject a
  // winner who has already won another month of this group. Checked here, not just
  // hidden in the UI, so it can't be worked around.
  const winnerId = (body.winner_member_id as string) || null
  if (winnerId) {
    const { data: priorWin } = await supabase.from('chit_auctions')
      .select('month_number').eq('group_id', groupId).eq('user_id', user.id)
      .eq('winner_member_id', winnerId).neq('month_number', monthNumber).maybeSingle()
    if (priorWin) {
      return NextResponse.json({ error: `That member already won month ${priorWin.month_number}. Each member wins only once.` }, { status: 409 })
    }
  }

  const result = runAuction({
    group: toParams(group as ChitGroup),
    monthNumber,
    bidAmount: Number(body.bid_amount ?? 0),
  })

  const row = {
    user_id: user.id,
    group_id: groupId,
    month_number: monthNumber,
    auction_date: (body.auction_date as string) || new Date().toISOString().split('T')[0],
    winner_member_id: winnerId,
    bid_amount: result.discount,
    commission: result.commission,
    net_payout: result.netPayout,
    dividend_per_member: result.dividendPerMember,
    notes: (body.notes as string)?.trim() || null,
  }

  // Upsert on (group, month): conducting the same month again corrects it rather
  // than stacking a second auction — but NOT if it's already been paid out.
  const { data: prior } = await supabase.from('chit_auctions')
    .select('id, payout_transaction_id').eq('group_id', groupId).eq('month_number', monthNumber).maybeSingle()

  if (prior && alreadyPosted(prior.payout_transaction_id)) {
    return NextResponse.json({ error: 'This month is already paid out — cannot re-conduct it.' }, { status: 409 })
  }

  const { data, error } = prior
    ? await supabase.from('chit_auctions').update(row).eq('id', prior.id).select('*').single()
    : await supabase.from('chit_auctions').insert(row).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ auction: data, result })
}

// PATCH { id, action: 'pay', account_id } — mark the payout paid, which posts a
// real EXPENSE from the chosen account. THIS is where a payout becomes money.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body.id ?? '')
  const accountId = String(body.account_id ?? '')
  if (!id || !accountId) return NextResponse.json({ error: 'id and account_id required' }, { status: 400 })

  const { data: auction } = await supabase.from('chit_auctions')
    .select('*, group:chit_groups(name)').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!auction) return NextResponse.json({ error: 'Auction not found' }, { status: 404 })

  // Already paid? Do nothing. Clicking twice must not pay twice — that's real
  // money doubled.
  if (alreadyPosted(auction.payout_transaction_id)) {
    return NextResponse.json({ error: 'This payout is already recorded.' }, { status: 409 })
  }
  if (Number(auction.net_payout) <= 0) {
    return NextResponse.json({ error: 'Nothing to pay out for this month.' }, { status: 400 })
  }

  // Winner's name for the transaction label.
  let memberName: string | undefined
  if (auction.winner_member_id) {
    const { data: m } = await supabase.from('chit_members').select('name').eq('id', auction.winner_member_id).maybeSingle()
    memberName = m?.name
  }

  const groupName = (auction.group as { name?: string })?.name ?? 'Chit'
  const category = await ensureCategory(supabase, user.id, CHIT_EXPENSE_CATEGORY, 'expense')

  const txn = payoutTransaction({
    userId: user.id, accountId, amount: Number(auction.net_payout),
    date: (body.date as string) || new Date().toISOString().split('T')[0],
    groupName, memberName, monthNumber: auction.month_number,
  })

  const { data: posted, error: txErr } = await supabase.from('transactions')
    .insert({ ...txn, category_id: category }).select('id').single()
  if (txErr) return NextResponse.json({ error: `Could not post the payout: ${txErr.message}` }, { status: 500 })

  // Link it back. If this fails, roll the transaction back — a payout that isn't
  // linked would be re-payable, doubling the money.
  const { error: linkErr } = await supabase.from('chit_auctions')
    .update({ payout_transaction_id: posted.id, paid_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
  if (linkErr) {
    await supabase.from('transactions').delete().eq('id', posted.id)
    return NextResponse.json({ error: `Could not record the payout: ${linkErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, transaction_id: posted.id })
}

/** Find-or-create a category by name + type, returning its id. */
// DELETE ?id= — remove an auction. Refused once the payout has been paid, because
// that's real money out; you'd delete the payout transaction first.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: auction } = await supabase.from('chit_auctions')
    .select('payout_transaction_id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!auction) return NextResponse.json({ error: 'Auction not found' }, { status: 404 })

  if (alreadyPosted(auction.payout_transaction_id)) {
    return NextResponse.json({ error: 'This payout is already recorded — reverse the payment before deleting the auction.' }, { status: 409 })
  }

  const { error } = await supabase.from('chit_auctions').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
