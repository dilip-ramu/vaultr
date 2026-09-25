// Owner-only control of the live auction.
//
// The foreman opens the window, watches bids arrive, and closes it. There is no
// clock anywhere in this feature: "closed" always means a person closed it, so
// there is never an argument about whether a bid landed a second too late
// because of a scheduler.
//
// CLOSING NOW RECORDS THE AUCTION. It used to stop new bids and report who was
// highest, leaving the foreman to retype the winner and the amount into the
// auction form. Two ways to lose money there: a mistyped figure, and a close
// that never gets followed up. The numbers are already known at the moment of
// closing, so closing writes them — winner, discount, commission, dividend and
// net payout — through the same runAuction maths the manual form uses.
//
// What it still does NOT do is pay anybody. The payout stays a separate,
// deliberate act against a chosen account, because that is the step where money
// actually leaves.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, ledgerClient, CAN, forbidden } from '@/lib/chit/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { bidCeiling, runAuction, toParams } from '@/lib/chit/auction'
import { decideClose } from '@/lib/chit/closeAuction'
import { placeBidForMember } from '@/lib/chit/portal-bids'
import type { ChitGroup } from '@/lib/chit/types'
import { defaultIncrement } from '@/lib/chit/bidding'

export const dynamic = 'force-dynamic'

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** The bid book for one group: the open window, if any, and every bid in it. */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  // Whose chit books are we in? The owner, or a staff member they granted
  // chit-only access to. Everything below filters on access.ownerId, never on
  // the signed-in user — they are the same person only when the owner works.
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const owner = access.ownerId

  const groupId = req.nextUrl.searchParams.get('groupId') ?? ''
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const { data: windows } = await supabase.from('chit_bid_windows')
    .select('*').eq('user_id', owner).eq('group_id', groupId)
    .order('month_number', { ascending: false })
  const open = (windows ?? []).find((w: { status: string }) => w.status === 'open') ?? null

  let bids: unknown[] = []
  if (open) {
    // The foreman DOES see names — it is his chit and he has to pay someone.
    const { data } = await supabase.from('chit_bids')
      .select('id, member_id, amount, placed_at, source, ip, member:chit_members(name)')
      .eq('user_id', owner).eq('window_id', (open as { id: string }).id)
      .order('amount', { ascending: false })
    bids = data ?? []
  }

  return NextResponse.json({ windows: windows ?? [], open, bids })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  // Whose chit books are we in? The owner, or a staff member they granted
  // chit-only access to. Everything below filters on access.ownerId, never on
  // the signed-in user — they are the same person only when the owner works.
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const owner = access.ownerId
  if (!CAN.runAuction(access.role)) {
    return NextResponse.json({ error: forbidden('open or close bidding', access.role) }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const groupId = String(body?.groupId ?? '')
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const { data: groups } = await supabase.from('chit_groups')
    .select('id, chit_value, members, bid_ceiling_pct, commission_model')
    .eq('id', groupId).eq('user_id', owner).limit(1)
  const group = groups?.[0]
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  if (action === 'open') {
    const monthNumber = Math.floor(num(body?.monthNumber))
    if (monthNumber < 1) return NextResponse.json({ error: 'Which month is this auction for?' }, { status: 400 })

    // An auction already recorded for that month is finished. Re-opening
    // bidding on it would invite bids for a prize that is already paid.
    const { data: done } = await supabase.from('chit_auctions')
      .select('id').eq('group_id', groupId).eq('month_number', monthNumber).limit(1)
    if (done?.length) {
      return NextResponse.json({ error: `Month ${monthNumber} already has a recorded auction.` }, { status: 400 })
    }

    const { data: others } = await supabase.from('chit_bid_windows')
      .select('id, month_number').eq('group_id', groupId).eq('status', 'open').limit(1)
    if (others?.length && others[0].month_number !== monthNumber) {
      return NextResponse.json(
        { error: `Bidding is already open for month ${others[0].month_number}. Close that first.` },
        { status: 400 },
      )
    }

    // The ceiling and the increment are FROZEN onto the window now. Changing the
    // group's settings later must not rewrite the rules of an auction that has
    // already been held.
    const ceiling = bidCeiling({
      chitValue: Number(group.chit_value), bidCeilingPct: Number(group.bid_ceiling_pct),
    })
    // Bids go up in hundreds, so the stored increment is one step. It used to
    // be a quarter of a percent of the pot, which made the smallest legal raise
    // ₹1,300 on a ₹5.2L chit — not how the auction is called in the room.
    const increment = defaultIncrement()

    const { data, error } = await supabase.from('chit_bid_windows').upsert({
      user_id: owner, group_id: groupId, month_number: monthNumber,
      status: 'open', ceiling_amount: ceiling, min_increment: increment,
      opened_at: new Date().toISOString(), closed_at: null,
    }, { onConflict: 'group_id,month_number' }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, window: data })
  }

  // The foreman bidding for somebody standing in front of him, or on the phone.
  // Same rules as a member's own bid; written down as source 'foreman' so the
  // log says who actually pressed the button.
  if (action === 'bid_for') {
    const memberId = String(body?.memberId ?? '')
    if (!memberId) return NextResponse.json({ error: 'Choose a member.' }, { status: 400 })

    const { data: m } = await supabase.from('chit_members')
      .select('id, name').eq('id', memberId).eq('user_id', owner).maybeSingle()
    if (!m) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

    const result = await placeBidForMember({
      memberId, groupId, amount: body?.amount,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    })
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 })
    return NextResponse.json({ ok: true, amount: result.amount, memberName: m.name })
  }

  if (action === 'close' || action === 'cancel') {
    const status = action === 'close' ? 'closed' : 'cancelled'
    const { data, error } = await supabase.from('chit_bid_windows')
      .update({ status, closed_at: new Date().toISOString() })
      .eq('user_id', owner).eq('group_id', groupId).eq('status', 'open')
      .select('*')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const closed = data?.[0] ?? null
    if (!closed) return NextResponse.json({ error: 'No open bidding window for this group.' }, { status: 400 })

    const db = createAdminClient()
    const { data: bidRows } = await db.from('chit_bids')
      .select('member_id, amount, placed_at, member:chit_members(name)')
      .eq('window_id', closed.id)

    const bids = ((bidRows ?? []) as any[]).map(b => ({
      memberId: b.member_id, amount: num(b.amount), placedAt: String(b.placed_at ?? ''),
      name: Array.isArray(b.member) ? b.member[0]?.name : b.member?.name,
    }))

    // Cancelling throws the window away. It records nothing, on purpose —
    // "cancelled" means the auction did not happen.
    if (action === 'cancel') {
      return NextResponse.json({ ok: true, window: closed, cancelled: true, bidCount: bids.length })
    }

    // A member wins the pot once. Anyone who already has cannot win again, even
    // if an older bid of theirs is still the highest number in the list.
    const { data: priorWins } = await supabase.from('chit_auctions')
      .select('winner_member_id, month_number')
      .eq('group_id', groupId).eq('user_id', owner)
      .neq('month_number', closed.month_number)
    const alreadyWon = ((priorWins ?? []) as any[])
      .map(a => a.winner_member_id).filter(Boolean) as string[]

    const outcome = decideClose(bids, alreadyWon)
    if (outcome.kind === 'no_bids') {
      // Said out loud rather than left to be noticed. Nothing was recorded.
      return NextResponse.json({
        ok: true, window: closed, bidCount: bids.length, auction: null,
        message: 'Bidding closed. Nobody bid, so no auction was recorded for this month.',
      })
    }

    // Already paid out? Then this month is settled and must not be rewritten.
    const { data: prior } = await supabase.from('chit_auctions')
      .select('id, payout_transaction_id')
      .eq('group_id', groupId).eq('month_number', closed.month_number).maybeSingle()
    if (prior?.payout_transaction_id) {
      return NextResponse.json({
        ok: true, window: closed, bidCount: bids.length, auction: null,
        message: 'Bidding closed. This month was already paid out, so the recorded auction was left untouched.',
      })
    }

    const { data: group } = await supabase.from('chit_groups')
      .select('*').eq('id', groupId).eq('user_id', owner).maybeSingle()
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    // The same maths the manual auction form runs. One implementation, so a
    // recorded auction is identical whichever way it was entered.
    const result = runAuction({
      group: toParams(group as ChitGroup),
      monthNumber: num(closed.month_number),
      bidAmount: outcome.winner.amount,
    })

    const winnerName = bids.find(b => b.memberId === outcome.winner.memberId)?.name ?? null
    const row = {
      user_id: owner,
      group_id: groupId,
      month_number: num(closed.month_number),
      auction_date: new Date().toISOString().split('T')[0],
      winner_member_id: outcome.winner.memberId,
      bid_amount: result.discount,
      commission: result.commission,
      net_payout: result.netPayout,
      dividend_per_member: result.dividendPerMember,
      notes: `Recorded automatically when bidding closed. `
        + `${bids.length} bid${bids.length === 1 ? '' : 's'}, highest ${outcome.winner.amount}.`,
    }

    const { data: auction, error: auctionErr } = prior
      ? await supabase.from('chit_auctions').update(row).eq('id', prior.id).select('*').single()
      : await supabase.from('chit_auctions').insert(row).select('*').single()

    if (auctionErr) {
      // The window IS closed — that part stuck. Say exactly what did and did not
      // happen rather than implying the whole thing failed.
      return NextResponse.json({
        ok: true, window: closed, bidCount: bids.length, auction: null,
        message: `Bidding closed, but the auction could not be recorded: ${auctionErr.message}. `
          + 'Record it by hand from the bid list.',
      })
    }

    return NextResponse.json({
      ok: true,
      window: closed,
      bidCount: bids.length,
      auction,
      winner: { memberId: outcome.winner.memberId, name: winnerName, amount: outcome.winner.amount },
      message: `Bidding closed. ${winnerName ?? 'The highest bidder'} won month ${closed.month_number} `
        + `with a discount of ${result.discount}. Payout ${result.netPayout} is ready to pay.`,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
