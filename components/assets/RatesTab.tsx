'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Asset, AssetRateDefault } from '@/lib/assets/types'
import { ASSET_CATEGORIES, categoryDef, DEFAULT_RATES } from '@/lib/assets/types'

interface Props {
  assets: Asset[]
  defaults: AssetRateDefault[]
  setDefaults: React.Dispatch<React.SetStateAction<AssetRateDefault[]>>
}

const METAL = ['gold', 'silver', 'platinum']

export default function RatesTab({ assets, defaults, setDefaults }: Props) {
  const [newSub, setNewSub] = useState<Record<string, string>>({})
  const [newCat, setNewCat] = useState('')
  const [newCatSub, setNewCatSub] = useState('')

  // Build taxonomy: category -> set of subcategories (non-metal), from assets + saved rate rows + built-ins.
  const taxonomy = useMemo(() => {
    const m = new Map<string, Set<string>>()
    const add = (c?: string | null, s?: string | null) => {
      if (!c || !s || s === '—' || METAL.includes(c)) return
      if (!m.has(c)) m.set(c, new Set())
      m.get(c)!.add(s)
    }
    for (const cd of ASSET_CATEGORIES) if (!METAL.includes(cd.key)) for (const sc of cd.subcategories) add(cd.key, sc.key)
    assets.forEach(a => add(a.category, a.subcategory))
    defaults.forEach(d => add(d.category, d.subcategory))
    return Array.from(m.entries()).map(([key, subs]) => ({ key, label: categoryDef(key)?.label ?? key, emoji: categoryDef(key)?.emoji ?? '💠', subs: Array.from(subs) }))
  }, [assets, defaults])

  const rateFor = (category: string, sub: string): number => {
    const row = defaults.find(d => d.category === category && d.subcategory === sub)
    if (row) return row.rate_pct
    return DEFAULT_RATES[`${category}:${sub}`] ?? DEFAULT_RATES[category] ?? 0
  }
  const upsert = async (category: string, sub: string, rate_pct: number) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('asset_rate_defaults')
      .upsert({ user_id: user!.id, category, subcategory: sub, kind: rate_pct < 0 ? 'depreciate' : 'appreciate', rate_pct }, { onConflict: 'user_id,category,subcategory' })
      .select().single()
    if (data) setDefaults(prev => [...prev.filter(d => !(d.category === category && d.subcategory === sub)), data as AssetRateDefault])
  }
  const addSub = async (category: string) => {
    const s = (newSub[category] || '').trim(); if (!s) return
    await upsert(category, s, 0); setNewSub(v => ({ ...v, [category]: '' }))
  }
  const addCategory = async () => {
    const c = newCat.trim(), s = newCatSub.trim(); if (!c || !s) return
    await upsert(c, s, 0); setNewCat(''); setNewCatSub('')
  }

  const RateInput = ({ category, sub }: { category: string; sub: string }) => {
    const [edit, setEdit] = useState(String(rateFor(category, sub)))
    const v = rateFor(category, sub)
    const color = v < 0 ? 'var(--expense)' : v > 0 ? 'var(--income)' : 'var(--text-muted)'
    return (
      <div className="flex items-center gap-1 rounded-lg px-2.5 py-1.5" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}>
        <input value={edit} onChange={e => setEdit(e.target.value)}
          onBlur={() => { const nv = Number(edit); if (!isNaN(nv) && nv !== v) upsert(category, sub, nv) }}
          className="num w-12 bg-transparent text-right text-[12.5px] font-bold outline-none" style={{ color }} inputMode="decimal" placeholder="0" />
        <span className="text-[12.5px] font-bold" style={{ color }}>%/yr</span>
      </div>
    )
  }

  return (
    <div className="max-w-[720px] flex flex-col gap-3.5">
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Set a %/yr per sub-category — <b>positive appreciates, negative depreciates</b>. Any asset can override this, or hold a manual value.</p>

      {taxonomy.map(cat => (
        <div key={cat.key} className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-[17px]">{cat.emoji}</span><p className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>{cat.label}</p>
          </div>
          <div className="px-4 py-1.5">
            {cat.subs.map((s, i) => (
              <div key={s} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < cat.subs.length - 1 ? '1px solid var(--border-2, var(--border))' : 'none' }}>
                <span className="text-[12.5px]" style={{ color: 'var(--text)' }}>{categoryDef(cat.key)?.subcategories.find(x => x.key === s)?.label ?? s}</span>
                <RateInput category={cat.key} sub={s} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <input value={newSub[cat.key] || ''} onChange={e => setNewSub(v => ({ ...v, [cat.key]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addSub(cat.key) }}
              placeholder="Add sub-category…" className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12.5px]" />
            <button onClick={() => addSub(cat.key)} className="flex items-center gap-1 text-[12px] font-bold" style={{ color: 'var(--brand)' }}><Plus className="w-3.5 h-3.5" /> Add</button>
          </div>
        </div>
      ))}

      {/* Metals note */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-[17px]">🥇</span><p className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>Gold · Silver · Platinum</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 14%, transparent)' }}>MARKET-LINKED</span>
        </div>
        <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>Valued live from the daily market rate × purity — no %/yr needed.</p>
      </div>

      {/* Add a whole new category */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
        <p className="text-[12.5px] font-bold mb-2" style={{ color: 'var(--text)' }}>New category</p>
        <div className="grid grid-cols-2 gap-2.5">
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Category (e.g. Collectibles)" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12.5px]" />
          <input value={newCatSub} onChange={e => setNewCatSub(e.target.value)} placeholder="First sub-category (e.g. Coins)" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12.5px]" />
        </div>
        <button onClick={addCategory} disabled={!newCat.trim() || !newCatSub.trim()} className="mt-2.5 flex items-center gap-1 text-[12.5px] font-bold disabled:opacity-50" style={{ color: 'var(--brand)' }}><Plus className="w-4 h-4" /> Add category</button>
      </div>
    </div>
  )
}
