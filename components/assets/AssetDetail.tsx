'use client'

import { useState } from 'react'
import { X, Pencil, Trash2, FileText, Paperclip, Image as ImageIcon, Download, ChevronLeft, ChevronRight, Tag } from 'lucide-react'
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
  onSaved: (a: Asset) => void
  onDeleted: (id: string) => void
  onClose: () => void
}

const GOLD_GRAD = 'linear-gradient(150deg,#8A6D1F,#5C4711)'

export default function AssetDetail({ asset, valuation, marketRates, defaults = [], fx = 1, onEdit, onSaved, onDeleted, onClose }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const isSold = asset.status === 'sold'
  const [soldOpen, setSoldOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [priceStr, setPriceStr] = useState(String(asset.sold_price ?? Math.round(valuation.current)))
  const [dateStr, setDateStr] = useState(asset.sold_date ?? new Date().toISOString().slice(0, 10))
  const realised = (asset.sold_price ?? 0) - valuation.cost
  const previewRealised = (Number(priceStr) || 0) - valuation.cost

  const saveSale = async (status: 'held' | 'sold') => {
    setSaving(true)
    const supabase = createClient()
    const patch = status === 'sold'
      ? { status: 'sold', sold_price: Number(priceStr) || 0, sold_date: dateStr }
      : { status: 'held', sold_price: null, sold_date: null }
    const { data, error } = await supabase.from('assets').update(patch).eq('id', asset.id).select().single()
    setSaving(false)
    if (error || !data) return
    setSoldOpen(false)
    onSaved(data as Asset)
  }
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
  const invoiceUrl = (asset.details as { invoice_url?: string }).invoice_url

  // Everything openable, in one list, for the lightbox + attachments strip.
  const isPdf = (u?: string, n?: string) => /\.pdf($|\?)/i.test(u || '') || /\.pdf$/i.test(n || '')
  const media: { url: string; name: string; label: string; kind: 'image' | 'pdf' }[] = []
  if (asset.photo_url) media.push({ url: asset.photo_url, name: `${asset.name} photo`, label: 'Photo', kind: 'image' })
  if (invoiceUrl) media.push({ url: invoiceUrl, name: 'Invoice', label: 'Invoice', kind: isPdf(invoiceUrl) ? 'pdf' : 'image' })
  for (const dc of docs) if (dc.url) media.push({ url: dc.url, name: dc.name || dc.type || 'Document', label: dc.type || 'Document', kind: isPdf(dc.url, dc.name) ? 'pdf' : 'image' })
  const lb = lightbox != null ? media[lightbox] : null

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
      <div className="relative bg-[var(--surface)] w-full md:w-1/3 md:min-w-[360px] md:h-full rounded-t-3xl md:rounded-none shadow-2xl slide-up max-h-[92vh] md:max-h-none overflow-hidden flex flex-col" style={{ borderLeft: '1px solid var(--border)' }}>
        {/* photo header */}
        <div className="relative shrink-0 flex items-center justify-center overflow-hidden" style={{ height: 220, background: isMarket ? GOLD_GRAD : 'linear-gradient(150deg,var(--brand-deep,#14432D),color-mix(in srgb,var(--brand-deep,#14432D) 70%,#000))' }}>
          {asset.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.photo_url} alt={asset.name} onClick={() => setLightbox(0)} className="absolute inset-0 w-full h-full object-cover cursor-zoom-in" />
          ) : <>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 30%,rgba(255,255,255,.16),transparent 60%)' }} />
            <span style={{ fontSize: 76, filter: 'drop-shadow(0 8px 20px rgba(0,0,0,.3))' }}>{emoji}</span>
          </>}
          {asset.photo_url && (
            <button onClick={() => setLightbox(0)} className="absolute top-3.5 left-3.5 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-white" style={{ background: 'rgba(0,0,0,.35)' }}><ImageIcon className="w-3.5 h-3.5" /> Open</button>
          )}
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
            <div className="flex-1 rounded-[15px] p-4" style={{ background: isSold ? (realised >= 0 ? 'var(--income)' : 'var(--expense)') : isMarket ? GOLD_GRAD : 'var(--brand)', color: '#fff' }}>
              <div className="flex items-center gap-1.5"><p className="text-[9.5px] font-extrabold tracking-wide" style={{ color: 'rgba(255,255,255,.7)' }}>{isSold ? 'SOLD FOR' : 'CURRENT VALUE'}</p>{!isSold && isMarket && <span className="text-[8px] font-bold px-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.2)' }}>LIVE</span>}</div>
              <p className="text-[24px] font-extrabold mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(isSold ? (asset.sold_price ?? 0) : valuation.current)}</p>
              {isSold ? <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,.8)' }}>Realised {realised >= 0 ? '+' : ''}{inr(realised)}{asset.sold_date ? ' · ' + new Date(asset.sold_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : ''}</p>
                : valuation.currentNote && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,.7)' }}>{valuation.currentNote}</p>}
            </div>
            <div className="flex-1 rounded-[15px] p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[9.5px] font-extrabold tracking-wide" style={{ color: 'var(--text-muted)' }}>COST BASIS</p>
              <p className="text-[24px] font-extrabold mt-1" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr(valuation.cost)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: (isSold ? realised : valuation.gain) >= 0 ? 'var(--income)' : 'var(--expense)' }}>{(isSold ? realised : valuation.gain) >= 0 ? '+' : ''}{inr(isSold ? realised : valuation.gain)}{isSold ? ' realised' : ' · ' + pctStr(valuation.returnPct)}</p>
            </div>
          </div>

          {/* sale / realised profit */}
          {isSold ? (
            <div className="flex items-center justify-between rounded-[14px] px-4 py-3 mb-5" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <span className="text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>Marked sold</span>
              </div>
              <button onClick={() => saveSale('held')} disabled={saving} className="text-[11.5px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{saving ? '…' : 'Mark as held'}</button>
            </div>
          ) : soldOpen ? (
            <div className="rounded-[15px] p-4 mb-5" style={{ border: '1px solid var(--border)' }}>
              <p className="text-[11px] font-extrabold tracking-wide mb-2.5" style={{ color: 'var(--text-muted)' }}>RECORD A SALE</p>
              <div className="flex gap-2.5">
                <div className="flex-1">
                  <label className="text-[10px] font-bold" style={{ color: 'var(--text-faint)' }}>Selling price (₹)</label>
                  <input inputMode="decimal" value={priceStr} onChange={e => setPriceStr(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full mt-1 rounded-[10px] px-3 py-2 text-[13px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold" style={{ color: 'var(--text-faint)' }}>Sold on</label>
                  <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="w-full mt-1 rounded-[10px] px-3 py-2 text-[13px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              </div>
              <p className="text-[11px] mt-2.5" style={{ color: 'var(--text-muted)' }}>Realised profit <span style={{ color: previewRealised >= 0 ? 'var(--income)' : 'var(--expense)', fontWeight: 800 }}>{previewRealised >= 0 ? '+' : ''}{inr(previewRealised)}</span> · cost {inr(valuation.cost)}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => saveSale('sold')} disabled={saving || !priceStr} className="flex-1 text-white rounded-[11px] py-2.5 text-[12.5px] font-bold disabled:opacity-60" style={{ background: 'var(--brand)' }}>{saving ? 'Saving…' : 'Confirm sale'}</button>
                <button onClick={() => setSoldOpen(false)} className="px-3.5 rounded-[11px] text-[12.5px] font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setSoldOpen(true)} className="w-full flex items-center justify-center gap-1.5 rounded-[12px] py-2.5 mb-5 text-[12.5px] font-bold" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}><Tag className="w-3.5 h-3.5" /> Mark as sold</button>
          )}

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

          {/* Attachments — photo, invoice and documents all open in the viewer */}
          {media.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide mt-5 mb-2.5" style={{ color: 'var(--text-muted)' }}><Paperclip className="w-3.5 h-3.5" /> ATTACHMENTS · {media.length}</p>
              <div className="space-y-1.5">
                {media.map((mm, i) => (
                  <button key={i} onClick={() => setLightbox(i)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left" style={{ background: 'var(--surface-2)' }}>
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: mm.kind === 'image' ? 'color-mix(in srgb, var(--transfer) 16%, transparent)' : 'color-mix(in srgb, var(--expense) 16%, transparent)' }}>
                      {mm.kind === 'image' ? <ImageIcon className="w-4 h-4" style={{ color: 'var(--transfer)' }} /> : <FileText className="w-4 h-4" style={{ color: 'var(--expense)' }} />}
                    </span>
                    <span className="text-[12.5px] font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>{mm.label}</span>
                    <span className="text-[11px] truncate max-w-[120px]" style={{ color: 'var(--text-faint)' }}>{mm.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-2 mt-6">
            <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 text-white rounded-[11px] py-2.5 text-[12.5px] font-bold" style={{ background: 'var(--brand)' }}><Pencil className="w-3.5 h-3.5" /> Edit asset</button>
            <button onClick={handleDelete} disabled={deleting} className="flex items-center justify-center rounded-[11px] px-3.5 disabled:opacity-60" style={{ background: 'var(--surface)', color: 'var(--expense)', border: '1px solid var(--border)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Lightbox for photo / invoice / documents */}
      {lb && (
        <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'rgba(0,0,0,.95)' }} onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.12)' }}><X className="w-5 h-5 text-white" /></button>
            <p className="text-white text-sm font-medium truncate flex-1 mx-4 text-center">{lb.label} · {lb.name}</p>
            <a href={lb.url} download target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.12)' }}><Download className="w-5 h-5 text-white" /></a>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden px-2" onClick={e => e.stopPropagation()}>
            {lb.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lb.url} alt={lb.name} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: 'calc(100dvh - 150px)' }} />
            ) : (
              <iframe src={lb.url} title={lb.name} className="w-full rounded-lg bg-white" style={{ height: 'calc(100dvh - 150px)', maxWidth: 900 }} />
            )}
          </div>
          {media.length > 1 && (
            <div className="flex items-center justify-center gap-6 py-4 shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => setLightbox(i => Math.max(0, (i ?? 0) - 1))} disabled={lightbox === 0} className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30" style={{ background: 'rgba(255,255,255,.12)' }}><ChevronLeft className="w-5 h-5 text-white" /></button>
              <span className="text-sm" style={{ color: 'rgba(255,255,255,.6)' }}>{(lightbox ?? 0) + 1} / {media.length}</span>
              <button onClick={() => setLightbox(i => Math.min(media.length - 1, (i ?? 0) + 1))} disabled={lightbox === media.length - 1} className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30" style={{ background: 'rgba(255,255,255,.12)' }}><ChevronRight className="w-5 h-5 text-white" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
