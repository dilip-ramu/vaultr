'use client'

// This expense went INTO something you already own.
//
// You own the land. You spent ₹3L on cement. That cement is not a new asset —
// you can't sell it — and it is not really an expense either, because the money
// is still there, standing in the field as a wall. It's an improvement to the
// land.
//
// Two ways it lands:
//   • onto an EXISTING improvement (the fourth cement bill for the house)
//   • as a NEW improvement (the first one)
//
// Either way the transaction id is recorded against it, so the app can later tell
// you "you've tagged ₹38L of bills against a ₹40L building" — and, more to the
// point, when those two DON'T agree, say so instead of quietly trusting whichever
// number you typed.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Hammer } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { inr } from '@/lib/assets/valuation'
import {
  validateImprovement, improvementsCost,
  type Improvement, type ImprovementKind,
} from '@/lib/assets/improvements'
import type { Asset } from '@/lib/assets/types'

interface Txn { id: string; name: string | null; amount: number; date: string; notes?: string | null }

export default function AddToAssetModal({
  transaction, onSaved, onClose,
}: {
  transaction: Txn
  onSaved: (assetName: string, improvementName: string) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetId, setAssetId] = useState('')
  const [impId, setImpId] = useState('__new')
  const [saving, setSaving] = useState(false)

  // New-improvement fields
  const [name, setName] = useState(transaction.name?.trim() || '')
  const [date, setDate] = useState(transaction.date)
  const [kind, setKind] = useState<ImprovementKind>('depreciate')
  const [rate, setRate] = useState('2')

  useEffect(() => {
    const sb = createClient()
    sb.from('assets').select('*').eq('status', 'held').order('name')
      .then(({ data }) => setAssets((data ?? []) as Asset[]))
  }, [])

  const asset = assets.find(a => a.id === assetId)
  const existing: Improvement[] = Array.isArray((asset?.details as { improvements?: Improvement[] })?.improvements)
    ? (asset!.details as { improvements: Improvement[] }).improvements
    : []

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lbl = 'text-[11px] font-bold block mb-1'

  async function save() {
    if (!asset) { notify('Pick the asset this went into.', 'error'); return }
    setSaving(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { notify('Not signed in', 'error'); return }

      const details = { ...(asset.details ?? {}) } as Record<string, unknown>
      let improvements = [...existing]
      let touched: string

      if (impId === '__new') {
        const imp: Improvement = {
          id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim(),
          // The improvement's OWN date — when the thing was finished. Defaulted to
          // the transaction's date, which is usually right for a single bill and
          // which you can change when it isn't.
          date,
          cost: transaction.amount,
          kind,
          rate_pct: kind === 'flat' ? 0 : Math.abs(parseFloat(rate) || 0),
          transaction_ids: [transaction.id],
        }
        const check = validateImprovement(imp)
        if (!check.ok) { notify(check.errors[0], 'error'); return }

        improvements.push(imp)
        touched = imp.name
      } else {
        // Adding to one that exists: the bill increases its cost, and the id is
        // recorded so the same transaction can't be counted twice.
        improvements = improvements.map(i => {
          if (i.id !== impId) return i
          const ids = i.transaction_ids ?? []
          if (ids.includes(transaction.id)) return i          // already on it — no double count
          return {
            ...i,
            cost: Math.round((i.cost + transaction.amount) * 100) / 100,
            transaction_ids: [...ids, transaction.id],
          }
        })
        touched = improvements.find(i => i.id === impId)?.name ?? 'improvement'
      }

      details.improvements = improvements

      const { error } = await sb.from('assets')
        .update({ details })
        .eq('id', asset.id).eq('user_id', user.id)

      if (error) { notify(error.message, 'error'); return }

      notify(`Added ${inr(transaction.amount)} to ${touched}`, 'success')
      onSaved(asset.name, touched)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--surface)' }}>

        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Add to an asset</p>
            <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
              {inr(transaction.amount)} — money that went into something you already own
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3 mt-4">
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Which asset?</label>
            <select className={fld} style={fldStyle} value={assetId}
              onChange={e => { setAssetId(e.target.value); setImpId('__new') }}>
              <option value="">Choose…</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {asset && (
            <>
              <div>
                <label className={lbl} style={{ color: 'var(--text-muted)' }}>Part of what?</label>
                <select className={fld} style={fldStyle} value={impId} onChange={e => setImpId(e.target.value)}>
                  {existing.map(i => (
                    <option key={i.id} value={i.id}>{i.name} — {inr(i.cost)} so far</option>
                  ))}
                  <option value="__new">＋ Something new…</option>
                </select>
                {existing.length > 0 && impId !== '__new' && (
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
                    This bill is added to its cost — {inr((existing.find(i => i.id === impId)?.cost ?? 0) + transaction.amount)} in total.
                  </p>
                )}
              </div>

              {impId === '__new' && (
                <>
                  <div>
                    <label className={lbl} style={{ color: 'var(--text-muted)' }}>What is it?</label>
                    <input className={fld} style={fldStyle} value={name} onChange={e => setName(e.target.value)}
                      placeholder="House, compound wall, renovation" />
                  </div>

                  <div>
                    {/* Defaulted to the transaction date, but it is the day the THING
                        was finished that decides its value — and a cement bill in
                        March is not a house finished in March. */}
                    <label className={lbl} style={{ color: 'var(--text-muted)' }}>When was it finished?</label>
                    <input className={fld} style={fldStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
                      Its value is measured from this day — not from when you bought {asset.name}.
                    </p>
                  </div>

                  <div>
                    <label className={lbl} style={{ color: 'var(--text-muted)' }}>Over time it…</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['depreciate', 'Loses value'],
                        ['appreciate', 'Gains value'],
                        ['flat', 'Holds value'],
                      ] as [ImprovementKind, string][]).map(([k, label]) => {
                        const active = kind === k
                        return (
                          <button key={k} type="button"
                            onClick={() => { setKind(k); setRate(k === 'flat' ? '0' : k === 'appreciate' ? '5' : '2') }}
                            className="px-2 py-2 rounded-xl text-[11.5px] font-semibold border"
                            style={{
                              borderColor: active ? 'var(--brand)' : 'var(--border)',
                              background: active ? 'var(--brand-light)' : 'var(--surface-2)',
                              color: active ? 'var(--brand)' : 'var(--text-muted)',
                            }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {kind !== 'flat' && (
                    <div>
                      <label className={lbl} style={{ color: 'var(--text-muted)' }}>
                        {kind === 'appreciate' ? 'Gains' : 'Loses'} %/yr
                      </label>
                      <div className="relative w-28">
                        <input className={`${fld} pr-7`} style={fldStyle} inputMode="decimal" value={rate}
                          onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ''))} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>%</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* What this does to the asset, before you commit to it. */}
              <div className="rounded-xl px-3.5 py-3 flex items-start gap-2.5" style={{ background: 'var(--brand-light)' }}>
                <Hammer className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--brand)' }} />
                <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {asset.name} will have {inr(improvementsCost(existing) + transaction.amount)} of improvements against it.
                  The expense stays in your books — this records where the money went.
                </p>
              </div>
            </>
          )}

          <button onClick={save} disabled={!asset || saving}
            className="w-full text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {saving ? 'Saving…' : 'Add to asset'}
          </button>
        </div>
      </div>
    </div>
  )
}
