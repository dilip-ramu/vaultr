'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { X, TrendingUp, TrendingDown, ImagePlus, FileText, Gem, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Asset, MarketRate, AssetRateDefault, AssetDetails, ValuationType, StoneEntry, DocEntry } from '@/lib/assets/types'
import { categoryDef, STONE_TYPES, DOC_TYPES, ASSET_CURRENCIES } from '@/lib/assets/types'
import { useFileDrop } from '@/components/shared/useFileDrop'
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
  const cat = categoryDef(category)                      // undefined for user-defined categories
  const catLabel = cat?.label ?? category
  const catEmoji = cat?.emoji ?? '💠'
  const isMetalCat = ['gold', 'silver', 'platinum'].includes(category)
  const valuation: ValuationType = (asset?.valuation_type as ValuationType)
    ?? (isMetalCat ? 'market'
      : (category === 'real_estate' && subcategory === 'building') ? 'building'
      : (cat?.subcategories.find(s => s.key === subcategory)?.valuation as ValuationType)
      ?? 'rate')
  const isMarket = valuation === 'market'
  const isBuilding = valuation === 'building'
  const isLand = category === 'real_estate' && subcategory === 'land' && (valuation === 'rate' || valuation === 'depreciate')
  const isRate = (valuation === 'rate' || valuation === 'depreciate') && !isLand   // generic: electronics, watch, artwork, custom…

  const d0 = (asset?.details ?? {}) as AssetDetails
  const [name, setName] = useState(asset?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // gold/silver
  const [weight, setWeight] = useState(d0.weight_g?.toString() ?? asset?.quantity_g?.toString() ?? '')
  const purityUnit = category === 'gold' ? 'K' : category === 'platinum' ? '' : '%'
  const purityDefault = category === 'gold' ? '22K' : category === 'platinum' ? '950' : '99.9%'
  const initPurity = d0.purity ?? asset?.metal_purity ?? purityDefault
  const [purityVal, setPurityVal] = useState(initPurity.match(/[\d.]+/)?.[0] ?? (category === 'gold' ? '22' : category === 'platinum' ? '950' : '99.9'))
  const purity = purityVal ? `${purityVal}${purityUnit}` : ''
  const [ppg, setPpg] = useState(d0.price_per_gram?.toString() ?? '')
  const [grossW, setGrossW] = useState(d0.gross_weight_g?.toString() ?? '')
  const [valueAdd, setValueAdd] = useState((d0.value_addition_pct ?? d0.wastage_pct)?.toString() ?? '')
  const [makingG, setMakingG] = useState(d0.making_per_gram?.toString() ?? '')
  const [certif, setCertif] = useState(d0.certification?.toString() ?? '')
  const [discount, setDiscount] = useState(d0.discount?.toString() ?? '')
  const [taxPct, setTaxPct] = useState((d0.tax_pct ?? d0.gst_pct)?.toString() ?? '')
  // stones — repeatable list (converts legacy diamond/other fields for editing)
  const nz = (v: unknown) => Number(v) || 0
  const legacyStones: StoneEntry[] = []
  if (nz(d0.diamond_carats) || nz(d0.diamond_cost_per_carat)) legacyStones.push({ type: 'Diamond', weight_ct: nz(d0.diamond_carats) || undefined, cost: nz(d0.diamond_carats) * nz(d0.diamond_cost_per_carat) || undefined, present: nz(d0.diamond_carats) * nz(d0.diamond_present_per_carat) || undefined })
  if (nz(d0.other_carats) || nz(d0.other_cost_per_carat)) legacyStones.push({ type: 'Other', weight_ct: nz(d0.other_carats) || undefined, cost: nz(d0.other_carats) * nz(d0.other_cost_per_carat) || undefined, present: nz(d0.other_carats) * nz(d0.other_present_per_carat) || undefined })
  const [stones, setStones] = useState<StoneEntry[]>(Array.isArray(d0.stones) && d0.stones.length ? d0.stones : legacyStones)
  const [showStones, setShowStones] = useState((Array.isArray(d0.stones) ? d0.stones.length : legacyStones.length) > 0)
  const setStone = (i: number, patch: Partial<StoneEntry>) => setStones(s => s.map((x, j) => j === i ? { ...x, ...patch } : x))
  // location + documents (repeatable, like stones)
  const [location, setLocation] = useState(d0.location ?? '')
  const [documents, setDocuments] = useState<DocEntry[]>(Array.isArray(d0.documents) ? d0.documents : [])
  const docRef = useRef<HTMLInputElement>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  // attachments — Photo + Invoice (separate)
  const [photoUrl, setPhotoUrl] = useState(asset?.photo_url ?? '')
  const [invoiceUrl, setInvoiceUrl] = useState(d0.invoice_url ?? '')
  const [uploading, setUploading] = useState<'' | 'photo' | 'invoice'>('')
  const photoRef = useRef<HTMLInputElement>(null)
  const invoiceRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (slot: 'photo' | 'invoice', file?: File) => {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { setError('File must be under 8MB'); return }
    setUploading(slot); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user!.id}/assets/${slot}-${Date.now()}.${ext}`
    const { error: e } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (e) { setError(e.message); setUploading(''); return }
    const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`
    if (slot === 'photo') setPhotoUrl(url); else setInvoiceUrl(url)
    setUploading('')
  }

  const photoDrop = useFileDrop(f => uploadFile('photo', f[0]), { disabled: uploading === 'photo' })
  const invoiceDrop = useFileDrop(f => uploadFile('invoice', f[0]), { disabled: uploading === 'invoice' })
  const docDrop = useFileDrop(f => uploadDoc(f[0]), { disabled: uploadingDoc })

  const uploadDoc = async (file?: File) => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { setError('Document must be under 15MB'); return }
    setUploadingDoc(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user!.id}/assets/doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const { error: e } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (e) { setError(e.message); setUploadingDoc(false); return }
    const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
    setDocuments(d => [...d, { type: DOC_TYPES[0], url: publicUrl, name: file.name }])
    setUploadingDoc(false)
  }
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
  // shared
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? '')
  const [currency, setCurrency] = useState((d0.currency as string | undefined) ?? 'INR')
  const [fxRates, setFxRates] = useState<Record<string, number>>({})
  useEffect(() => {
    if (currency === 'INR' || fxRates[currency]) return
    let live = true
    fetch('/api/exchange-rates').then(r => r.json()).then(j => { if (live && j?.rates) setFxRates(j.rates) }).catch(() => {})
    return () => { live = false }
  }, [currency, fxRates])
  const fx = currency && currency !== 'INR' ? (fxRates[currency] || 0) : 1

  const details: AssetDetails = useMemo(() => {
    const docs = documents.length ? documents : undefined
    const cur = currency && currency !== 'INR' ? currency : undefined
    const cleanStones = stones
      .map(s => ({ type: s.type, weight_ct: Number(s.weight_ct) || undefined, cost: Number(s.cost) || undefined, present: Number(s.present) || undefined }))
      .filter(s => s.type || s.cost || s.weight_ct || s.present)
    if (isMarket) return {
      weight_g: num(weight), gross_weight_g: num(grossW), purity, price_per_gram: num(ppg),
      value_addition_pct: num(valueAdd), making_per_gram: num(makingG), certification: num(certif),
      discount: num(discount), tax_pct: num(taxPct),
      stones: cleanStones.length ? cleanStones : undefined,
      invoice_url: invoiceUrl || undefined, documents: docs, currency: cur,
    }
    if (isLand) return { area_cent: num(areaCent), price_per_cent: num(ppc), documentation: num(doc), broker: num(broker), location: location || undefined, documents: docs, currency: cur }
    if (isBuilding) return { land_cost: num(landCost), land_appreciation_pct: num(landApp), structure_cost: num(structCost), structure_depreciation_pct: num(structDep), location: location || undefined, documents: docs, currency: cur }
    return { purchase_cost: num(purchaseCost), documents: docs, currency: cur }
  }, [isMarket, isLand, isBuilding, weight, grossW, purity, ppg, valueAdd, makingG, certif, discount, taxPct, stones, invoiceUrl, documents, location, areaCent, ppc, doc, broker, landCost, landApp, structCost, structDep, purchaseCost, currency])

  const { cost, lines } = computeCost(category, valuation, details)

  // Build a provisional asset for live current-value preview
  const preview = useMemo(() => {
    const a: Asset = {
      id: asset?.id ?? 'preview', user_id: '', household_id: null, name, category, subcategory,
      valuation_type: valuation, purchase_date: purchaseDate || null, cost_total: cost, details,
      metal: isMarket ? category : null, metal_purity: isMarket ? purity : null, quantity_g: isMarket ? (num(weight) ?? null) : null,
      override_rate_pct: appMode === 'override' ? (num(overrideRate) ?? null) : null,
      manual_value: appMode === 'manual' ? (num(manualValue) ?? null) : null,
      manual_value_date: null, photo_url: null, include_in_net_worth: true, notes: null,
      status: asset?.status ?? 'held', sold_price: asset?.sold_price ?? null, sold_date: asset?.sold_date ?? null,
      // Sale settlement (preview only — the form never edits these; the sale modal does).
      sale_charges: asset?.sale_charges ?? 0, sale_tax: asset?.sale_tax ?? 0, sale_net: asset?.sale_net ?? null,
      sale_account_id: asset?.sale_account_id ?? null, sale_transaction_id: asset?.sale_transaction_id ?? null,
      sale_payment_status: asset?.sale_payment_status ?? 'awaiting',
      sale_received_date: asset?.sale_received_date ?? null,
      sale_buyer: asset?.sale_buyer ?? null, sale_reference: asset?.sale_reference ?? null,
      created_at: '', updated_at: '',
    }
    return valueAsset(a, marketRates, defaults, fx || 1)
  }, [asset, name, category, subcategory, valuation, purchaseDate, cost, details, isMarket, purity, weight, appMode, overrideRate, manualValue, marketRates, defaults, fx])

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
      override_rate_pct: appMode === 'override' ? (num(overrideRate) ?? null) : null,
      manual_value: appMode === 'manual' ? (num(manualValue) ?? null) : null,
      include_in_net_worth: asset?.include_in_net_worth ?? true,
      photo_url: photoUrl || null,
    }
    let data, err
    if (asset) { const r = await supabase.from('assets').update(payload).eq('id', asset.id).select().single(); data = r.data; err = r.error }
    else { const r = await supabase.from('assets').insert({ ...payload, user_id: user!.id }).select().single(); data = r.data; err = r.error }
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data as Asset)
  }

  const subLabel = cat?.subcategories.find(s => s.key === subcategory)?.label ?? subcategory
  const title = asset ? `Edit · ${asset.name}` : `Add ${catLabel.toLowerCase()}${subLabel ? ' · ' + subLabel : ''}`
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
              <span className="text-lg">{catEmoji}</span>
              <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{title}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
            {error && <div className="text-[13px] rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)', color: 'var(--expense)' }}>{error}</div>}
            <div className="grid grid-cols-[1fr_auto] gap-2.5">
              <div><label className={lbl}>Name</label><input className={fld} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wedding set" /></div>
              <div><label className={lbl}>Currency</label>
                <select className={`${fld} appearance-none`} style={{ color: 'var(--text)' }} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {ASSET_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {currency !== 'INR' && (
              <p className="text-[10.5px] -mt-1" style={{ color: 'var(--text-faint)' }}>
                Amounts entered in {currency}. {fx ? `≈ ₹${(cost * fx).toLocaleString('en-IN', { maximumFractionDigits: 0 })} at today’s rate (₹${fx.toFixed(2)}/${currency}).` : 'Fetching today’s rate…'}
              </p>
            )}

            {/* Attachments — Photo and Invoice have separate slots */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={lbl}>Photo</label>
                <button type="button" onClick={() => photoRef.current?.click()} {...photoDrop.dropProps} className="mt-1.5 w-full h-[78px] rounded-[10px] border border-dashed flex flex-col items-center justify-center gap-1 overflow-hidden transition-all" style={{ borderColor: photoDrop.dragOver ? 'var(--brand)' : 'var(--border)', background: photoDrop.dragOver ? 'var(--brand-light)' : 'var(--surface-2)' }}>
                  {photoUrl && !photoDrop.dragOver
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                    : <><ImagePlus className="w-5 h-5" style={{ color: photoDrop.dragOver ? 'var(--brand)' : 'var(--text-faint)' }} /><span className="text-[10px]" style={{ color: photoDrop.dragOver ? 'var(--brand)' : 'var(--text-faint)' }}>{uploading === 'photo' ? 'Uploading…' : photoDrop.dragOver ? 'Drop photo' : 'Add photo'}</span></>}
                </button>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => uploadFile('photo', e.target.files?.[0])} />
              </div>
              <div>
                <label className={lbl}>Invoice</label>
                <button type="button" onClick={() => invoiceRef.current?.click()} {...invoiceDrop.dropProps} className="mt-1.5 w-full h-[78px] rounded-[10px] border border-dashed flex flex-col items-center justify-center gap-1 transition-all" style={{ borderColor: (invoiceUrl || invoiceDrop.dragOver) ? 'var(--brand)' : 'var(--border)', background: invoiceDrop.dragOver ? 'var(--brand-light)' : 'var(--surface-2)' }}>
                  <FileText className="w-5 h-5" style={{ color: (invoiceUrl || invoiceDrop.dragOver) ? 'var(--brand)' : 'var(--text-faint)' }} />
                  <span className="text-[10px]" style={{ color: (invoiceUrl || invoiceDrop.dragOver) ? 'var(--brand)' : 'var(--text-faint)' }}>{uploading === 'invoice' ? 'Uploading…' : invoiceDrop.dragOver ? 'Drop invoice' : invoiceUrl ? 'Invoice attached' : 'Add invoice'}</span>
                </button>
                <input ref={invoiceRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => uploadFile('invoice', e.target.files?.[0])} />
              </div>
            </div>

            {isMarket && <>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Net weight (g)</label><input className={fld} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></div>
                <div><label className={lbl}>Gross weight (g)</label><input className={fld} inputMode="decimal" value={grossW} onChange={e => setGrossW(e.target.value)} /></div>
              </div>
              <div><label className={lbl}>Metal cost / gram (at purchase)</label><input className={fld} inputMode="decimal" value={ppg} onChange={e => setPpg(e.target.value)} /></div>
              {/* Purity — presets + any custom value (e.g. 12.5K gold, 92.5% silver) */}
              <div>
                <label className={lbl}>Purity ({category === 'gold' ? 'karat' : 'fineness'})</label>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {(category === 'gold'
                    ? [['24', '24K'], ['22', '22K'], ['18', '18K'], ['14', '14K']]
                    : category === 'platinum'
                    ? [['999', '999'], ['950', 'Pt 950'], ['900', '900']]
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
                <div><label className={lbl}>Value addition %</label><input className={fld} inputMode="decimal" value={valueAdd} onChange={e => setValueAdd(e.target.value)} /></div>
                <div><label className={lbl}>Making / gram</label><input className={fld} inputMode="decimal" value={makingG} onChange={e => setMakingG(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div><label className={lbl}>Certification</label><input className={fld} inputMode="decimal" value={certif} onChange={e => setCertif(e.target.value)} /></div>
                <div><label className={lbl}>Discount</label><input className={fld} inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
                <div><label className={lbl}>Tax %</label><input className={fld} inputMode="decimal" value={taxPct} onChange={e => setTaxPct(e.target.value)} /></div>
              </div>
              {/* Stones — repeatable list */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setShowStones(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text)' }}><Gem className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} /> Stones {stones.length > 0 && <span style={{ color: 'var(--text-faint)' }}>· {stones.length}</span>}</span>
                  <span className="text-[16px]" style={{ color: 'var(--text-faint)' }}>{showStones ? '−' : '+'}</span>
                </button>
                {showStones && (
                  <div className="px-3 pb-3 pt-2.5 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                    {stones.map((s, i) => (
                      <div key={i} className="rounded-lg p-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <select className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[12.5px]" value={s.type ?? ''} onChange={e => setStone(i, { type: e.target.value })}>
                            {STONE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <button type="button" onClick={() => setStones(st => st.filter((_, j) => j !== i))} className="text-[var(--expense)] p-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div><label className={lbl}>Weight (ct)</label><input className={fld} inputMode="decimal" value={s.weight_ct ?? ''} onChange={e => setStone(i, { weight_ct: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
                          <div><label className={lbl}>Cost</label><input className={fld} inputMode="decimal" value={s.cost ?? ''} onChange={e => setStone(i, { cost: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
                          <div><label className={lbl}>Value now</label><input className={fld} inputMode="decimal" value={s.present ?? ''} onChange={e => setStone(i, { present: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setStones(st => [...st, { type: STONE_TYPES[0] }])} className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--brand)' }}><Plus className="w-4 h-4" /> Add stone</button>
                    <p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Each stone’s cost adds to the total; “Value now” is its current worth used for gain. The metal is valued live from the market rate.</p>
                  </div>
                )}
              </div>
              <div><label className={lbl}>Purchased</label><input type="date" className={fld} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
            </>}

            {isLand && <>
              <div><label className={lbl}>Location</label><input className={fld} value={location} onChange={e => setLocation(e.target.value)} placeholder="Address / survey no. / area" /></div>
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
              <div><label className={lbl}>Location</label><input className={fld} value={location} onChange={e => setLocation(e.target.value)} placeholder="Address / survey no. / area" /></div>
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

            {isRate && <>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={lbl}>Cost</label><input className={fld} inputMode="decimal" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} /></div>
                <div><label className={lbl}>Purchase date</label><input type="date" className={fld} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Change /yr</span>
                  <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {(['default', 'override', 'manual'] as const).map(mm => (
                      <button key={mm} type="button" onClick={() => setAppMode(mm)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md capitalize"
                        style={appMode === mm ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--text-muted)' }}>{mm === 'manual' ? 'Manual ₹' : mm}</button>
                    ))}
                  </div>
                </div>
                {appMode === 'default' && <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Uses this subcategory’s rate from the Rates tab (+ appreciates, − depreciates).</p>}
                {appMode === 'override' && <input className="num w-full bg-[var(--surface)] border-[1.5px] border-[var(--brand)] rounded-[9px] px-3 py-2 text-[13px] font-bold" placeholder="e.g. −25 or 8" value={overrideRate} onChange={e => setOverrideRate(e.target.value)} inputMode="decimal" style={{ color: 'var(--text)' }} />}
                {appMode === 'manual' && <input className="num w-full bg-[var(--surface)] border-[1.5px] border-[var(--brand)] rounded-[9px] px-3 py-2 text-[13px] font-bold" placeholder="Current value ₹" value={manualValue} onChange={e => setManualValue(e.target.value)} inputMode="decimal" style={{ color: 'var(--text)' }} />}
              </div>
            </>}

            {/* Documents — repeatable (parent doc, patta, chitta, …) */}
            <div {...docDrop.dropProps} className="rounded-xl overflow-hidden transition-all" style={{ border: docDrop.dragOver ? '1px dashed var(--brand)' : '1px solid var(--border)', background: docDrop.dragOver ? 'var(--brand-light)' : undefined }}>
              <div className="flex items-center justify-between px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text)' }}><FileText className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} /> Documents {documents.length > 0 && <span style={{ color: 'var(--text-faint)' }}>· {documents.length}</span>}</span>
                <button type="button" onClick={() => docRef.current?.click()} className="flex items-center gap-1 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>{uploadingDoc ? 'Uploading…' : docDrop.dragOver ? 'Drop file' : <><Plus className="w-3.5 h-3.5" /> Add</>}</button>
                <input ref={docRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => uploadDoc(e.target.files?.[0])} />
              </div>
              {documents.length > 0 && (
                <div className="px-3 py-2 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                  {documents.map((dc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[12px]" value={dc.type ?? ''} onChange={e => setDocuments(dl => dl.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <a href={dc.url} target="_blank" rel="noreferrer" className="text-[11px] truncate max-w-[100px]" style={{ color: 'var(--text-muted)' }}>{dc.name || 'file'}</a>
                      <button type="button" onClick={() => setDocuments(dl => dl.filter((_, j) => j !== i))} className="text-[var(--expense)] p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
