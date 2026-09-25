'use client'

// Running the auction.
//
// Everyone who can bid is on screen with a box beside their name. Type a
// figure, press Enter, next person. No dropdown, no dialog, no scrolling back
// to find who you were on — because the room does not wait for the screen.
//
// Three things this screen is careful about:
//
//   • The leader is obvious at a glance. That is the number being called out,
//     and it changes while you are typing.
//   • Members who cannot bid are SHOWN, greyed, with the month they won. "Why
//     isn't Ramesh on the list" is a question worth answering before it is
//     asked.
//   • What you have typed is never overwritten by the four-second refresh.
//     Losing a half-typed figure mid-auction would be infuriating.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Radio, Play, Square, Trophy, Check } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { BID_STEP } from '@/lib/chit/bidding'

const POLL_MS = 4000
const inr = (n: unknown) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

/** Just the time. The date is today — this is a live auction. */
const clock = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

interface RoomMember {
  id: string
  name: string
  code: string | null
  slot: number | null
  /** The month they took the pot, if they have. They cannot bid again. */
  wonMonth: number | null
}
interface BidRow {
  id: string
  member_id: string
  amount: number
  placed_at: string
  source: string
}
interface WindowRow {
  id: string
  month_number: number
  status: string
  ceiling_amount: number
}

export default function AuctionRoom({
  groupId, groupName, chitValue, installment, members, nextMonth,
}: {
  groupId: string
  groupName: string
  chitValue: number
  installment: number
  members: RoomMember[]
  nextMonth: number | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState<WindowRow | null>(null)
  const [bids, setBids] = useState<BidRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [closed, setClosed] = useState<{ message: string; recorded: boolean } | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/chit/bidding?groupId=${encodeURIComponent(groupId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      setOpen(body.open ?? null)
      setBids(body.bids ?? [])
    } catch { /* a dropped poll is not worth interrupting an auction for */ }
    finally { setLoaded(true) }
  }, [groupId])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!open) return
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [open, refresh])

  // Highest wins; earliest bid breaks a tie. Same rule the members see and the
  // same one that writes the winner down when bidding closes.
  const ranked = bids.slice().sort((a, b) =>
    Number(b.amount) - Number(a.amount) || String(a.placed_at).localeCompare(String(b.placed_at)))
  const leader = ranked[0] ?? null
  const highest = leader ? Number(leader.amount) : null
  const minimumNext = highest == null ? BID_STEP : Math.ceil((highest + BID_STEP) / BID_STEP) * BID_STEP

  // Newest first: during an auction the last thing said matters most.
  const history = bids.slice().sort((a, b) =>
    String(b.placed_at).localeCompare(String(a.placed_at)))

  const bestOf = (memberId: string): number | null => {
    const mine = bids.filter(b => b.member_id === memberId).map(b => Number(b.amount))
    return mine.length ? Math.max(...mine) : null
  }
  const nameOf = (memberId: string) => members.find(m => m.id === memberId)?.name ?? 'Member'

  async function control(action: 'open' | 'close' | 'cancel', monthNumber?: number) {
    setBusy(action)
    try {
      const res = await fetch('/api/chit/bidding', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, groupId, monthNumber }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not do that', 'error'); return }

      if (action === 'open') { notify(`Bidding open for month ${monthNumber}`, 'success'); setClosed(null) }
      else if (action === 'close') {
        setClosed({ message: body.message ?? 'Bidding closed.', recorded: Boolean(body.auction) })
        notify(body.message ?? 'Bidding closed', body.auction ? 'success' : undefined)
        router.refresh()
      } else notify('Bidding cancelled')
      await refresh()
    } finally { setBusy(null) }
  }

  async function bidFor(m: RoomMember) {
    const amount = Number(drafts[m.id])
    if (!amount) return
    setBusy(m.id)
    try {
      const res = await fetch('/api/chit/bidding', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bid_for', groupId, memberId: m.id, amount }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'That bid was not accepted', 'error'); return }
      notify(`${m.name} — ${inr(body.amount)}`)
      setDrafts(d => ({ ...d, [m.id]: '' }))
      await refresh()
    } finally { setBusy(null) }
  }

  const eligible = members.filter(m => m.wonMonth == null)
  const past = members.filter(m => m.wonMonth != null)
  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-4 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/chit/groups/${groupId}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold"
            style={{ color: 'var(--text-faint)' }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to {groupName}
          </Link>
          <h1 className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-2"
            style={{ color: 'var(--text)' }}>
            <Radio className="w-5 h-5" style={{ color: open ? 'var(--income)' : 'var(--text-faint)' }} />
            Auction room
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {groupName} · pot {inr(chitValue)} · installment {inr(installment)}
          </p>
        </div>

        {open ? (
          <div className="flex items-center gap-2">
            <button onClick={() => control('close')} disabled={busy != null}
              className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-40"
              style={{ background: 'var(--brand)' }}>
              <Square className="w-4 h-4" /> Close &amp; record
            </button>
            <button
              onClick={async () => {
                if (await confirmDialog(
                  'Cancel this auction?\n\nBids already placed stay in the log, but no winner is '
                  + 'taken from them and nothing is recorded for this month.')) control('cancel')
              }}
              disabled={busy != null}
              className="text-sm font-bold px-3 py-2.5 rounded-xl disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
        ) : nextMonth ? (
          <button onClick={() => control('open', nextMonth)} disabled={busy != null}
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-40"
            style={{ background: 'var(--brand)' }}>
            <Play className="w-4 h-4" /> Open bidding — month {nextMonth}
          </button>
        ) : null}
      </div>

      {/* ── What is being called right now ──────────────────────────────── */}
      {open && (
        <div className="rounded-2xl p-4 flex flex-wrap items-center gap-x-8 gap-y-3" style={card}>
          <Figure label={`Month ${open.month_number} · highest bid`}
            value={highest == null ? 'No bids yet' : inr(highest)}
            sub={leader ? `${nameOf(leader.member_id)} leading` : 'Nobody has bid'} big />
          <Figure label="Next bid must be" value={inr(minimumNext)} sub={`rises in ${inr(BID_STEP)}s`} />
          <Figure label="Ceiling" value={inr(open.ceiling_amount)} sub="the most anyone may bid" />
          <Figure label="Bids" value={String(bids.length)} sub={`${eligible.length} can still bid`} />
        </div>
      )}

      {closed && (
        <div className="rounded-2xl p-4" style={card}>
          <p className="text-[11px] uppercase tracking-wide font-extrabold" style={{ color: 'var(--text-faint)' }}>
            {closed.recorded ? 'Auction recorded' : 'Bidding closed'}
          </p>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--text)' }}>{closed.message}</p>
          {closed.recorded && (
            <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Paying the winner is still a separate step on the group page — that is where the
              money actually leaves.
            </p>
          )}
        </div>
      )}

      {!open && loaded && !closed && (
        <div className="rounded-2xl p-6 text-center" style={card}>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Bidding is not open</p>
          <p className="text-[12.5px] mt-1.5 leading-relaxed max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            {nextMonth
              ? `Open bidding for month ${nextMonth} to start taking bids here and on members' phones.`
              : 'Every month of this chit has been auctioned.'}
          </p>
        </div>
      )}

      {/* ── Two columns: what has happened, and what you are doing ─────── */}
      {open && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">

          {/* HISTORY. Second on a phone — the room comes first there. */}
          <div className="order-2 lg:order-1 space-y-4">
            <div className="rounded-2xl overflow-hidden" style={card}>
              <div className="px-4 py-2.5 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-[11px] uppercase tracking-wide font-extrabold" style={{ color: 'var(--text-faint)' }}>
                  Bid history
                </p>
                <p className="text-[11px] font-bold" style={{ color: 'var(--text-faint)' }}>
                  {bids.length} {bids.length === 1 ? 'bid' : 'bids'} · newest first
                </p>
              </div>

              {bids.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  No bids yet. They appear here the moment they land, whether you enter
                  them or a member bids from their phone.
                </p>
              ) : (
                <div className="max-h-[32rem] overflow-y-auto">
                  {history.map((b, i) => {
                    const top = leader?.id === b.id
                    return (
                      <div key={b.id} className="flex items-baseline gap-3 px-4 py-2"
                        style={{
                          borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                          background: top ? 'color-mix(in srgb, var(--brand) 7%, transparent)' : undefined,
                        }}>
                        <span className="text-[11px] shrink-0 w-16" style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                          {clock(b.placed_at)}
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] truncate" style={{ color: 'var(--text)', fontWeight: top ? 800 : 500 }}>
                          {top && <Trophy className="w-3.5 h-3.5 inline mr-1" style={{ color: '#b7791f' }} />}
                          {nameOf(b.member_id)}
                          {b.source === 'foreman' && (
                            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}> · entered by you</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[13.5px] font-extrabold"
                          style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                          {inr(b.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {past.length > 0 && (
              <div className="rounded-2xl p-4" style={card}>
                <p className="text-[11px] uppercase tracking-wide font-extrabold mb-2" style={{ color: 'var(--text-faint)' }}>
                  Already taken the pot — cannot bid
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {past.map(m => (
                    <p key={m.id} className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                      {m.name} <span style={{ color: 'var(--text-faint)' }}>· month {m.wonMonth}</span>
                    </p>
                  ))}
                </div>
                <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                  They can still watch the auction live on their phones.
                </p>
              </div>
            )}
          </div>

          {/* THE ROOM. First on a phone, because this is the thing in use. */}
          <div className="order-1 lg:order-2">
            <div className="rounded-2xl overflow-hidden" style={card}>
              <div className="px-4 py-2.5 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-[11px] uppercase tracking-wide font-extrabold" style={{ color: 'var(--text-faint)' }}>
                  Enter a bid
                </p>
                <p className="text-[11px] font-bold" style={{ color: 'var(--text-faint)' }}>
                  {eligible.length} can bid · at least {inr(minimumNext)}
                </p>
              </div>

              {eligible.map((m, i) => {
                const best = bestOf(m.id)
                const leading = leader?.member_id === m.id
                return (
                  <div key={m.id}
                    className="flex items-center gap-3 px-3 md:px-4 py-2.5"
                    style={{
                      borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                      background: leading ? 'color-mix(in srgb, var(--brand) 7%, transparent)' : undefined,
                    }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold truncate flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                        {leading && <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: '#b7791f' }} />}
                        {m.name}
                        {m.code && <span className="text-[11px] font-bold" style={{ color: 'var(--income)' }}>({m.code})</span>}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {best != null ? `Their highest so far ${inr(best)}` : 'No bid yet'}
                      </p>
                    </div>

                    <input
                      value={drafts[m.id] ?? ''}
                      inputMode="numeric"
                      placeholder={String(minimumNext)}
                      onChange={e => setDrafts(d => ({ ...d, [m.id]: e.target.value.replace(/[^\d]/g, '') }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bidFor(m) } }}
                      className="w-28 px-2.5 py-2 rounded-lg text-[14px] font-bold text-right outline-none"
                      style={{
                        border: '1px solid var(--border)', background: 'var(--surface-2)',
                        color: 'var(--text)', fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                    <button
                      onClick={() => bidFor(m)}
                      disabled={busy != null || !drafts[m.id]}
                      aria-label={`Record bid for ${m.name}`}
                      className="shrink-0 p-2 rounded-lg disabled:opacity-30"
                      style={{ background: 'var(--brand)', color: 'white' }}>
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}

              {eligible.length === 0 && (
                <p className="px-4 py-5 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  Everybody in this group has already taken the pot.
                </p>
              )}
            </div>

            <p className="text-[11px] mt-2 leading-relaxed px-1" style={{ color: 'var(--text-faint)' }}>
              Type a figure and press Enter. Bids go up in {inr(BID_STEP)}s and must beat the
              standing bid. Members bidding from their phones land in the same list.
            </p>
          </div>
        </div>
      )}

    </div>
  )
}

function Figure({ label, value, sub, big }: {
  label: string; value: string; sub?: string; big?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
        {label}
      </p>
      <p className={big ? 'text-2xl font-extrabold mt-0.5' : 'text-lg font-extrabold mt-0.5'}
        style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
