'use client'

import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, Info, X, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CURRENCIES, getCurrencyMeta } from '@/lib/currencies'

interface StoredRate {
  currency: string
  market_rate: number
  expended_rate: number | null
  billing_rate: number | null
  expended_pct: number | null
  billing_pct: number | null
  effective_from: string
  notes: string | null
}

interface CurrencyRow {
  code: string
  name: string
  symbol: string
  flag: string
  market_rate: number | null     // INR per 1 unit
  expended_rate: number | null
  billing_rate: number | null
  expended_pct: number           // default 5
  billing_pct: number            // default 5
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
  const [editExpPct, setEditExpPct] = useState('5')
  const [editBillPct, setEditBillPct] = useState('5')
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
        // Save to Supabase in background
        saveRatesToDB(json.rates)
      }
    } catch (e) {
      console.error('Failed to fetch rates', e)
    }
    setLoading(false)
  }

  const saveRatesToDB = async (rates: Record<string, number>) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().slice(0, 10)

    // Get existing stored rates for comparison
    const storedMap: Record<string, StoredRate> = {}
    storedRates.forEach(r => { storedMap[r.currency] = r })

    const upserts = Object.entries(rates).map(([currency, market_rate]) => {
      const existing = storedMap[currency]
      const expPct = existing?.expended_pct ?? 5
      const billPct = existing?.billing_pct ?? 5
      return {
        user_id: user.id,
        currency,
        market_rate,
        expended_rate: market_rate * (1 + expPct / 100),
        billing_rate: market_rate * (1 - billPct / 100),
        expended_pct: expPct,
        billing_pct: billPct,
        effective_from: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
        notes: existing?.notes ?? null,
      }
    })

    // Upsert in batches of 50
    for (let i = 0; i < upserts.length; i += 50) {
      const { data } = await supabase
        .from('currency_rates')
        .insert(upserts.slice(i, i + 50))
        .select()
      // Update stored rates state
      if (data) {
        setStoredRates(prev => {
          const map: Record<string, StoredRate> = {}
          prev.forEach(r => { map[r.currency] = r })
          data.forEach((r: StoredRate) => { map[r.currency] = r })
          return Object.values(map)
        })
      }
    }
  }

  useEffect(() => { fetchRates() }, [])

  // Merge live rates + stored overrides into display rows
  const rows = useMemo((): CurrencyRow[] => {
    const storedMap: Record<string, StoredRate> = {}
    storedRates.forEach(r => { storedMap[r.currency] = r })

    return CURRENCIES.map(c => {
      const stored = storedMap[c.code] ?? null
      const marketRate = liveRates[c.code] ?? stored?.market_rate ?? null
      const expPct = stored?.expended_pct ?? 5
      const billPct = stored?.billing_pct ?? 5
      return {
        ...c,
        market_rate: marketRate,
        expended_rate: marketRate ? marketRate * (1 + expPct / 100) : (stored?.expended_rate ?? null),
        billing_rate: marketRate ? marketRate * (1 - billPct / 100) : (stored?.billing_rate ?? null),
        expended_pct: expPct,
        billing_pct: billPct,
        stored,
      }
    })
  }, [liveRates, storedRates])

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.flag.includes(q)
    )
  }, [rows, search])

  const openEdit = (row: CurrencyRow) => {
    setEditRow(row)
    setEditExpPct(row.expended_pct.toString())
    setEditBillPct(row.billing_pct.toString())
    setEditNotes(row.stored?.notes ?? '')
  }

  const handleSaveOverride = async () => {
    if (!editRow) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const marketRate = editRow.market_rate ?? 0
    const expPct = parseFloat(editExpPct) || 5
    const billPct = parseFloat(editBillPct) || 5

    const { data } = await supabase.from('currency_rates').insert({
      user_id: user.id,
      currency: editRow.code,
      market_rate: marketRate,
      expended_rate: marketRate * (1 + expPct / 100),
      billing_rate: marketRate * (1 - billPct / 100),
      expended_pct: expPct,
      billing_pct: billPct,
      effective_from: new Date().toISOString(),
      notes: editNotes.trim() || null,
    }).select().single()

    if (data) {
      setStoredRates(prev => {
        const updated = prev.filter(r => r.currency !== editRow.code)
        return [data, ...updated]
      })
    }

    setSaving(false)
    setEditRow(null)
  }

  const fmt = (n: number | null) => n != null ? `₹${n.toFixed(2)}` : '—'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Currency Rates</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {lastFetched
              ? `Updated ${lastFetched.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : loading ? 'Fetching live rates…' : 'Rates vs ₹ INR'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInfo(!showInfo)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg">
            <Info className="w-4 h-4" />
          </button>
          <button onClick={fetchRates} disabled={loading}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700 mb-4 space-y-1">
          <p className="font-semibold">How rates work:</p>
          <p>• <strong>Market</strong> — live rate fetched automatically each day</p>
          <p>• <strong>Expended</strong> — market + 5% (your actual cost including bank markup). Used for <strong>expenses</strong>.</p>
          <p>• <strong>Billing</strong> — market − 5% (conservative rate for invoicing). Used for <strong>income</strong>.</p>
          <p className="text-blue-600 mt-1">Tap any row to customise the % for that currency. Applies to future transactions only.</p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search currency…"
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm"
        />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-4 gap-2 px-3 mb-1">
        <p className="col-span-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Currency</p>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">Market</p>
        <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide text-right">Expended</p>
        <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide text-right">Billing</p>
      </div>

      {/* Currency list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading && liveRates && Object.keys(liveRates).length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-400" />
            Fetching live rates…
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(row => (
              <button
                key={row.code}
                onClick={() => openEdit(row)}
                className="w-full grid grid-cols-4 gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{row.flag}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{row.code}</p>
                    <p className="text-[10px] text-gray-400 truncate">{row.name}</p>
                  </div>
                </div>
                <p className="text-xs font-mono text-gray-700 text-right">
                  {row.market_rate != null ? `₹${row.market_rate.toFixed(2)}` : '—'}
                </p>
                <p className="text-xs font-mono text-amber-700 text-right">
                  {row.expended_rate != null ? `₹${row.expended_rate.toFixed(2)}` : '—'}
                </p>
                <p className="text-xs font-mono text-green-700 text-right">
                  {row.billing_rate != null ? `₹${row.billing_rate.toFixed(2)}` : '—'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-300 mt-4">
        {filtered.length} currencies · Tap to customise %
      </p>

      {/* Edit override modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setEditRow(null)} />
          <div className="relative bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-xl slide-up overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{editRow.flag}</span>
                <div>
                  <p className="font-bold text-gray-900">{editRow.code}</p>
                  <p className="text-xs text-gray-400">{editRow.name}</p>
                </div>
              </div>
              <button onClick={() => setEditRow(null)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Live rate display */}
              {editRow.market_rate != null && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-xs text-gray-500">Live Market Rate</p>
                  <p className="font-mono font-bold text-gray-900">₹{editRow.market_rate.toFixed(4)}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-amber-600 mb-1.5">
                    Expended % above market
                  </label>
                  <div className="relative">
                    <input type="number" value={editExpPct} onChange={e => setEditExpPct(e.target.value)}
                      min="0" max="50" step="0.5"
                      className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm font-mono pr-7" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 text-sm">%</span>
                  </div>
                  {editRow.market_rate != null && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      = ₹{(editRow.market_rate * (1 + parseFloat(editExpPct || '0') / 100)).toFixed(2)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-green-600 mb-1.5">
                    Billing % below market
                  </label>
                  <div className="relative">
                    <input type="number" value={editBillPct} onChange={e => setEditBillPct(e.target.value)}
                      min="0" max="50" step="0.5"
                      className="w-full px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm font-mono pr-7" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">%</span>
                  </div>
                  {editRow.market_rate != null && (
                    <p className="text-[10px] text-green-600 mt-1">
                      = ₹{(editRow.market_rate * (1 - parseFloat(editBillPct || '0') / 100)).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes (optional)</label>
                <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  placeholder="e.g. HDFC forex rate"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              </div>

              <p className="text-xs text-gray-400 bg-amber-50 rounded-xl px-3 py-2">
                ⚡ Applies to new transactions from now. Existing transactions are unchanged.
              </p>

              <button onClick={handleSaveOverride} disabled={saving}
                className="w-full bg-brand-500 text-white font-semibold py-3 rounded-xl disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Custom Rates'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
