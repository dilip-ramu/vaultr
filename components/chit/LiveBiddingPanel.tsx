'use client'

// The foreman's view of a live auction.
//
// Opening a window lets members bid from their phones. Closing it stops new
// bids and tells you who is highest. It does NOT record the auction — that
// stays the same deliberate step in the same form it has always been, because
// the moment an external person's action can write your books is the moment
// this stops being safe.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Radio, Square, Play, Trophy } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

const POLL_MS = 4000
const inr = (n: unknown) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

interface BidRow {
  id: string
  member_id: string
  amount: number
  placed_at: string
  source: string
  member?: { name?: string } | { name?: string }[] | null
}
interface WindowRow {
  id: string
  month_number: number
  status: string
  ceiling_amount: number
  min_increment: number
  opened_at: string
}

const nameOf = (b: BidRow): string => {
  const m = Array.isArray(b.member) ? b.member[0] : b.member
  return m?.name ?? 'Member'
}

export default function LiveBiddingPanel({
  groupId, nextMonth,
}: { groupId: string; nextMonth: number | null }) {
  const [open, setOpen] = useState<WindowRow | null>(null)
  const [bids, setBids] = useState<BidRow[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ name: string; amount: number; month: number; count: number } | null>(null)
  const loaded = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/chit/bidding?groupId=${encodeURIComponent(groupId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      setOpen(body.open ?? null)
      setBids(body.bids ?? [])
    } catch { /* a dropped poll is not worth a toast */ }
    finally { loaded.current = true }
  }, [groupId])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!open) return
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [open, refresh])

  async function act(action: 'open' | 'close' | 'cancel', monthNumber?: number) {
    setBusy(true)
    try {
      const res = await fetch('/api/chit/bidding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, groupId, monthNumber }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not do that', 'error'); return }

      if (action === 'open') {
        notify(`Bidding open for month ${monthNumber}`, 'success')
        setResult(null)
      } else if (action === 'close') {
        const w = body.winner as BidRow | null
        setResult(w
          ? { name: nameOf(w), amount: Number(w.amount), month: body.window.month_number, count: body.bidCount }
          : { name: '', amount: 0, month: body.window.month_number, count: 0 })
        notify(w ? `Bidding closed — highest ${inr(w.amount)}` : 'Bidding closed — no bids received')
      } else {
        notify('Bidding cancelled')
      }
      await refresh()
    } finally { setBusy(false) }
  }

  if (!loaded.current && !open) return null

  return (
    <div className="rounded-2xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Radio className="w-4 h-4" style={{ color: open ? 'var(--income)' : 'var(--text-faint)' }} />
          Online bidding
        </p>
        {open ? (
          <div className="flex items-center gap-2">
            <button onClick={() => act('close')} disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--brand)', color: 'white' }}>
              <Square className="w-3 h-3" /> Close bidding
            </button>
            <button
              onClick={async () => {
                if (await confirmDialog('Cancel this auction? Bids already placed are kept in the log but no winner is taken from them.')) act('cancel')
              }}
              disabled={busy}
              className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
        ) : nextMonth ? (
          <button onClick={() => act('open', nextMonth)} disabled={busy}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <Play className="w-3 h-3" /> Open bidding for month {nextMonth}
          </button>
        ) : null}
      </div>

      {open ? (
        <>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
            Month {open.month_number} · ceiling {inr(open.ceiling_amount)} · minimum raise {inr(open.min_increment)}
            {' · '}{bids.length} {bids.length === 1 ? 'bid' : 'bids'}
          </p>

          {bids.length === 0 ? (
            <p className="text-xs mt-3" style={{ color: 'var(--text-faint)' }}>
              No bids yet. Members with portal access can bid from their phones.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {bids.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate" style={{ color: i === 0 ? 'var(--text)' : 'var(--text-muted)', fontWeight: i === 0 ? 800 : 500 }}>
                    {i === 0 && <Trophy className="w-3 h-3 inline mr-1" style={{ color: '#b7791f' }} />}
                    {nameOf(b)}
                    {b.source === 'foreman' && <span style={{ color: 'var(--text-faint)' }}> · entered by you</span>}
                  </span>
                  <span className="shrink-0 font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {inr(b.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : result ? (
        <div className="mt-2.5 rounded-xl p-3" style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}>
          {result.amount > 0 ? (
            <>
              <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
                {result.name} — {inr(result.amount)}
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Highest of {result.count} {result.count === 1 ? 'bid' : 'bids'} for month {result.month}.
                Nothing has been recorded yet — use <b>Conduct auction</b> above and enter this
                winner and bid to write it to the books.
              </p>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Bidding closed for month {result.month} with no bids. Conduct the auction as usual.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
          Not running. Open it to let members bid from their phones during the auction.
        </p>
      )}
    </div>
  )
}
