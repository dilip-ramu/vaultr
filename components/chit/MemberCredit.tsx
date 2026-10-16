'use client'

// A member's spare money, and moving it to whichever of their chits suits.
//
// Credit happens when somebody hands over more than they owed. It belongs to
// the PERSON, not to the chit it landed in — so if they are in three chits, the
// extra should be usable against any of them. Once, and against the one chosen
// here, rather than the app quietly taking it off whichever chit happens to be
// listed first.
//
// What the screen will not do:
//
//   • It will not net a credit in one chit against arrears in another. Being
//     ₹1,400 ahead in one and ₹18,600 behind in another is two facts, and
//     showing only the difference hides both.
//   • It will not pick a source for you. A move names the chit the money comes
//     out of, because that chit's own figures change when it leaves.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Wallet } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { inr } from '@/lib/assets/valuation'
import type { CreditPool, GroupPosition } from '@/lib/chit/memberLedger'

export default function MemberCredit({ memberId }: { memberId: string }) {
  const router = useRouter()
  const [pool, setPool] = useState<CreditPool | null>(null)
  const [positions, setPositions] = useState<GroupPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [month, setMonth] = useState('')
  const [amount, setAmount] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chit/credit?memberId=${encodeURIComponent(memberId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      setPool(body.pool ?? null)
      setPositions(body.positions ?? [])
    } finally { setLoading(false) }
  }, [memberId])

  useEffect(() => { load() }, [load])

  async function move() {
    setBusy(true)
    try {
      const res = await fetch('/api/chit/credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId, fromGroupId: from, toGroupId: to,
          toMonth: parseInt(month) || 0, amount: Number(amount) || 0,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not move it', 'error'); return }
      notify(`${inr(Number(amount))} moved`)
      setAmount(''); setMonth('')
      await load()
      router.refresh()
    } finally { setBusy(false) }
  }

  if (loading || !pool) return null
  if (pool.available === 0 && pool.owing === 0) return null

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const fld = 'px-2.5 py-2 rounded-lg text-[12.5px] font-bold outline-none'
  const fs = { border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }

  return (
    <div className="rounded-2xl p-4" style={card}>
      <p className="text-[11px] uppercase tracking-wide font-extrabold inline-flex items-center gap-1.5"
        style={{ color: 'var(--text-faint)' }}>
        <Wallet className="w-3.5 h-3.5" /> Credit and arrears
      </p>

      <div className="flex flex-wrap gap-x-8 gap-y-2 mt-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            Paid in advance
          </p>
          <p className="text-lg font-extrabold" style={{ color: pool.available > 0 ? 'var(--income)' : 'var(--text-faint)' }}>
            {inr(pool.available)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            Still owing
          </p>
          <p className="text-lg font-extrabold" style={{ color: pool.owing > 0 ? 'var(--expense)' : 'var(--text-faint)' }}>
            {inr(pool.owing)}
          </p>
        </div>
      </div>

      {pool.available > 0 && pool.owing > 0 && (
        <p className="text-[11.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          These are shown separately on purpose. One does not cancel the other until
          you move it.
        </p>
      )}

      {/* Where each chit stands, so the choice below is an informed one. */}
      <div className="mt-3 space-y-1">
        {positions.map(p => (
          <div key={p.groupId} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="truncate" style={{ color: 'var(--text-muted)' }}>{p.groupName}</span>
            <span className="shrink-0 font-bold"
              style={{ color: p.balance > 0 ? 'var(--income)' : p.balance < 0 ? 'var(--expense)' : 'var(--text-faint)' }}>
              {p.balance === 0 ? 'settled' : p.balance > 0 ? `${inr(p.balance)} ahead` : `${inr(-p.balance)} behind`}
            </span>
          </div>
        ))}
      </div>

      {pool.available > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--border)' }}>
          <p className="text-[11px] font-extrabold mb-2" style={{ color: 'var(--text-faint)' }}>
            Move credit to another chit
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={from} onChange={e => setFrom(e.target.value)} className={fld} style={fs}>
              <option value="">From…</option>
              {pool.from.map(f => (
                <option key={f.groupId} value={f.groupId}>{f.groupName} ({inr(f.amount)})</option>
              ))}
            </select>
            <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
            <select value={to} onChange={e => setTo(e.target.value)} className={fld} style={fs}>
              <option value="">To…</option>
              {positions.filter(p => p.groupId !== from).map(p => (
                <option key={p.groupId} value={p.groupId}>{p.groupName}</option>
              ))}
            </select>
            <input value={month} inputMode="numeric" placeholder="Month"
              onChange={e => setMonth(e.target.value.replace(/[^\d]/g, ''))}
              className={`${fld} w-20`} style={fs} />
            <input value={amount} inputMode="numeric" placeholder="Amount"
              onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              className={`${fld} w-24`} style={fs} />
            <button onClick={move} disabled={busy || !from || !to || !month || !amount}
              className="text-white text-[12.5px] font-bold px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--brand)' }}>
              {busy ? 'Moving…' : 'Move'}
            </button>
          </div>
          <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            The month is the one in the receiving chit the credit pays towards. The chit it
            comes out of stops counting it, so the same money cannot be used twice.
          </p>
        </div>
      )}
    </div>
  )
}
