'use client'

import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'

export type PayeeSlice = {
  categoryId: string
  categoryName: string
  color: string
  amount: number
}

export type PayeeRing = {
  payeeId: string
  payeeName: string
  total: number
  slices: PayeeSlice[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

// One donut, sized to viewBox 36×36.
// Uses the stroke-dasharray "100-unit circumference" trick: r = 15.9155 makes
// the circumference equal exactly 100, so each slice's percentage maps 1:1 to
// stroke-dasharray length without trigonometry.
function Ring({ slices, total }: { slices: PayeeSlice[]; total: number }) {
  let offset = 0
  return (
    <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
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
            strokeWidth="3.5"
            strokeDasharray={dash}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
          />
        )
      })}
    </svg>
  )
}

export default function PayeeSpendRings({ rings }: { rings: PayeeRing[] }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Spend by Payee</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>This month, coloured by category</p>
        </div>
        <Link href="/transactions" className="flex items-center gap-0.5 text-xs font-medium" style={{ color: 'var(--brand)' }}>
          All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {rings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Users className="w-6 h-6" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No payee spend recorded this month</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-5">
          {rings.map(ring => (
            <div key={ring.payeeId} className="flex flex-col items-center text-center min-w-0">
              <div className="relative">
                <Ring slices={ring.slices} total={ring.total} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Total</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>₹{fmt(ring.total)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold truncate w-full" style={{ color: 'var(--text)' }} title={ring.payeeName}>
                {ring.payeeName}
              </p>
              <div className="mt-1 space-y-0.5 w-full">
                {ring.slices.slice(0, 3).map(s => (
                  <div key={s.categoryId} className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="truncate" style={{ color: 'var(--text-muted)' }} title={s.categoryName}>{s.categoryName}</span>
                    </span>
                    <span className="tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>₹{fmt(s.amount)}</span>
                  </div>
                ))}
                {ring.slices.length > 3 && (
                  <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>+{ring.slices.length - 3} more</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
