'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'

export type PeriodKey = 'this_month' | 'last_month' | '3m' | '6m' | 'this_year' | 'all' | 'custom'

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  this_year: 'This year',
  all: 'All time',
  custom: 'Custom range',
}

export default function PeriodSelector() {
  const router = useRouter()
  const params = useSearchParams()
  const period = (params.get('period') as PeriodKey | null) ?? 'this_month'
  const fromParam = params.get('from') ?? ''
  const toParam = params.get('to') ?? ''

  const [from, setFrom] = useState(fromParam)
  const [to, setTo]     = useState(toParam)

  useEffect(() => { setFrom(fromParam); setTo(toParam) }, [fromParam, toParam])

  function update(next: { period?: PeriodKey; from?: string; to?: string }) {
    const sp = new URLSearchParams(params.toString())
    if (next.period !== undefined)  sp.set('period', next.period)
    if (next.from   !== undefined) { if (next.from) sp.set('from', next.from); else sp.delete('from') }
    if (next.to     !== undefined) { if (next.to)   sp.set('to',   next.to);   else sp.delete('to') }
    if ((next.period ?? period) !== 'custom') { sp.delete('from'); sp.delete('to') }
    router.replace(`?${sp.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={period}
        onChange={e => update({ period: e.target.value as PeriodKey })}
        className="px-3 py-2 rounded-xl border text-sm outline-none"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map(p => (
          <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
        ))}
      </select>
      {period === 'custom' && (
        <>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); update({ from: e.target.value }) }}
            className="px-3 py-2 rounded-xl border text-sm outline-none"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); update({ to: e.target.value }) }}
            className="px-3 py-2 rounded-xl border text-sm outline-none"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </>
      )}
    </div>
  )
}

// Shared period→bounds helper used by both client + server.
export function bounds(period: PeriodKey, customFrom: string | null, customTo: string | null, today = new Date()):
    { from: string; to: string; label: string; months: number } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const y = today.getFullYear()
  const m = today.getMonth()
  const todayStr = fmt(today)
  if (period === 'all') {
    // 5 years back as a practical "all" window — wide enough for any user.
    return { from: fmt(new Date(y - 5, 0, 1)), to: todayStr, label: 'All time', months: 60 }
  }
  if (period === 'this_month')  return { from: fmt(new Date(y, m, 1)),     to: fmt(new Date(y, m + 1, 0)), label: PERIOD_LABEL.this_month, months: 1 }
  if (period === 'last_month')  return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)),     label: PERIOD_LABEL.last_month, months: 1 }
  if (period === '3m')          return { from: fmt(new Date(y, m - 2, 1)), to: fmt(new Date(y, m + 1, 0)), label: PERIOD_LABEL['3m'],       months: 3 }
  if (period === '6m')          return { from: fmt(new Date(y, m - 5, 1)), to: fmt(new Date(y, m + 1, 0)), label: PERIOD_LABEL['6m'],       months: 6 }
  if (period === 'this_year')   return { from: fmt(new Date(y, 0, 1)),     to: fmt(new Date(y, 11, 31)),   label: `${y}`,                    months: 12 }
  // custom
  const f = customFrom || fmt(new Date(y, m, 1))
  const t = customTo   || todayStr
  const fd = new Date(f), td = new Date(t)
  const ms = Math.max(1, (td.getFullYear() - fd.getFullYear()) * 12 + (td.getMonth() - fd.getMonth()) + 1)
  return { from: f, to: t, label: `${f} → ${t}`, months: ms }
}
