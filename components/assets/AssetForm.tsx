'use client'

import { useMemo, useState } from 'react'
import { X, TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Asset, MarketRate, AssetRateDefault, AssetDetails, ValuationType } from '@/lib/assets/types'
import { categoryDef } from '@/lib/assets/types'
import { computeCost, perGramRate, valueAsset, inr } from '@/lib/assets/valuation'

interface Props {
  asset: Asset | null
  category: string
  subcategory: string
  marketRates: MarketRate[]
  defaults: AssetRateDefault[]
  onSaved: (a: Asset) => void
  onClose: () => void
}

const num = (v: string) => (v === '' ? undefined : Number(v))
const fld = 'w-full mt-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-[10px] px-3 py-2.5 text-[13px]'
const lbl = 'text-[11px] font-bold text-[var(--text-muted)]'

export default function AssetForm({ asset, category, subcategory, marketRates, defaults, onSaved, onClose }: Props) {
  const cat = categoryDef(category)!
  const valuation: ValuationType = (asset?.valuation_type
    ?? cat.subcategories.find(s => s.key === subcategory)?.valuation
    ?? cat.valuation) as ValuationType
  const isMarket = valuation === 'market'
  const isLand = category === 'real_estate' && valuation === 'rate'
  const isBuilding = valuation === 'building'
  const isDeprec = valuation === 'depreciate'

  const d0 = (asset?.details ?? {}) as AssetDetails
  const [name, setName] = useState(asset?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // gold/silver
  const [weight, setWeight] = useState(d0.weight_g?.toString() ?? asset?.quantity_g?.toString() ?? '')
  const purityUnit = category === 'gold' ? 'K' : '%'
  const initPurity = d0.purity ?? asset?.metal_purity ?? (category === 'gold' ? '22K' : '99.9%')
  const [purityVal, setPurityVal] = useState(initPurity.match(/[\d.]+/)?.[0] ?? (category === 'gold' ? '22' : '99.9'))
  const purity = purityVal ? `${purityVal}${purityUnit}` : ''
  const [ppg, setPpg] = useState(d0.price_per_gram?.toString() ?? '')
  const [wastage, setWastage] = useState(d0.wastage_pct?.toString() ?? '')
  const [making, setMaking] = useState(d0.making_charge?.toString() ?? '')
  const [gst, setGst] = useState(d0.gst_pct?.toString() ?? '')
  // land
  const [areaCent, setAreaCent] = useState(d0.area_cent?.toString() ?? '')
  const [ppc, setPpc] = useState(d0.price_per_cent?.toString() ?? '')
  const [doc, setDoc] = useState(d0.documentation?.toString() ?? '')
  const [broker, setBroker] = useState(d0.broker?.toString() ?? '')
  const [appMode, setAppMode] = useState<'default' | 'override' | 'manual'>(
    asset?.manual_value != null ? 'manual' : asset?.override_rate_pct != null ? 'override' : 'default')
  const [overrideRate, setOverrideRate] = useState(asset?.override_rate_pct?.toString() ?? '')
  const [manualValue, setManualValue] = useState(asset?.manual_value?.toString() ?? '')
  // building
  const [landCost, setLandCost] = useState(d0.land_cost?.toString() ?? '')
  const [landApp, setLandApp] = useState(d0.land_appreciation_pct?.toString() ?? '7')
  const [structCost, setStructCost] = useState(d0.structure_cost?.toString() ?? '')
  const [structDep, setStructDep] = useState(d0.structure_depreciation_pct?.toString() ?? '3')
  // electronics
  const [purchaseCost, setPurchaseCost] = useState(d0.purchase_cost?.toString() ?? '')
  const [deprecPct, setDeprecPct] = useState(d0.depreciation_pct?.toString() ?? (subcategory === 'phones' ? '30' : '25'))
  // shared
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? '')

  const details: AssetDetails = useMemo(() => {
    if (isMarket) return { weight_g: num(weight), purity, price_per_gram: num(ppg), wastage_pct: num(wastage), making_charge: num(making), gst_pct: num(gst) }
    if (isLand) return { area_cent: num(areaCent), price_per_cent: num(ppc), documentation: num(doc), broker: num(broker) }
    if (isBuilding) return { land_cost: num(landCost), land_appreciation_pct: num(landApp), structure_cost: num(structCost), structure_depreciation_pct: num(structDep) }
    return { purchase_cost: num(purchaseCost), depreciation_pct: num(deprecPct) }
  }, [isMarket, isLand, isBuilding, weight, purity, ppg, wastage, making, gst, areaCent, ppc, doc, broker, landCost, landApp, structCost, structDep, purchaseCost, deprecPct])

  const { cost, lines } = computeCost(category, valuation, details)

  // Build a provisional asset for live current-value preview
  const preview = useMemo(() => {
    const a: Asset = {
      id: asset?.id ?? 'preview', user_id: '', household_id: null, name, category, subcategory,
      valuation_type: valuation, purchase_date: purchaseDate || null, cost_total: cost, details,
      metal: isMarket ? category : null, metal_purity: isMarket ? purity : null, quantity_g: isMarket ? (num(weight) ?? null) : null,
      override_rate_pct: appMode === 'override' ? (num(overrideRate) ?? null) : isDeprec ? -(num(deprecPct) ?? 0) : null,
      manual_value: appMode === 'manual' ? (num(manualValue) ?? null) : null,
      manual_value_date: null, photo_url: null, include_in_net_worth: true, notes: null,
      created_at: '', updated_at: '',
    }
    return valueAsset(a, marketRates, defaults)
  }, [asset, name, category, subcategory, valuation, purchaseDate, cost, details, isMarket, purity, weight, appMode, overrideRate, manualValue, isDeprec, deprecPct, marketRates, defaults])

  const todayRate = isMarket ? perGramRate(category, purity || null, marketRates) : null

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      name: name.trim(), category, subcategory, valuation_type: valuation,
      purchase_date: purchaseDate || null, cost_total: cost, details,
      metal: isMarket ? category : null, metal_purity: isMarket ? (purity || null) : null,
      quantity_g: isMarket ? (num(weight) ?? null) : null,
      override_rate_pct: appMode === 'override' ? (num(overrideRate) ?? null) : isDeprec ? -(num(deprecPct) ?? 0) : null,
      manual_value: appMode === 'manual' ? (num(manualValue) ?? null) : null,
      include_in_net_worth: asset?.include_in_net_worth ?? true,
    }
    let data, err
    if (asset) { const r = await supabase.from('assets').update(payload).eq('id', asset.id).select().single(); data = r.data; err = r.error }
    else { const r = await supabase.from('assets').insert({ ...payload, user_id: user!.id }).select().single(); data = r.data; err = r.error }
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data as Asset)
  }

  const title = asset ? `Edit · ${asset.name}` : `Add ${cat.label.toLowerCase()}${isMarket ? ' · ' + (cat.subcategories.find(s => s.key === subcategory)?.label ?? '') : ''}`
  const goldGrad = 'linear-gradient(135deg,#8A6D1F,#5C4711)'
  const brandGrad = 'linear-gradient(135deg,var(--brand-deep,#14432D),color-mix(in srgb,var(--brand-deep,#14432D) 76%,#000))'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:max-w-3xl rounded-t-3xl md:rounded-3xl shadow-2xl slide-up max-h-[92vh] overflow-hidden flex flex-col md:flex-row">
        {/* form */}
        <div className="flex flex-col flex-1 min-w-0 max-h-[92vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">{cat.emoji}</span>
              <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{title}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
            {error && <div className="text-[13px] rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)', color: 'var(--expense)' }}>{error}</div>}
            <div><label className={lbl}>Name</label><input className={fld} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wedding set" /></div>

            {isMarket && <>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Weight (g)</label><input className={fld} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></div>
                <div><label className={lbl}>Price / gram (at purchase)</label><input className={fld} inputMode="decimal" value={ppg} onChange={e => setPpg(e.target.value)} /></div>
              </div>
              {/* Purity — presets + any custom value (e.g. 12.5K gold, 92.5% silver) */}
              <div>
                <label className={lbl}>Purity ({category === 'gold' ? 'karat' : 'fineness %'})</label>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {(category === 'gold'
                    ? [['24', '24K'], ['22', '22K'], ['18', '18K'], ['14', '14K']]
                    : [['99.9', 'Fine 99.9%'], ['92.5', 'Sterling 92.5%'], ['90', 'Coin 90%']]
                  ).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setPurityVal(v)} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg"
                      style={purityVal === v ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{l}</button>
                  ))}
                  <div className="flex items-center gap-1 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <input className="num w-12 bg-transparent text-[12px] outline-none" inputMode="decimal" value={purityVal} onChange={e => setPurityVal(e.target.value)} placeholder="custom" style={{ color: 'var(--text)' }} />
                    <span className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>{purityUnit}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Wastage %</label><input className={fld} inputMode="decimal" value={wastage} onChange={e => setWastage(e.target.value)} /></div>
                <div><label className={lbl}>GST %</label><input className={fld} inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Making charge</label><input className={fld} inputMode="decimal" value={making} onChange={e => setMaking(e.target.value)} /></div>
                <div><label className={lbl}>Purchased</label><input type="date" className={fld} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
              </div>
            </>}

            {isLand && <>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Area (cent)</label><input className={fld} inputMode="decimal" value={areaCent} onChange={e => setAreaCent(e.target.value)} /></div>
                <div><label className={lbl}>Price / cent</label><input className={fld} inputMode="decimal" value={ppc} onChange={e => setPpc(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Documentation</label><input className={fld} inputMode="decimal" value={doc} onChange={e => setDoc(e.target.value)} /></div>
                <div><label className={lbl}>Broker commission</label><input className={fld} inputMode="decimal" value={broker} onChange={e => setBroker(e.target.value)} /></div>
              </div>
              <div><label className={lbl}>Purchase date</label><input type="date" className={fld} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
              <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Appreciation</span>
                  <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {(['default', 'override', 'manual'] as const).map(m => (
                      <button key={m} onClick={() => setAppMode(m)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md capitalize"
                        style={appMode === m ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--text-muted)' }}>{m === 'manual' ? 'Manual ₹' : m}</button>
                    ))}
                  </div>
                </div>
                {appMode === 'default' && <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Uses the category default from the Rates tab.</p>}
                {appMode === 'override' && <input className="num w-full bg-[var(--surface)] border-[1.5px] border-[var(--brand)] rounded-[9px] px-3 py-2 text-[13px] font-bold" placeholder="10" value={overrideRate} onChange={e => setOverrideRate(e.target.value)} inputMode="decimal" style={{ color: 'var(--text)' }} />}
                {appMode === 'manual' && <input className="num w-full bg-[var(--surface)] border-[1.5px] border-[var(--brand)] rounded-[9px] px-3 py-2 text-[13px] font-bold" placeholder="Current value ₹" value={manualValue} onChange={e => setManualValue(e.target.value)} inputMode="decimal" style={{ color: 'var(--text)' }} />}
              </div>
            </>}

            {isBuilding && <>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--brand) 25%, transparent)' }}>
                <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: 'var(--brand-light)' }}><TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} /><span className="text-[11px] font-extrabold tracking-wide" style={{ color: 'var(--brand)' }}>LAND — APPRECIATES</span></div>
                <div className="p-3 grid grid-cols-2 gap-2.5">
                  <div><label className={lbl}>Land cost</label><input className={fld} inputMode="decimal" value={landCost} onChange={e => setLandCost(e.target.value)} /></div>
                  <div><label className={lbl}>Appreciation %/yr</label><input className={fld} inputMode="decimal" value={landApp} onChange={e => setLandApp(e.target.value)} /></div>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--expense) 25%, transparent)' }}>
                <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)' }}><TrendingDown className="w-3.5 h-3.5" style={{ color: 'var(--expense)' }} /><span className="text-[11px] font-extrabold tracking-wide" style={{ color: 'var(--expense)' }}>STRUCTURE — DEPRECIATES</span></div>
                <div className="p-3 grid grid-cols-2 gap-2.5">
                  <div><label className={lbl}>Construction cost</label><input className={fld} inputMode="decimal" value={structCost} onChange={e => setStructCost(e.target.value)} /></div>
                  <div><label className={lbl}>Depreciation %/yr</label><input className={fld} inputMode="decimal" value={structDep} onChange={e => setStructDep(e.target.value)} /></div>
                </div>
              </div>
              <div><label className={lbl}>Built / bought</label><input type="date" className={fld} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
            </>}

            {isDeprec && <>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Purchase cost</label><input className={fld} inputMode="decimal" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} /></div>
                <div><label className={lbl}>Purchase date</label><input type="date" className={fld} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
              </div>
              <div><label className={lbl}>Depreciation %/yr</label><input className={fld} inputMode="decimal" value={deprecPct} onChange={e => setDeprecPct(e.target.value)} /></div>
            </>}
          </div>

          <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)]" style={{ background: 'var(--surface-2)' }}>
            <button onClick={onClose} className="px-4 py-2 rounded-[10px] text-[12.5px] font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-[10px] text-[12.5px] font-bold text-white disabled:opacity-60" style={{ background: 'var(--brand)' }}>{saving ? 'Saving…' : 'Save asset'}</button>
          </div>
        </div>

        {/* live calculation */}
        <div className="hidden md:flex md:w-[270px] shrink-0 flex-col px-5 py-5" style={{ background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>
          <p className="text-[10px] font-extrabold tracking-[.1em] mb-3.5" style={{ color: 'var(--text-faint)' }}>{isBuilding ? 'CURRENT VALUE SPLIT' : 'LIVE CALCULATION'}</p>

          {isBuilding ? <>
            <div className="rounded-xl p-3.5 mb-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-1.5"><TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} /><span className="text-[11.5px] font-bold" style={{ color: 'var(--text)' }}>Land</span></div>
              <p className="text-lg font-extrabold" style={{ color: 'var(--brand)', fontVariantNumeric: 'tabular-nums' }}>{inr(landPart())}</p>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-1.5"><TrendingDown className="w-3.5 h-3.5" style={{ color: 'var(--expense)' }} /><span className="text-[11.5px] font-bold" style={{ color: 'var(--text)' }}>Structure</span></div>
              <p className="text-lg font-extrabold" style={{ color: 'var(--expense)', fontVariantNumeric: 'tabular-nums' }}>{inr(structPart())}</p>
            </div>
          </> : <>
            <p className="text-[10px] font-extrabold tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>COST</p>
            <div className="text-[11.5px]">
              {lines.map((l, i) => (
                <div key={i} className="flex justify-between py-1" style={{ color: 'var(--text-muted)', borderBottom: i === lines.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: i === lines.length - 1 ? 9 : undefined }}>
                  <span>{l.label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(l.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5 font-extrabold" style={{ color: 'var(--text)' }}><span>Total cost</span><span className="text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(cost)}</span></div>
            </div>
          </>}

          <div className="mt-auto rounded-[13px] p-3.5" style={{ background: isMarket ? goldGrad : brandGrad }}>
            <div className="flex items-center gap-1.5">
              <p className="text-[9.5px] font-extrabold tracking-wide" style={{ color: 'rgba(255,255,255,.65)' }}>{isBuilding ? 'TOTAL CURRENT VALUE' : 'CURRENT VALUE'}</p>
              {isMarket && <span className="text-[8px] font-bold px-1.5 rounded-full" style={{ color: '#fff', background: 'rgba(255,255,255,.18)' }}>LIVE</span>}
            </div>
            <p className="text-[22px] font-extrabold mt-0.5" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{inr(preview.current)}</p>
            <p className="text-[10px] mt-0.5" style={{ color: preview.gain >= 0 ? '#9DE8B8' : '#FCA5A5' }}>
              {isMarket ? (todayRate ? `${num(weight) ?? 0}g × ₹${todayRate.toLocaleString('en-IN')}` : 'No market rate yet')
                : `cost ${inr(cost)} · ${preview.gain >= 0 ? '+' : ''}${Math.round(preview.returnPct * 100)}%`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  function landPart() { const y = elapsedYears(); return (num(landCost) ?? 0) * Math.pow(1 + (num(landApp) ?? 0) / 100, y) }
  function structPart() { const y = elapsedYears(); return (num(structCost) ?? 0) * Math.pow(1 - (num(structDep) ?? 0) / 100, y) }
  function elapsedYears() { if (!purchaseDate) return 0; const dt = new Date(purchaseDate); return isNaN(dt.getTime()) ? 0 : Math.max(0, (Date.now() - dt.getTime()) / (365.25 * 864e5)) }
}
