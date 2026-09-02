// Owner-only control of the live auction.
//
// The foreman opens the window, watches bids arrive, and closes it. There is no
// clock anywhere in this feature: "closed" always means a person closed it, so
// there is never an argument about whether a bid landed a second too late
// because of a scheduler.
//
// Closing does NOT award anything. It stops new bids and tells the foreman who
// is highest; recording the auction remains the same manual step it has always
// been, in the same form, writing the same rows.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bidCeiling } from '@/lib/chit/auction'
import { defaultIncrement } from '@/lib/chit/bidding'

export const dynamic = 'force-dynamic'

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** The bid book for one group: the open window, if any, and every bid in it. */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const groupId = req.nextUrl.searchParams.get('groupId') ?? ''
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const { data: windows } = await supabase.from('chit_bid_windows')
    .select('*').eq('user_id', user.id).eq('group_id', groupId)
    .order('month_number', { ascending: false })
  const open = (windows ?? []).find((w: { status: string }) => w.status === 'open') ?? null

  let bids: unknown[] = []
  if (open) {
    // The foreman DOES see names — it is his chit and he has to pay someone.
    const { data } = await supabase.from('chit_bids')
      .select('id, member_id, amount, placed_at, source, ip, member:chit_members(name)')
      .eq('user_id', user.id).eq('window_id', (open as { id: string }).id)
      .order('amount', { ascending: false })
    bids = data ?? []
  }

  return NextResponse.json({ windows: windows ?? [], open, bids })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const groupId = String(body?.groupId ?? '')
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const { data: groups } = await supabase.from('chit_groups')
    .select('id, chit_value, members, bid_ceiling_pct, commission_model')
    .eq('id', groupId).eq('user_id', user.id).limit(1)
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
    const increment = num(body?.minIncrement) > 0
      ? num(body.minIncrement)
      : defaultIncrement(Number(group.chit_value))

    const { data, error } = await supabase.from('chit_bid_windows').upsert({
      user_id: user.id, group_id: groupId, month_number: monthNumber,
      status: 'open', ceiling_amount: ceiling, min_increment: increment,
      opened_at: new Date().toISOString(), closed_at: null,
    }, { onConflict: 'group_id,month_number' }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, window: data })
  }

  if (action === 'close' || action === 'cancel') {
    const status = action === 'close' ? 'closed' : 'cancelled'
    const { data, error } = await supabase.from('chit_bid_windows')
      .update({ status, closed_at: new Date().toISOString() })
      .eq('user_id', user.id).eq('group_id', groupId).eq('status', 'open')
      .select('*')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const closed = data?.[0] ?? null
    if (!closed) return NextResponse.json({ error: 'No open bidding window for this group.' }, { status: 400 })

    // Report the highest bid so the foreman can carry it into the auction form.
    // Reported, NOT applied: recording the auction stays a deliberate act.
    const db = createAdminClient()
    const { data: bids } = await db.from('chit_bids')
      .select('member_id, amount, placed_at, member:chit_members(name)')
      .eq('window_id', closed.id)
      .order('amount', { ascending: false }).order('placed_at', { ascending: true })

    return NextResponse.json({
      ok: true,
      window: closed,
      // Highest amount, earliest bid breaking a tie — the same rule the members
      // were shown while bidding.
      winner: bids?.[0] ?? null,
      bidCount: bids?.length ?? 0,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
