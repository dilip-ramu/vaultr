'use client'

// Investments — Holdings. Add/seed holdings, see each with its live value and
// AI rating, and run a full AI analysis on demand. Analysis researches current
// fundamentals + news, scores transparently, applies portfolio-aware judgement,
// and writes an immutable recommendation to the journal — then shows it here.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useToast } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import RecommendationCard from './RecommendationCard'
import {
  Card, ActionChip, ThesisChip, inr, inr2, priceAge, postJSON, del,
  type HoldingRow, type RecRow,
} from './shared'

interface Props { holdings: HoldingRow[]; recs: RecRow[] }

export default function HoldingsClient({ holdings, recs }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const recMap = new Map(recs.map(r => [`${r.symbol.toUpperCase()}:${r.exchange}`, r]))

  const [selected, setSelected] = useState<HoldingRow | null>(holdings[0] ?? null)
  const [shownRec, setShownRec] = useState<RecRow | null>(selected ? recMap.get(`${selected.symbol.toUpperCase()}:${selected.exchange}`) ?? null : null)
  const [analyzing, setAnalyzing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const select = (h: HoldingRow) => {
    setSelected(h)
    setShownRec(recMap.get(`${h.symbol.toUpperCase()}:${h.exchange}`) ?? null)
  }

  const analyze = async (h: HoldingRow) => {
    setAnalyzing(true)
    try {
      const r = await postJSON<{ recommendation: RecRow }>('/api/investments/analyze', {
        symbol: h.symbol, exchange: h.exchange, company_name: h.company_name, is_holding: true,
      })
      setShownRec(r.recommendation)
      showToast(`Analysed ${h.symbol}: ${r.recommendation.action.replace(/_/g, ' ')}`, 'success')
      router.refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Analysis failed', 'error')
    } finally { setAnalyzing(false) }
  }

  const remove = async (h: HoldingRow) => {
    if (!(await confirmDialog({ title: 'Remove holding', message: `Remove ${h.symbol} from your investment ledger? Past recommendations stay in the journal.`, danger: true, confirmLabel: 'Remove' }))) return
    try { await del(`/api/investments/holdings/${h.id}`); showToast('Removed', 'success'); setSelected(null); router.refresh() }
    catch { showToast('Could not remove', 'error') }
  }

  return (
    <div className="px-4 md:px-8 py-5 max-w-[1300px]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[20px] font-extrabold" style={{ color: 'var(--text)' }}>Holdings</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg" style={{ background: 'var(--brand)', color: '#fff' }}>
          <Plus className="w-3.5 h-3.5" /> Add holding
        </button>
      </div>

      {holdings.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>No holdings yet</p>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>Add one here, or use “Import from Assets” on the Overview tab.</p>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[380px_1fr] gap-4">
          {/* List */}
          <div className="space-y-2">
            {holdings.map(h => {
              const age = priceAge(h.last_price_at)
              const value = h.last_price != null ? h.last_price * h.quantity : null
              const isSel = selected?.id === h.id
              return (
                <button key={h.id} onClick={() => select(h)} className="w-full text-left rounded-xl p-3 transition tap-scale"
                  style={{ background: 'var(--surface)', border: `1px solid ${isSel ? 'var(--brand)' : 'var(--border)'}` }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>{h.symbol}</span>
                        <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>{h.exchange}</span>
                      </div>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{h.quantity} @ {inr2(h.avg_cost)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value != null ? inr(value) : '—'}</p>
                      <p className="text-[10px]" style={{ color: age.stale ? 'var(--amber)' : 'var(--text-faint)' }}>{age.text}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    {h.ai_rating ? <ActionChip action={h.ai_rating} /> : <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>Not analysed</span>}
                    <ThesisChip status={h.thesis_status} />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail */}
          <div>
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="text-[16px] font-extrabold" style={{ color: 'var(--text)' }}>{selected.symbol} · {selected.company_name || selected.exchange}</h2>
                    {selected.thesis && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{selected.thesis}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => analyze(selected)} disabled={analyzing} className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--brand)', color: '#fff' }}>
                      <Sparkles className={`w-3.5 h-3.5 ${analyzing ? 'animate-pulse' : ''}`} /> {analyzing ? 'Researching…' : shownRec ? 'Re-analyse' : 'Analyse'}
                    </button>
                    <button onClick={() => remove(selected)} className="p-2 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--expense)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {analyzing && (
                  <Card className="p-4"><p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Researching current fundamentals, valuation, and news, then scoring and checking it against your portfolio. This can take up to a minute.</p></Card>
                )}
                {!analyzing && shownRec && <RecommendationCard rec={shownRec} />}
                {!analyzing && !shownRec && (
                  <Card className="p-6 text-center">
                    <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>No analysis yet</p>
                    <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>Run an analysis to get a recommendation with entry range, fair value, the bull/bear cases, and what would change the thesis.</p>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="p-6 text-center"><p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Select a holding to see its analysis.</p></Card>
            )}
          </div>
        </div>
      )}

      {showAdd && <AddHolding onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); router.refresh() }} />}
    </div>
  )
}

function AddHolding({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast()
  const [f, setF] = useState({ symbol: '', exchange: 'NSE', quantity: '', avg_cost: '', company_name: '', sector: '', thesis: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    if (!f.symbol.trim()) { showToast('Enter a ticker symbol', 'error'); return }
    setSaving(true)
    try {
      await postJSON('/api/investments/holdings', {
        op: 'create', symbol: f.symbol, exchange: f.exchange,
        quantity: Number(f.quantity) || 0, avg_cost: Number(f.avg_cost) || 0,
        company_name: f.company_name || null, sector: f.sector || null, thesis: f.thesis || null,
      })
      showToast('Holding added', 'success'); onSaved()
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not add', 'error') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl slide-up" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Add holding</p>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <Field label="Ticker" value={f.symbol} onChange={v => set('symbol', v.toUpperCase())} placeholder="RELIANCE" />
            <div>
              <label className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>Exchange</label>
              <select value={f.exchange} onChange={e => set('exchange', e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-[14px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="NSE">NSE</option><option value="BSE">BSE</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantity" value={f.quantity} onChange={v => set('quantity', v)} placeholder="100" type="number" />
            <Field label="Avg cost" value={f.avg_cost} onChange={v => set('avg_cost', v)} placeholder="2400" type="number" />
          </div>
          <Field label="Company (optional)" value={f.company_name} onChange={v => set('company_name', v)} placeholder="Reliance Industries" />
          <Field label="Sector (optional)" value={f.sector} onChange={v => set('sector', v)} placeholder="Energy" />
          <Field label="Your thesis (optional)" value={f.thesis} onChange={v => set('thesis', v)} placeholder="Why you own it" />
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[12.5px] font-bold" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-[12.5px] font-bold text-white disabled:opacity-60" style={{ background: 'var(--brand)' }}>{saving ? 'Saving…' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type={type} inputMode={type === 'number' ? 'decimal' : undefined} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-1 px-3 py-2 rounded-lg text-[14px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
    </div>
  )
}
