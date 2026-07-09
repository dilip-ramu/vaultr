'use client'

import { useState } from 'react'
import { X, Pencil, Trash2, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import type { Asset, MarketRate } from '@/lib/assets/types'
import { categoryDef } from '@/lib/assets/types'
import { inr, pctStr, valueSeries, type Valuation } from '@/lib/assets/valuation'
import type { AssetRateDefault } from '@/lib/assets/types'

interface Props {
  asset: Asset
  valuation: Valuation
  marketRates: MarketRate[]
  defaults?: AssetRateDefault[]
  fx?: number
  onEdit: () => void
  onDeleted: (id: string) => void
  onClose: () => void
}

const GOLD_GRAD = 'linear-gradient(150deg,#8A6D1F,#5C4711)'

export default function AssetDetail({ asset, valuation, marketRates, defaults = [], fx = 1, onEdit, onDeleted, onClose }: Props) {
  const [deleting, setDeleting] = useState(false)
  const series = valueSeries(asset, marketRates, defaults, fx)
  const cat = categoryDef(asset.category)
  const isMarket = asset.valuation_type === 'market'
  const emoji = (asset.details as { emoji?: string }).emoji || cat?.emoji || '📦'
  const d = asset.details as Record<string, unknown>

  const handleDelete = async () => {
    if (!await confirmDialog(`Delete “${asset.name}”? This can’t be undone.`)) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('assets').delete().eq('id', asset.id)
    if (error) { setDeleting(false); return }
    onDeleted(asset.id)
  }

  const detailRows: [string, string][] = []
  if (isMarket) {
    detailRows.push(['Purity', String(d.purity ?? asset.metal_purity ?? '—')])
    detailRows.push(['Weight', `${asset.quantity_g ?? 0} g`])
    detailRows.push(['Purchase rate', d.price_per_gram ? `₹${Number(d.price_per_gram).toLocaleString('en-IN')}/g` : '—'])
    detailRows.push(['Valuation', 'Live rate'])
  } else if (asset.category === 'real_estate' && asset.subcategory === 'land') {
    detailRows.push(['Area', `${d.area_cent ?? '?'} cent`])
    detailRows.push(['Price / cent', d.price_per_cent ? `₹${Number(d.price_per_cent).toLocaleString('en-IN')}` : '—'])
    detailRows.push(['Appreciation', asset.override_rate_pct != null ? `${asset.override_rate_pct}%/yr (override)` : 'Default'])
  } else if (asset.valuation_type === 'building') {
    detailRows.push(['Land appreciation', `${d.land_appreciation_pct ?? 0}%/yr`])
    detailRows.push(['Structure depreciation', `${d.structure_depreciation_pct ?? 0}%/yr`])
  } else {
    detailRows.push(['Depreciation', `${d.depreciation_pct ?? Math.abs(asset.override_rate_pct ?? 0)}%/yr`])
  }
  if (asset.purchase_date) detailRows.push(['Purchased', new Date(asset.purchase_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })])
  const location = (asset.details as { location?: string }).location
  if (location) detailRows.push(['Location', location])
  const docs = ((asset.details as { documents?: { type?: string; url?: string; name?: string }[] }).documents) ?? []

  const chartColor = isMarket ? 'var(--amber)' : 'var(--brand)'
  const chart = (() => {
    if (series.length < 2) return null
    const vals = series.map(p => p.v)
    const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1
    const W = 640, H = 120, pad = 8
    const pts = series.map((p, i) => [ (i / (series.length - 1)) * W, H - pad - ((p.v - min) / range) * (H - 2 * pad) ] as [number, number])
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    return { line, area: `${line} L${W},${H} L0,${H} Z`, first: series[0], last: series[series.length - 1] }
  })()
  const fmtMon = (t: string) => { const d = new Date(t); return isNaN(d.getTime()) ? t : d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch justify-center md:justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:w-[480px] md:h-full rounded-t-3xl md:rounded-none shadow-2xl slide-up max-h-[92vh] md:max-h-none overflow-hidden flex flex-col" style={{ borderLeft: '1px solid var(--border)' }}>
        {/* photo header */}
        <div className="relative shrink-0 flex items-center justify-center overflow-hidden" style={{ height: 220, background: isMarket ? GOLD_GRAD : 'linear-gradient(150deg,var(--brand-deep,#14432D),color-mix(in srgb,var(--brand-deep,#14432D) 70%,#000))' }}>
          {asset.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.photo_url} alt={asset.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : <>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 30%,rgba(255,255,255,.16),transparent 60%)' }} />
            <span style={{ fontSize: 76, filter: 'drop-shadow(0 8px 20px rgba(0,0,0,.3))' }}>{emoji}</span>
          </>}
          <button onClick={onClose} className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,.18)' }}><X className="w-4 h-4 text-white" /></button>
          <div className="absolute left-0 right-0 bottom-0 px-6 py-4" style={{ background: 'linear-gradient(0deg,rgba(0,0,0,.55),transparent)' }}>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[21px] font-extrabold text-white">{asset.name}</p>
                <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,.75)' }}>{cat?.label}{asset.subcategory ? ' · ' + (cat?.subcategories.find(s => s.key === asset.subcategory)?.label ?? asset.subcategory) : ''}</p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ color: '#fff', background: 'rgba(255,255,255,.2)' }}>{isMarket ? 'MARKET-LINKED' : asset.valuation_type === 'building' ? 'LAND ↑ / STRUCTURE ↓' : asset.valuation_type === 'depreciate' ? 'DEPRECIATING' : 'RATE-LINKED'}</span>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {/* value hero */}
          <div className="flex gap-3 mb-5">
            <div className="flex-1 rounded-[15px] p-4" style={{ background: isMarket ? GOLD_GRAD : 'var(--brand)', color: '#fff' }}>
              <div className="flex items-center gap-1.5"><p className="text-[9.5px] font-extrabold tracking-wide" style={{ color: 'rgba(255,255,255,.7)' }}>CURRENT VALUE</p>{isMarket && <span className="text-[8px] font-bold px-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.2)' }}>LIVE</span>}</div>
              <p className="text-[24px] font-extrabold mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(valuation.current)}</p>
              {valuation.currentNote && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,.7)' }}>{valuation.currentNote}</p>}
            </div>
            <div className="flex-1 rounded-[15px] p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[9.5px] font-extrabold tracking-wide" style={{ color: 'var(--text-muted)' }}>COST BASIS</p>
              <p className="text-[24px] font-extrabold mt-1" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr(valuation.cost)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: valuation.gain >= 0 ? 'var(--income)' : 'var(--expense)' }}>{valuation.gain >= 0 ? '+' : ''}{inr(valuation.gain)} · {pctStr(valuation.returnPct)}</p>
            </div>
          </div>

          {/* cost breakdown */}
          <p className="text-[11px] font-extrabold tracking-wide mb-2.5" style={{ color: 'var(--text-muted)' }}>COST BREAKDOWN</p>
          <div className="rounded-[14px] overflow-hidden mb-5" style={{ border: '1px solid var(--border)' }}>
            {valuation.costLines.map((l, i) => (
              <div key={i} className="flex justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-2, var(--border))' }}>
                <span className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{l.label}</span>
                <span className="text-[12.5px]" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3" style={{ background: 'var(--surface-2)' }}>
              <span className="text-[12.5px] font-extrabold" style={{ color: 'var(--text)' }}>Total cost</span>
              <span className="text-[13.5px] font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr(valuation.cost)}</span>
            </div>
          </div>

          {/* value history */}
          {chart && (
            <>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-extrabold tracking-wide" style={{ color: 'var(--text-muted)' }}>VALUE HISTORY</p>
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{isMarket ? 'from daily rate' : 'projected from rate'}</span>
              </div>
              <div className="rounded-[14px] p-4 mb-5" style={{ border: '1px solid var(--border)' }}>
                <svg viewBox="0 0 640 120" preserveAspectRatio="none" style={{ width: '100%', height: 110 }}>
                  <defs><linearGradient id={`av-${asset.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColor} stopOpacity="0.22" /><stop offset="100%" stopColor={chartColor} stopOpacity="0" /></linearGradient></defs>
                  <path d={chart.area} fill={`url(#av-${asset.id})`} />
                  <path d={chart.line} fill="none" stroke={chartColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex justify-between mt-1 text-[10px]" style={{ color: 'var(--text-faint)' }}><span>{fmtMon(chart.first.t)}</span><span>{fmtMon(chart.last.t)}</span></div>
              </div>
            </>
          )}

          {/* details */}
          <p className="text-[11px] font-extrabold tracking-wide mb-2.5" style={{ color: 'var(--text-muted)' }}>DETAILS</p>
          <div className="grid grid-cols-2 gap-x-6">
            {detailRows.map(([k, val], i) => (
              <div key={i} className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--border-2, var(--border))' }}>
                <span className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{val}</span>
              </div>
            ))}
          </div>

          {docs.length > 0 && (
            <>
              <p className="text-[11px] font-extrabold tracking-wide mt-5 mb-2.5" style={{ color: 'var(--text-muted)' }}>DOCUMENTS</p>
              <div className="space-y-1.5">
                {docs.map((dc, i) => (
                  <a key={i} href={dc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)' }}>
                    <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
                    <span className="text-[12.5px] font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>{dc.type || 'Document'}</span>
                    <span className="text-[11px] truncate max-w-[120px]" style={{ color: 'var(--text-faint)' }}>{dc.name || 'open'}</span>
                  </a>
                ))}
              </div>
            </>
          )}

          {(asset.details as { invoice_url?: string }).invoice_url && (
            <a href={(asset.details as { invoice_url?: string }).invoice_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 mt-4 px-3.5 py-2.5 rounded-xl text-[12.5px] font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}>
              <FileText className="w-4 h-4" /> View invoice
            </a>
          )}

          <div className="flex gap-2 mt-6">
            <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 text-white rounded-[11px] py-2.5 text-[12.5px] font-bold" style={{ background: 'var(--brand)' }}><Pencil className="w-3.5 h-3.5" /> Edit asset</button>
            <button onClick={handleDelete} disabled={deleting} className="flex items-center justify-center rounded-[11px] px-3.5 disabled:opacity-60" style={{ background: 'var(--surface)', color: 'var(--expense)', border: '1px solid var(--border)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
