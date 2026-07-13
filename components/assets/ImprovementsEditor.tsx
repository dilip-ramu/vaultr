'use client'

// Things you did to the asset after you bought it.
//
// The date field is the one that matters. A house built last year on land you
// bought in 2019 depreciates from LAST YEAR — not from 2019. Getting that wrong
// doesn't look like a bug; it looks like a loss you never took. So the date is
// required, it's labelled "finished", and the row tells you how old the app
// thinks the thing is, so a mistake is visible rather than merely wrong.

import { useState } from 'react'
import { Plus, Trash2, Hammer } from 'lucide-react'
import {
  improvementValue, improvementsCost, improvementsValue, yearsSince,
  validateImprovement, type Improvement, type ImprovementKind,
} from '@/lib/assets/improvements'
import { inr } from '@/lib/assets/valuation'
import { notify } from '@/components/shared/Toast'

const KINDS: { key: ImprovementKind; label: string; hint: string }[] = [
  { key: 'depreciate', label: 'Loses value', hint: 'a structure, fittings, machinery' },
  { key: 'appreciate', label: 'Gains value', hint: 'an extra floor, a well, land filled' },
  { key: 'flat', label: 'Holds value', hint: 'survey, legal fees — worth what it cost' },
]

const DEFAULT_RATE: Record<ImprovementKind, number> = {
  depreciate: 2,
  appreciate: 5,
  flat: 0,
}

export default function ImprovementsEditor({
  value, onChange,
}: {
  value: Improvement[]
  onChange: (imps: Improvement[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [cost, setCost] = useState('')
  const [kind, setKind] = useState<ImprovementKind>('depreciate')
  const [rate, setRate] = useState('2')

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lbl = 'text-[11px] font-bold block mb-1'

  function reset() {
    setAdding(false); setName(''); setDate(''); setCost(''); setKind('depreciate'); setRate('2')
  }

  function add() {
    const imp: Improvement = {
      id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      date,
      cost: parseFloat(cost) || 0,
      kind,
      rate_pct: kind === 'flat' ? 0 : Math.abs(parseFloat(rate) || 0),
    }
    const check = validateImprovement(imp)
    if (!check.ok) { notify(check.errors[0], 'error'); return }

    onChange([...value, imp])
    reset()
  }

  const remove = (id: string) => onChange(value.filter(i => i.id !== id))

  const totalCost = improvementsCost(value)
  const totalValue = improvementsValue(value)

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>
            <Hammer className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
            Improvements {value.length > 0 && <span style={{ color: 'var(--text-faint)' }}>· {value.length}</span>}
          </span>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
            Built or added after you bought it. Each one is valued from the day it was finished.
          </p>
        </div>
        <button type="button" onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-lg shrink-0"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Existing ones */}
      {value.length > 0 && (
        <div className="mt-3 space-y-1">
          {value.map(i => {
            const now = improvementValue(i)
            const age = yearsSince(i.date)
            const gain = now - i.cost
            return (
              <div key={i.id} className="flex items-center gap-2.5 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{i.name}</p>
                  {/* The age is spelled out on purpose: if this says "7 years" for a
                      house you built last year, you've put the wrong date in, and
                      you can see it here instead of wondering why the value is off. */}
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                    {i.date} · {age < 1 ? `${Math.round(age * 12)} months old` : `${age.toFixed(1)} years old`}
                    {i.kind !== 'flat' && ` · ${i.kind === 'appreciate' ? '+' : '−'}${i.rate_pct}%/yr`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12.5px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{inr(now)}</p>
                  <p className="text-[10.5px] tabular-nums" style={{ color: gain >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                    {gain >= 0 ? '+' : '−'}{inr(Math.abs(gain))} on {inr(i.cost)}
                  </p>
                </div>
                <button type="button" onClick={() => remove(i.id)} className="p-1 shrink-0" style={{ color: 'var(--text-faint)' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}

          <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-[11.5px] font-bold" style={{ color: 'var(--text-muted)' }}>Total</span>
            <span className="text-[12.5px] font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>
              {inr(totalValue)} <span className="font-semibold" style={{ color: 'var(--text-faint)' }}>on {inr(totalCost)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Add one */}
      {adding && (
        <div className="mt-3 space-y-2.5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>What did you add?</label>
            <input className={fld} style={fldStyle} value={name} onChange={e => setName(e.target.value)}
              placeholder="House, compound wall, borewell, renovation" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              {/* NOT the asset's purchase date. That distinction is the entire
                  reason this feature exists, so the label says it out loud. */}
              <label className={lbl} style={{ color: 'var(--text-muted)' }}>When was it finished?</label>
              <input className={fld} style={fldStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className={lbl} style={{ color: 'var(--text-muted)' }}>What did it cost?</label>
              <input className={fld} style={fldStyle} inputMode="decimal" value={cost}
                onChange={e => setCost(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="4000000" />
            </div>
          </div>

          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Over time it…</label>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(k => {
                const active = kind === k.key
                return (
                  <button key={k.key} type="button"
                    onClick={() => { setKind(k.key); setRate(String(DEFAULT_RATE[k.key])) }}
                    className="px-2 py-2 rounded-xl text-[11.5px] font-semibold border text-left"
                    style={{
                      borderColor: active ? 'var(--brand)' : 'var(--border)',
                      background: active ? 'var(--brand-light)' : 'var(--surface-2)',
                      color: active ? 'var(--brand)' : 'var(--text-muted)',
                    }}>
                    {k.label}
                    <span className="block text-[10px] font-normal mt-0.5" style={{ color: 'var(--text-faint)' }}>{k.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {kind !== 'flat' && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-muted)' }}>
                {kind === 'appreciate' ? 'Gains' : 'Loses'} how much per year?
              </label>
              <div className="relative w-28">
                <input className={`${fld} pr-7`} style={fldStyle} inputMode="decimal" value={rate}
                  onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ''))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>%</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={add}
              className="flex-1 text-white text-sm font-bold py-2.5 rounded-xl" style={{ background: 'var(--brand)' }}>
              Add
            </button>
            <button type="button" onClick={reset}
              className="px-4 text-sm font-semibold rounded-xl"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
