'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import type { MarketRate } from '@/lib/assets/types'

interface Props { rates: MarketRate[] }

// Only the pure baselines are fetched; other purities are derived in-app.
const SERIES = [
  { metal: 'gold', purity: '24K', label: 'Gold', sub: '24K · pure', emoji: '🥇' },
  { metal: 'silver', purity: null as string | null, label: 'Silver', sub: '.999 · fine', emoji: '🥈' },
]
const DERIVED: { label: string; metal: string; frac: number }[] = [
  { label: 'Gold 22K', metal: 'gold', frac: 22 / 24 },
  { label: 'Gold 18K', metal: 'gold', frac: 18 / 24 },
  { label: 'Gold 14K', metal: 'gold', frac: 14 / 24 },
  { label: 'Silver 925', metal: 'silver', frac: 0.925 },
  { label: 'Silver 900', metal: 'silver', frac: 0.9 },
]

export default function MarketTab({ rates }: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState('')

  const dates = useMemo(() => Array.from(new Set(rates.map(r => r.rate_date))).sort((a, b) => (a < b ? 1 : -1)), [rates])
  const rateAt = (metal: string, purity: string | null, date: string) =>
    rates.find(r => r.metal === metal && r.purity === purity && r.rate_date === date)?.rate_per_gram

  const latest = (metal: string, purity: string | null) => {
    for (const d of dates) { const v = rateAt(metal, purity, d); if (v != null) return { v, d } }
    return null
  }
  const prev = (metal: string, purity: string | null, afterDate: string) => {
    let seen = false
    for (const d of dates) { if (d === afterDate) { seen = true; continue } if (seen) { const v = rateAt(metal, purity, d); if (v != null) return v } }
    return null
  }

  const router = useRouter()
  const refresh = async () => {
    setRefreshing(true); setMsg('')
    try {
      const res = await fetch('/api/assets/refresh-rates', { method: 'POST' })
      const j = await res.json().catch(() => ({} as { ok?: boolean; stored?: number; reason?: string }))
      if (res.ok && j.ok) {
        setMsg(`Fetched ${j.stored ?? 0} rate${j.stored === 1 ? '' : 's'}.`)
        router.refresh()
      } else {
        setMsg(j.reason ? `Couldn’t fetch: ${j.reason}` : `Couldn’t fetch (HTTP ${res.status}).`)
      }
    } catch (e) { setMsg(`Couldn’t fetch: ${e instanceof Error ? e.message : 'network error'}`) }
    setRefreshing(false)
  }

  return (
    <div className="max-w-[820px]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Fetched automatically once a day from GoodReturns (Tirupur), like exchange rates. Live valuations use the latest stored rate.</p>
        <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {msg && <p className="text-[12px] mb-3" style={{ color: 'var(--brand)' }}>{msg}</p>}

      {/* rate cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {SERIES.map(s => {
          const l = latest(s.metal, s.purity)
          const delta = l ? (() => { const p = prev(s.metal, s.purity, l.d); return p == null ? null : l.v - p })() : null
          return (
            <div key={s.metal + s.sub} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2"><span className="text-lg">{s.emoji}</span><div><p className="text-[13px] font-extrabold" style={{ color: 'var(--text)' }}>{s.label}</p><p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{s.sub}</p></div></div>
              <p className="text-[22px] font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{l ? `₹${l.v.toLocaleString('en-IN')}` : '—'}<span className="text-[12px] font-semibold" style={{ color: 'var(--text-faint)' }}>/g</span></p>
              {delta != null && <p className="text-[11px] font-bold mt-0.5" style={{ color: delta >= 0 ? 'var(--income)' : 'var(--expense)' }}>{delta >= 0 ? '▲ +' : '▼ '}₹{Math.abs(delta).toLocaleString('en-IN')} today</p>}
            </div>
          )
        })}
      </div>

      {/* Derived purities — computed in-app from the pure rate */}
      <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-[11px] font-extrabold tracking-wide mb-2.5" style={{ color: 'var(--text-muted)' }}>DERIVED PURITIES <span className="font-semibold" style={{ color: 'var(--text-faint)' }}>· computed in-app · any karat / % supported</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {DERIVED.map(dv => {
            const base = latest(dv.metal, dv.metal === 'gold' ? '24K' : null)
            const v = base ? Math.round(base.v * dv.frac) : null
            return (
              <div key={dv.label} className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{dv.label}</p>
                <p className="text-[13px] font-extrabold mt-0.5" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v ? `₹${v.toLocaleString('en-IN')}` : '—'}<span className="text-[10px] font-semibold" style={{ color: 'var(--text-faint)' }}>/g</span></p>
              </div>
            )
          })}
        </div>
      </div>

      {/* history table */}
      {dates.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="grid px-4 py-2.5" style={{ gridTemplateColumns: '1.4fr 1fr 1fr', background: 'var(--surface-2)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--text-faint)' }}>
            <span>DATE</span><span className="text-right">GOLD 24K</span><span className="text-right">SILVER .999</span>
          </div>
          {dates.slice(0, 12).map((d, i) => (
            <div key={d} className="grid px-4 py-2.5 items-center" style={{ gridTemplateColumns: '1.4fr 1fr 1fr', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span className="text-[12px]" style={{ color: 'var(--text)' }}>{new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
              <span className="text-[12px] text-right" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(rateAt('gold', '24K', d))}</span>
              <span className="text-[12px] text-right" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(rateAt('silver', null, d))}</span>
            </div>
          ))}
        </div>
      )}
      {dates.length === 0 && (
        <div className="text-center py-10 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>No market rates yet</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--text-faint)' }}>The daily job stores gold &amp; silver prices each morning. Tap Refresh to fetch now.</p>
        </div>
      )}
    </div>
  )
}

function fmt(v: number | undefined) { return v == null ? '—' : `₹${v.toLocaleString('en-IN')}` }
