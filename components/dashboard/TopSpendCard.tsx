'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { PayeeRing, PayeeSlice } from './PayeeSpendRings'

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

// One donut sized to viewBox 36×36 using the "circumference = 100" trick
// (r = 15.9155) so each slice's percentage maps 1:1 to stroke-dasharray.
function Ring({ slices, total }: { slices: PayeeSlice[]; total: number }) {
  let offset = 0
  return (
    <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface-2)" strokeWidth="4" />
      {slices.map(slice => {
        const pct = total > 0 ? (slice.amount / total) * 100 : 0
        if (pct <= 0) return null
        const dash = `${pct.toFixed(3)} ${(100 - pct).toFixed(3)}`
        const dashOffset = -offset
        offset += pct
        return (
          <circle
            key={slice.categoryId}
            cx="18" cy="18" r="15.9155" fill="none"
            stroke={slice.color}
            strokeWidth="4"
            strokeDasharray={dash}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
          />
        )
      })}
    </svg>
  )
}

export default function TopSpendCard({ rings }: { rings: PayeeRing[] }) {
  const router = useRouter()

  // Default to the payee named "Dilip" if present, else the first ring.
  const defaultId = useMemo(() => {
    const dilip = rings.find(r => r.payeeName.trim().toLowerCase() === 'dilip')
    return dilip?.payeeId ?? rings[0]?.payeeId ?? ''
  }, [rings])

  const [payeeId, setPayeeId] = useState(defaultId)
  const ring = rings.find(r => r.payeeId === payeeId) ?? rings[0]

  // Drill-down window: this month, matching what the ring represents.
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const openTx = () => {
    if (!ring) return
    const p = ring.payeeId === '__none__' ? 'none' : ring.payeeId
    router.push(`/transactions?payee=${p}&from=${from}&to=${to}`)
  }

  return (
    <div className="rounded-2xl p-5 flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Top spend</p>
        {rings.length > 1 && (
          <select
            value={payeeId}
            onChange={e => setPayeeId(e.target.value)}
            className="text-xs font-semibold rounded-lg px-2 py-1 outline-none max-w-[9rem]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {rings.map(r => <option key={r.payeeId} value={r.payeeId}>{r.payeeName}</option>)}
          </select>
        )}
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>This month, coloured by category</p>

      {!ring ? (
        <p className="text-sm py-10 text-center flex-1" style={{ color: 'var(--text-muted)' }}>No payee spend this month</p>
      ) : (
        <>
          <button type="button" onClick={openTx} className="self-center relative mb-3" aria-label={`See ${ring.payeeName} transactions`}>
            <Ring slices={ring.slices} total={ring.total} />
            <span className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Total</span>
              <span className="text-base font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>₹{fmt(ring.total)}</span>
            </span>
          </button>
          <p className="text-center text-sm font-bold mb-2 truncate" style={{ color: 'var(--text)' }}>{ring.payeeName}</p>
          <div className="space-y-1">
            {ring.slices.slice(0, 5).map(s => (
              <div key={s.categoryId} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="truncate" style={{ color: 'var(--text-muted)' }} title={s.categoryName}>{s.categoryName}</span>
                </span>
                <span className="tabular-nums shrink-0 font-semibold" style={{ color: 'var(--text)' }}>₹{fmt(s.amount)}</span>
              </div>
            ))}
            {ring.slices.length > 5 && (
              <button onClick={openTx} className="flex items-center gap-0.5 text-[11px] font-medium pt-0.5" style={{ color: 'var(--brand)' }}>
                +{ring.slices.length - 5} more <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
