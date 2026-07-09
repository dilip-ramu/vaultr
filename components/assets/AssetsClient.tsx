'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Gem, Percent, TrendingUp, Map as MapIcon, Home, Upload } from 'lucide-react'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'
import { ASSET_CATEGORIES, categoryDef } from '@/lib/assets/types'
import { valueAsset, inrCompact, inr, pctStr, type Valuation } from '@/lib/assets/valuation'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'
import AssetForm from './AssetForm'
import AssetDetail from './AssetDetail'
import RatesTab from './RatesTab'
import MarketTab from './MarketTab'

type Tab = 'assets' | 'rates' | 'market'

interface Props {
  initialAssets: Asset[]
  marketRates: MarketRate[]
  initialDefaults: AssetRateDefault[]
}

export default function AssetsClient({ initialAssets, marketRates, initialDefaults }: Props) {
  const { hidden } = useBalanceVisibility()
  const m = (n: number) => hidden ? '••••' : inrCompact(n)
  const [assets, setAssets] = useState<Asset[]>(initialAssets)
  const [defaults, setDefaults] = useState<AssetRateDefault[]>(initialDefaults)
  const [tab, setTab] = useState<Tab>('assets')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [formFor, setFormFor] = useState<{ asset: Asset | null; category: string; subcategory: string } | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [detail, setDetail] = useState<Asset | null>(null)

  const valued = useMemo(() => {
    const m = new Map<string, Valuation>()
    for (const a of assets) m.set(a.id, valueAsset(a, marketRates, defaults))
    return m
  }, [assets, marketRates, defaults])

  const totals = useMemo(() => {
    let cost = 0, current = 0
    for (const a of assets) {
      if (!a.include_in_net_worth) continue
      const v = valued.get(a.id)!
      cost += v.cost; current += v.current
    }
    return { cost, current, gain: current - cost, ret: cost > 0 ? (current - cost) / cost : 0 }
  }, [assets, valued])

  // group: category -> subcategory -> assets
  const grouped = useMemo(() => {
    const cats = ASSET_CATEGORIES.filter(c => (catFilter === 'all' ? true : c.key === catFilter))
      .map(c => {
        const list = assets.filter(a => a.category === c.key)
        if (list.length === 0) return null
        const subs = new Map<string, Asset[]>()
        for (const a of list) {
          const k = a.subcategory ?? '—'
          if (!subs.has(k)) subs.set(k, [])
          subs.get(k)!.push(a)
        }
        let cCost = 0, cCur = 0
        for (const a of list) { const v = valued.get(a.id)!; cCost += v.cost; cCur += v.current }
        return { cat: c, subs, cCost, cCur, cGain: cCur - cCost }
      }).filter(Boolean) as { cat: typeof ASSET_CATEGORIES[number]; subs: Map<string, Asset[]>; cCost: number; cCur: number; cGain: number }[]
    return cats
  }, [assets, valued, catFilter])

  const marketRateFor = (metal: string) => {
    const r = marketRates.filter(x => x.metal === metal).sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1))[0]
    return r?.rate_per_gram
  }

  const onSaved = (a: Asset) => {
    setAssets(prev => prev.some(x => x.id === a.id) ? prev.map(x => x.id === a.id ? a : x) : [...prev, a])
    setFormFor(null)
  }
  const onDeleted = (id: string) => { setAssets(prev => prev.filter(a => a.id !== id)); setDetail(null) }

  const catCount = new Set(assets.map(a => a.category)).size

  const RowIcon = ({ a }: { a: Asset }) => {
    const em = (a.details as { emoji?: string }).emoji
    if (a.category === 'real_estate') {
      const Icon = a.subcategory === 'building' ? Home : MapIcon
      return <div style={{ width: 38, height: 38, borderRadius: 11, background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon className="w-[18px] h-[18px]" /></div>
    }
    const bg = a.category === 'electronics' ? 'var(--surface-2)' : 'color-mix(in srgb, var(--amber) 16%, transparent)'
    return <div style={{ width: 38, height: 38, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{em || categoryDef(a.category)?.emoji || '📦'}</div>
  }

  return (
    <div className="w-full px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Assets</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {tab === 'assets' ? `${assets.length} asset${assets.length !== 1 ? 's' : ''} across ${catCount} categor${catCount !== 1 ? 'ies' : 'y'}`
              : tab === 'rates' ? "Default rates used when an asset doesn't override"
              : 'Market rates that drive live valuations'}
          </p>
        </div>
        {tab === 'assets' && (
          <div className="flex items-center gap-2">
            <Link href="/assets/import" className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <Upload className="w-4 h-4" /> Import
            </Link>
            <button onClick={() => setShowPicker(true)} className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}>
              <Plus className="w-4 h-4" /> Add asset
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-0.5 p-1 rounded-xl mb-5" style={{ background: 'var(--surface-2)' }}>
        {([['assets', 'Assets', Gem], ['rates', 'Rates', Percent], ['market', 'Market rates', TrendingUp]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-1.5 rounded-lg"
            style={tab === k ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' } : { color: 'var(--text-muted)' }}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'rates' && <RatesTab defaults={defaults} setDefaults={setDefaults} />}
      {tab === 'market' && <MarketTab rates={marketRates} />}

      {tab === 'assets' && (assets.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <p className="text-4xl mb-2">💎</p>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No assets yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add real estate, gold, electronics and more to complete your net worth.</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button onClick={() => setShowPicker(true)} className="text-sm font-bold" style={{ color: 'var(--brand)' }}>+ Add your first asset</button>
            <Link href="/assets/import" className="text-sm font-bold" style={{ color: 'var(--brand)' }}>Import a spreadsheet</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Hero band */}
          <div className="rounded-3xl px-6 py-5 flex flex-wrap items-center gap-y-4 mb-5" style={{ background: 'linear-gradient(135deg, var(--brand-deep, #14432D), color-mix(in srgb, var(--brand-deep, #14432D) 72%, #000))' }}>
            <div style={{ flex: '1.3 1 200px' }}>
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.6)' }}>CURRENT VALUE</p>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#9DE8B8', background: 'rgba(127,217,164,.16)' }}>IN NET WORTH</span>
              </div>
              <p className="text-[34px] font-extrabold leading-none mt-1.5" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{m(totals.current)}</p>
            </div>
            <div className="hidden sm:block" style={{ width: 1, height: 52, background: 'rgba(255,255,255,.15)' }} />
            <div style={{ flex: '1 1 120px', paddingLeft: 22 }}>
              <p className="text-[10px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.55)' }}>COST BASIS</p>
              <p className="text-xl font-extrabold mt-0.5" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{m(totals.cost)}</p>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <p className="text-[10px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.55)' }}>UNREALISED GAIN</p>
              <p className="text-xl font-extrabold mt-0.5" style={{ color: totals.gain >= 0 ? '#9DE8B8' : '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••••' : `${totals.gain >= 0 ? '+' : ''}${inrCompact(totals.gain)}`}</p>
            </div>
            <div style={{ flex: '1 1 90px' }}>
              <p className="text-[10px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.55)' }}>RETURN</p>
              <p className="text-xl font-extrabold mt-0.5" style={{ color: totals.ret >= 0 ? '#9DE8B8' : '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••' : pctStr(totals.ret)}</p>
            </div>
          </div>

          {/* Category chips */}
          <div className="flex gap-2 mb-5 flex-wrap">
            <button onClick={() => setCatFilter('all')} className="text-[11.5px] font-bold px-3.5 py-1.5 rounded-xl"
              style={catFilter === 'all' ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>All</button>
            {ASSET_CATEGORIES.filter(c => assets.some(a => a.category === c.key)).map(c => (
              <button key={c.key} onClick={() => setCatFilter(c.key)} className="text-[11.5px] font-semibold px-3.5 py-1.5 rounded-xl"
                style={catFilter === c.key ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{c.emoji} {c.label}</button>
            ))}
          </div>

          {/* Grouped categories */}
          {grouped.map(({ cat, subs, cCur, cGain }) => (
            <div key={cat.key} className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{cat.emoji}</span>
                  <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{cat.label}</h2>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-faint)' }}>
                    · {cat.blurb}{cat.valuation === 'market' && marketRateFor(cat.key === 'gold' ? 'gold' : 'silver') ? ` · ₹${marketRateFor(cat.key === 'gold' ? 'gold' : 'silver')!.toLocaleString('en-IN')}/g` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3.5">
                  <span className="text-xs font-bold" style={{ color: cGain >= 0 ? 'var(--income)' : 'var(--expense)', fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••••' : `${cGain >= 0 ? '+' : ''}${inrCompact(cGain)}`}</span>
                  <span className="text-sm font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{m(cCur)}</span>
                </div>
              </div>

              {[...subs.entries()].map(([subKey, list]) => {
                const subLabel = cat.subcategories.find(s => s.key === subKey)?.label ?? subKey
                const subTotal = list.reduce((s, a) => s + valued.get(a.id)!.current, 0)
                const rateNote = cat.key === 'real_estate' && subKey === 'land' ? ' · avg' : ''
                return (
                  <div key={subKey} className="rounded-2xl overflow-hidden mb-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <span className="text-[11px] font-extrabold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>{subLabel}{rateNote}{subKey === 'building' ? ' · land ↑ / structure ↓' : ''}</span>
                      <span className="text-[11.5px] font-bold" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{m(subTotal)}</span>
                    </div>
                    {list.map((a, i) => {
                      const v = valued.get(a.id)!
                      return (
                        <button key={a.id} onClick={() => setDetail(a)} className="w-full text-left grid items-center px-4 py-3" style={{ gridTemplateColumns: '1.8fr 1fr 1fr auto', borderBottom: i < list.length - 1 ? '1px solid var(--border-2, var(--border))' : 'none' }}>
                          <div className="flex items-center gap-3">
                            <RowIcon a={a} />
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>{a.name}</p>
                              <p className="text-[10.5px] truncate" style={{ color: 'var(--text-faint)' }}>{subLabelHint(a)}</p>
                            </div>
                          </div>
                          <div><p className="text-[9px] font-bold" style={{ color: 'var(--text-faint)' }}>COST</p><p className="text-[12.5px]" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{m(v.cost)}</p></div>
                          <div><p className="text-[9px] font-bold" style={{ color: 'var(--text-faint)' }}>CURRENT</p><p className="text-[13px] font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{m(v.current)}</p></div>
                          <div className="text-right">
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: v.gain >= 0 ? 'var(--income)' : 'var(--expense)', background: v.gain >= 0 ? 'color-mix(in srgb, var(--income) 12%, transparent)' : 'color-mix(in srgb, var(--expense) 10%, transparent)' }}>{pctStr(v.returnPct)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </>
      ))}

      {/* Category picker → form */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowPicker(false)} />
          <div className="relative bg-[var(--surface)] w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up">
            <p className="text-base font-extrabold mb-4" style={{ color: 'var(--text)' }}>What are you adding?</p>
            <div className="grid grid-cols-2 gap-2.5">
              {ASSET_CATEGORIES.flatMap(c => c.subcategories.map(s => ({ c, s }))).map(({ c, s }) => (
                <button key={c.key + s.key} onClick={() => { setShowPicker(false); setFormFor({ asset: null, category: c.key, subcategory: s.key }) }}
                  className="flex items-center gap-2.5 p-3 rounded-xl text-left" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span className="text-lg">{c.emoji}</span>
                  <div><p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{s.label}</p><p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{c.label}</p></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {formFor && (
        <AssetForm asset={formFor.asset} category={formFor.category} subcategory={formFor.subcategory}
          marketRates={marketRates} defaults={defaults} onSaved={onSaved} onClose={() => setFormFor(null)} />
      )}

      {detail && (
        <AssetDetail asset={detail} valuation={valued.get(detail.id)!} marketRates={marketRates} defaults={defaults}
          onEdit={() => { setFormFor({ asset: detail, category: detail.category, subcategory: detail.subcategory ?? '' }); setDetail(null) }}
          onDeleted={onDeleted} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

function subLabelHint(a: Asset): string {
  if (a.category === 'gold' || a.category === 'silver') {
    const d = a.details as { purity?: string }
    return `${d.purity ? d.purity + ' · ' : ''}${a.quantity_g ?? 0}g`
  }
  if (a.category === 'real_estate' && a.subcategory === 'land') {
    const d = a.details as { area_cent?: number }
    return `${d.area_cent ?? '?'} cent${a.purchase_date ? ' · ' + fmtMon(a.purchase_date) : ''}`
  }
  return a.purchase_date ? 'Bought ' + fmtMon(a.purchase_date) : ''
}
function fmtMon(d: string): string {
  const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}
