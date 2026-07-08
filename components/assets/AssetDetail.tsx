'use client'

import { useState } from 'react'
import { X, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import type { Asset, MarketRate } from '@/lib/assets/types'
import { categoryDef } from '@/lib/assets/types'
import { inr, pctStr, type Valuation } from '@/lib/assets/valuation'

interface Props {
  asset: Asset
  valuation: Valuation
  marketRates: MarketRate[]
  onEdit: () => void
  onDeleted: (id: string) => void
  onClose: () => void
}

const GOLD_GRAD = 'linear-gradient(150deg,#8A6D1F,#5C4711)'

export default function AssetDetail({ asset, valuation, onEdit, onDeleted, onClose }: Props) {
  const [deleting, setDeleting] = useState(false)
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

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl slide-up max-h-[92vh] overflow-hidden flex flex-col">
        {/* photo header */}
        <div className="relative shrink-0 flex items-center justify-center" style={{ height: 220, background: isMarket ? GOLD_GRAD : 'linear-gradient(150deg,var(--brand-deep,#14432D),color-mix(in srgb,var(--brand-deep,#14432D) 70%,#000))' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 30%,rgba(255,255,255,.16),transparent 60%)' }} />
          <span style={{ fontSize: 76, filter: 'drop-shadow(0 8px 20px rgba(0,0,0,.3))' }}>{emoji}</span>
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

          <div className="flex gap-2 mt-6">
            <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 text-white rounded-[11px] py-2.5 text-[12.5px] font-bold" style={{ background: 'var(--brand)' }}><Pencil className="w-3.5 h-3.5" /> Edit asset</button>
            <button onClick={handleDelete} disabled={deleting} className="flex items-center justify-center rounded-[11px] px-3.5 disabled:opacity-60" style={{ background: 'var(--surface)', color: 'var(--expense)', border: '1px solid var(--border)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
