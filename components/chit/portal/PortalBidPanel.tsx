'use client'

// The live auction, on a member's phone.
//
// This is an OPEN auction, so the standing bid is on screen and updates while
// they watch. Two things it deliberately does NOT do:
//
//   • It never shows who is leading, only whether it is you. The auction needs
//     the number, not a monthly record of who could afford what.
//   • It never counts down. The organiser closes bidding by hand, so a timer
//     would be a promise the system cannot keep. It says so plainly instead.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, inr } from './shared'
import type { PortalLiveAuction } from '@/lib/chit/portal-data'

const POLL_MS = 4000

export default function PortalBidPanel({
  groupId, initial,
}: { groupId: string; initial: PortalLiveAuction | null }) {
  const [auction, setAuction] = useState(initial)
  const [amount, setAmount] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // While the member is typing we still poll, but we never overwrite what they
  // have typed — losing a half-entered bid to a background refresh would be
  // infuriating at exactly the wrong moment.
  const busyRef = useRef(false)
  busyRef.current = busy

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/auction?groupId=${encodeURIComponent(groupId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      if (!busyRef.current) setAuction(body.auction)
    } catch { /* a dropped poll is not worth showing anyone */ }
  }, [groupId])

  useEffect(() => {
    if (!auction || auction.status !== 'open') return
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [auction, refresh])

  if (!auction || auction.status !== 'open') return null

  const min = auction.minimumNext
  const suggested = min != null ? String(min) : ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setFlash(null); setBusy(true)
    try {
      const res = await fetch('/api/portal/bid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupId, amount: Number(amount), pin }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body?.error ?? 'Your bid was not accepted.'); return }
      setAuction(body.auction)
      setAmount(''); setPin('')
      setFlash(body.youAreLeading
        ? `Bid of ${inr(body.amount)} placed — you are leading.`
        : `Bid of ${inr(body.amount)} placed, but someone is already higher.`)
    } finally {
      setBusy(false)
    }
  }

  const field = {
    background: 'var(--surface-2, var(--bg))',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }

  return (
    <Card className="p-4" >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-extrabold">Bidding is open — month {auction.monthNumber}</p>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide"
          style={{ color: 'var(--income)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--income)' }} />
          Live
        </span>
      </div>

      <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--surface-2, var(--bg))' }}>
        <p className="text-[11px] uppercase tracking-wide font-extrabold" style={{ color: 'var(--text-faint)' }}>
          Highest bid so far
        </p>
        <p className="text-2xl font-extrabold mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {auction.highestAmount == null ? 'No bids yet' : inr(auction.highestAmount)}
        </p>
        <p className="text-[11.5px] mt-1" style={{ color: auction.youAreLeading ? 'var(--income)' : 'var(--text-muted)' }}>
          {auction.youAreLeading
            ? 'You are leading.'
            : auction.yourBestBid != null
              ? `Your highest bid was ${inr(auction.yourBestBid)}.`
              : `${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'} placed.`}
        </p>
      </div>

      {!auction.canBid ? (
        <p className="text-[12.5px] mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {auction.blockedReason}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2.5">
          <div>
            <label className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
              Your bid (the discount you give up)
            </label>
            <input
              inputMode="numeric" value={amount} placeholder={suggested}
              onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              className="w-full mt-1 px-3 py-3 rounded-xl border text-lg font-bold outline-none"
              style={{ ...field, fontVariantNumeric: 'tabular-nums' }}
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
              At least {min != null ? inr(min) : '—'} · ceiling {inr(auction.ceilingAmount)}
            </p>
          </div>

          <div>
            <label className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>Your PIN</label>
            <input
              type="password" inputMode="numeric" maxLength={4} value={pin} autoComplete="off"
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full mt-1 px-3 py-3 rounded-xl border text-lg tracking-[0.5em] outline-none"
              style={field}
            />
          </div>

          {error && <p className="text-[12.5px]" style={{ color: 'var(--expense)' }}>{error}</p>}
          {flash && <p className="text-[12.5px]" style={{ color: 'var(--income)' }}>{flash}</p>}

          <button type="submit" disabled={busy || !amount || pin.length !== 4}
            className="w-full py-3 rounded-xl text-[13.5px] font-extrabold disabled:opacity-50"
            style={{ background: 'var(--brand)', color: 'white' }}>
            {busy ? 'Placing…' : 'Place bid'}
          </button>
        </form>
      )}

      <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        Bidding stays open until the organiser closes it — there is no timer.
        A bid cannot be taken back, so bid the amount you mean. The result is
        published here once the organiser has recorded the auction.
      </p>
    </Card>
  )
}
