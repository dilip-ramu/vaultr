'use client'

import { useState, useEffect, useMemo } from 'react'
import { refreshAllRates } from '@/lib/rates/refreshAll'
import { RefreshCw, Search, Info, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CURRENCIES } from '@/lib/currencies'

interface StoredRate {
  currency: string
  market_rate: number
  effective_from: string
  notes: string | null
}

interface CurrencyRow {
  code: string
  name: string
  symbol: string
  flag: string
  market_rate: number | null     // INR per 1 unit
  stored: StoredRate | null
}

interface Props {
  initialRates: StoredRate[]
}

export default function CurrenciesClient({ initialRates }: Props) {
  const [liveRates, setLiveRates] = useState<Record<string, number>>({})
  const [storedRates, setStoredRates] = useState<StoredRate[]>(initialRates)
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [editRow, setEditRow] = useState<CurrencyRow | null>(null)
  const [editRate, setEditRate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchRates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exchange-rates')
      const json = await res.json()
      if (json.rates) {
        setLiveRates(json.rates)
        setLastFetched(new Date())
        saveRatesToDB(json.rates)
      }
      // Same button, same promise as everywhere else: metals and stock prices
      // refresh too. Pressing "refresh" on ONE page and silently leaving the
      // other two stale is exactly how a stale number gets mistaken for a live one.
      refreshAllRates().catch(() => { /* the currency table above is already updated */ })
    } catch (e) {
      console.error('Failed to fetch rates', e)
    }
    setLoading(false)
  }

  const saveRatesToDB = async (rates: Record<string, number>) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const storedMap: Record<string, StoredRate> = {}
    storedRates.forEach(r => { storedMap[r.currency] = r })

    const upserts = Object.entries(rates).map(([currency, market_rate]) => ({
      user_id: user.id,
      currency,
      market_rate,
      effective_from: new Date().toISOString(),
      fetched_at: new Date().toISOString(),
      notes: storedMap[currency]?.notes ?? null,
    }))

    for (let i = 0; i < upserts.length; i += 50) {
      const { data } = await supabase
        .from('currency_rates')
        .insert(upserts.slice(i, i + 50))
        .select('currency, market_rate, effective_from, notes')
      if (data) {
        setStoredRates(prev => {
          const map: Record<string, StoredRate> = {}
          prev.forEach(r => { map[r.currency] = r })
          ;(data as StoredRate[]).forEach(r => { map[r.currency] = r })
          return Object.values(map)
        })
      }
    }
  }

  useEffect(() => { fetchRates() }, [])

  const rows = useMemo((): CurrencyRow[] => {
    const storedMap: Record<string, StoredRate> = {}
    storedRates.forEach(r => { storedMap[r.currency] = r })
    return CURRENCIES.map(c => {
      const stored = storedMap[c.code] ?? null
      return {
        ...c,
        market_rate: liveRates[c.code] ?? stored?.market_rate ?? null,
        stored,
      }
    })
  }, [liveRates, storedRates])

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.flag.includes(q)
    )
  }, [rows, search])

  const openEdit = (row: CurrencyRow) => {
    setEditRow(row)
    setEditRate(row.market_rate != null ? String(row.market_rate) : '')
    setEditNotes(row.stored?.notes ?? '')
  }

  const handleSaveOverride = async () => {
    if (!editRow) return
    const rate = parseFloat(editRate)
    if (Number.isNaN(rate) || rate <= 0) { setEditRow(null); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { data } = await supabase.from('currency_rates').insert({
      user_id: user.id,
      currency: editRow.code,
      market_rate: rate,
      effective_from: new Date().toISOString(),
      notes: editNotes.trim() || null,
    }).select('currency, market_rate, effective_from, notes').single()

    if (data) {
      setStoredRates(prev => [data as StoredRate, ...prev.filter(r => r.currency !== editRow.code)])
      // reflect the manual override immediately
      setLiveRates(prev => ({ ...prev, [editRow.code]: rate }))
    }
    setSaving(false)
    setEditRow(null)
  }

  return (
    <div className="w-full px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Currency Rates</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {lastFetched
              ? `Updated ${lastFetched.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : loading ? 'Fetching live rates…' : 'Rates vs ₹ INR'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInfo(!showInfo)}
            className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <Info className="w-4 h-4" />
          </button>
          <button onClick={fetchRates} disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="rounded-xl px-4 py-3 text-sm mb-4 space-y-1" style={{ background: 'var(--brand-light)', color: 'var(--text-muted)' }}>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>How rates work:</p>
          <p>The market rate (INR per 1 unit) is fetched live each day and used to convert any foreign-currency transaction.</p>
          <p>Tap a row to enter your own rate (e.g. your bank's). Applies to new transactions only — existing ones never change.</p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search currency…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
      </div>

      {/* Currency list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading && Object.keys(liveRates).length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" style={{ color: 'var(--brand)' }} />
            Fetching live rates…
          </div>
        ) : (
          <div>
            {filtered.map(row => (
              <button
                key={row.code}
                onClick={() => openEdit(row)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
                style={{ borderBottom: '1px solid var(--border-2)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{row.flag}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                      {row.code}
                      {row.stored?.notes && <span className="text-[10px] font-normal" style={{ color: 'var(--text-faint)' }}>· {row.stored.notes}</span>}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>{row.name}</p>
                  </div>
                </div>
                <p className="text-sm font-mono font-medium" style={{ color: 'var(--text)' }}>
                  {row.market_rate != null ? `₹${row.market_rate.toFixed(2)}` : '—'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs mt-4" style={{ color: 'var(--text-faint)' }}>
        {filtered.length} currencies · Tap to set your own rate
      </p>

      {/* Edit override modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setEditRow(null)} />
          <div className="relative w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-xl slide-up overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{editRow.flag}</span>
                <div>
                  <p className="font-bold" style={{ color: 'var(--text)' }}>{editRow.code}</p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{editRow.name}</p>
                </div>
              </div>
              <button onClick={() => setEditRow(null)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Rate (₹ per 1 {editRow.code})
                </label>
                <input
                  type="number" inputMode="decimal" value={editRate}
                  onChange={e => setEditRate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-mono"
                  style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes (optional)</label>
                <input
                  type="text" value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="e.g. HDFC forex rate"
                  className="w-full px-4 py-2.5 rounded-xl text-sm"
                  style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                />
              </div>

              <p className="text-xs rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                ⚡ Applies to new transactions from now. Existing transactions are unchanged.
              </p>

              <button onClick={handleSaveOverride} disabled={saving} className="btn-brand w-full font-semibold py-3 rounded-xl disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
