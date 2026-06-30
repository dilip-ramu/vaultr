'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { PERIOD_LABEL, type PeriodKey } from '@/lib/budget-insights/period'

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

