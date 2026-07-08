'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AssetRateDefault } from '@/lib/assets/types'
import { DEFAULT_RATES } from '@/lib/assets/types'

interface Props {
  defaults: AssetRateDefault[]
  setDefaults: React.Dispatch<React.SetStateAction<AssetRateDefault[]>>
}

// Rows we let the user configure. Gold/silver are market-linked (no % rows).
const REAL_ESTATE = {
  key: 'real_estate', emoji: '🏡', label: 'Real estate', catDefault: 'real_estate',
  subs: [
    { sub: 'land', label: 'Land', kind: 'appreciate' as const },
    { sub: 'building_land', label: 'Building — land part', kind: 'appreciate' as const },
    { sub: 'building_structure', label: 'Building — structure part', kind: 'depreciate' as const },
  ],
}
const ELECTRONICS = {
  key: 'electronics', emoji: '💻', label: 'Electronics', catDefault: 'electronics',
  subs: [
    { sub: 'computers', label: 'Computers', kind: 'depreciate' as const },
    { sub: 'phones', label: 'Phones', kind: 'depreciate' as const },
  ],
}

export default function RatesTab({ defaults, setDefaults }: Props) {
  const rateFor = (category: string, sub: string | null): number => {
    const row = defaults.find(d => d.category === category && d.subcategory === sub)
    if (row) return row.rate_pct
    const seedKey = sub ? `${category}:${sub}` : category
    return DEFAULT_RATES[seedKey] ?? 0
  }
  const isOverridden = (category: string, sub: string | null) => defaults.some(d => d.category === category && d.subcategory === sub)

  const upsert = async (category: string, sub: string | null, kind: 'appreciate' | 'depreciate', rate_pct: number) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('asset_rate_defaults')
      .upsert({ user_id: user!.id, category, subcategory: sub, kind, rate_pct }, { onConflict: 'user_id,category,subcategory' })
      .select().single()
    if (data) setDefaults(prev => {
      const rest = prev.filter(d => !(d.category === category && d.subcategory === sub))
      return [...rest, data as AssetRateDefault]
    })
  }

  const RateChip = ({ category, sub, kind, tag }: { category: string; sub: string | null; kind: 'appreciate' | 'depreciate'; tag?: string }) => {
    const val = rateFor(category, sub)
    const [edit, setEdit] = useState(String(val))
    const pos = kind === 'appreciate'
    const color = pos ? 'var(--income)' : 'var(--expense)'
    return (
      <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}>
        <input
          value={edit}
          onChange={e => setEdit(e.target.value)}
          onBlur={() => { const nv = Number(edit); if (!isNaN(nv) && nv !== val) upsert(category, sub, kind, kind === 'depreciate' ? -Math.abs(nv) : Math.abs(nv)) }}
          className="num w-10 bg-transparent text-right text-[12.5px] font-bold outline-none"
          style={{ color }}
          inputMode="decimal"
        />
        <span className="text-[12.5px] font-bold" style={{ color }}>%</span>
        {tag && <span className="text-[10px] font-bold ml-1" style={{ color: tag === 'override' ? 'var(--brand)' : 'var(--text-faint)' }}>{tag}</span>}
      </div>
    )
  }

  const CategoryCard = ({ cfg }: { cfg: typeof REAL_ESTATE }) => {
    const pos = cfg.key === 'real_estate'
    const defColor = pos ? 'var(--income)' : 'var(--expense)'
    return (
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5"><span className="text-[17px]">{cfg.emoji}</span><p className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>{cfg.label}</p></div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Default</span>
            <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: `color-mix(in srgb, ${defColor} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${defColor} 26%, transparent)` }}>
              {pos ? <TrendingUp className="w-3 h-3" style={{ color: defColor }} /> : <TrendingDown className="w-3 h-3" style={{ color: defColor }} />}
              <RateChipInline category={cfg.catDefault} sub={null} kind={pos ? 'appreciate' : 'depreciate'} rateFor={rateFor} upsert={upsert} />
              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>/yr</span>
            </div>
          </div>
        </div>
        <div className="px-4 py-1.5">
          {cfg.subs.map((s, i) => (
            <div key={s.sub} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < cfg.subs.length - 1 ? '1px solid var(--border-2, var(--border))' : 'none' }}>
              <span className="text-[12.5px]" style={{ color: 'var(--text)' }}>{s.label}</span>
              <RateChip category={cfg.key} sub={s.sub} kind={s.kind} tag={isOverridden(cfg.key, s.sub) ? 'override' : 'inherits'} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[720px] flex flex-col gap-3.5">
      <CategoryCard cfg={REAL_ESTATE} />
      {/* Gold */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5"><span className="text-[17px]">🥇</span><p className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>Gold</p><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 14%, transparent)' }}>MARKET-LINKED</span></div>
          <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Valued from live rate — no % needed</span>
        </div>
        <p className="px-4 py-3 text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>Jewellery & coins are valued at <b>quantity × today&apos;s market rate</b> (see Market rates). Appreciation % doesn&apos;t apply.</p>
      </div>
      {/* Silver */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5"><span className="text-[17px]">🥈</span><p className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>Silver</p><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}>MARKET-LINKED</span></div>
          <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Valued from live rate — no % needed</span>
        </div>
      </div>
      <CategoryCard cfg={ELECTRONICS} />
    </div>
  )
}

// Small inline editable for the category-default chip.
function RateChipInline({ category, sub, kind, rateFor, upsert }: {
  category: string; sub: string | null; kind: 'appreciate' | 'depreciate'
  rateFor: (c: string, s: string | null) => number
  upsert: (c: string, s: string | null, k: 'appreciate' | 'depreciate', r: number) => void
}) {
  const val = rateFor(category, sub)
  const [edit, setEdit] = useState(String(Math.abs(val)))
  const color = kind === 'appreciate' ? 'var(--income)' : 'var(--expense)'
  return (
    <div className="flex items-center">
      <span className="text-[13px] font-extrabold" style={{ color }}>{kind === 'appreciate' ? '+' : '−'}</span>
      <input value={edit} onChange={e => setEdit(e.target.value)}
        onBlur={() => { const nv = Number(edit); if (!isNaN(nv)) upsert(category, sub, kind, kind === 'depreciate' ? -Math.abs(nv) : Math.abs(nv)) }}
        className="num w-8 bg-transparent text-right text-[13px] font-extrabold outline-none" style={{ color }} inputMode="decimal" />
      <span className="text-[13px] font-extrabold" style={{ color }}>%</span>
    </div>
  )
}
