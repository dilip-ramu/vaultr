'use client'

import { useEffect, useState } from 'react'

export type PeriodValue = 'month' | 'quarter' | 'year' | 'custom'

/**
 * The single, canonical period filter — Month · Quarter · Year · Custom —
 * styled exactly like the Dashboard's period toggle. Presentational: the
 * parent owns the value and decides what a change means (navigate a URL,
 * set local state, refetch, …), so it works on both URL-driven pages
 * (Budgets & Insights) and client-state pages (Profitability).
 */
export default function PeriodPills({
  value,
  onChange,
  customFrom = '',
  customTo = '',
  onApplyCustom,
}: {
  value: PeriodValue
  onChange: (p: Exclude<PeriodValue, 'custom'>) => void
  customFrom?: string
  customTo?: string
  onApplyCustom?: (from: string, to: string) => void
}) {
  const [showCustom, setShowCustom] = useState(value === 'custom')
  const [from, setFrom] = useState(customFrom)
  const [to, setTo]     = useState(customTo)

  useEffect(() => { setShowCustom(value === 'custom') }, [value])
  useEffect(() => { setFrom(customFrom); setTo(customTo) }, [customFrom, customTo])

  const pill = (active: boolean) =>
    ({
      ...(active
        ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' }
        : { color: 'var(--text-muted)' }),
    }) as const

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
        {(['month', 'quarter', 'year'] as const).map(p => (
          <button
            key={p}
            onClick={() => { setShowCustom(false); onChange(p) }}
            className="text-[12.5px] font-bold px-3 py-1.5 rounded-lg transition-colors capitalize"
            style={pill(value === p)}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(s => !s)}
          className="text-[12.5px] font-bold px-3 py-1.5 rounded-lg transition-colors"
          style={pill(value === 'custom')}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>From</p>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>To</p>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <button
            onClick={() => from && to && onApplyCustom?.(from, to)}
            className="text-white text-sm font-bold px-4 py-2 rounded-lg"
            style={{ background: 'var(--brand)' }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
