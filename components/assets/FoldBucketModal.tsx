'use client'

// Folding a finished construction onto the asset it became.
//
// The bucket has been filling up bill by bill. The work is done, so the spend
// stops being work-in-progress: it lands on another asset as ONE improvement,
// dated the day the work finished, and the bucket reads zero again — ready for
// the next project, whose total is its own figure from the start.
//
// The amount is not typed. It is whatever the bills come to, which is the whole
// point: there is one figure, not two, so there is nothing to reconcile.
//
// The arithmetic and the checks are in lib/assets/construction.ts.

import { useState } from 'react'
import { X, Layers } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { useRouter } from 'next/navigation'
import { inr } from '@/lib/assets/valuation'
import { foldProblem, bucketWords, type Bucket, type FoldKind } from '@/lib/assets/construction'

export default function FoldBucketModal({
  sourceAsset, bucket, targets, onClose, onFolded,
}: {
  sourceAsset: { id: string; name: string }
  bucket: Bucket
  targets: { id: string; name: string }[]
  onClose: () => void
  onFolded: () => void
}) {
  const router = useRouter()
  const [targetId, setTargetId] = useState('')
  const [name, setName] = useState('')
  const [completedOn, setCompletedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [kind, setKind] = useState<FoldKind>('flat')
  const [ratePct, setRatePct] = useState('')
  const [busy, setBusy] = useState(false)

  const req = {
    sourceAssetId: sourceAsset.id,
    targetAssetId: targetId,
    improvementName: name,
    completedOn,
    kind,
    ratePct: ratePct === '' ? null : Number(ratePct),
  }
  const problem = foldProblem(bucket, req)

  async function fold() {
    if (problem) { notify(problem, 'info'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/assets/fold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not fold it', 'error'); return }
      notify(`${inr(bucket.amount)} folded into ${targets.find(t => t.id === targetId)?.name ?? 'the asset'}`, 'success')
      onFolded()
      router.refresh()
    } catch {
      notify('Network error', 'error')
    } finally {
      setBusy(false)
    }
  }

  const label = 'text-[11px] font-semibold'
  const labelStyle = { color: 'var(--text-muted)' }
  const field = 'w-full px-3 py-2 rounded-lg border text-sm mt-1'
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-[15px] font-extrabold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Layers className="w-4 h-4" /> Fold {sourceAsset.name}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[17px] font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{inr(bucket.amount)}</p>
            <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{bucketWords(bucket)}</p>
            <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
              This whole amount moves across as one improvement, and {sourceAsset.name} goes back to zero.
            </p>
          </div>

          <label className={label} style={labelStyle}>It becomes part of
            <select value={targetId} onChange={e => setTargetId(e.target.value)} className={field} style={fieldStyle}>
              <option value="">— pick an asset —</option>
              {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <label className={label} style={labelStyle}>What was built
            <input value={name} onChange={e => setName(e.target.value)} placeholder="House, second floor, compound wall"
              className={field} style={fieldStyle} />
          </label>

          <label className={label} style={labelStyle}>Finished on
            <input type="date" value={completedOn} onChange={e => setCompletedOn(e.target.value)} className={field} style={fieldStyle} />
            <span className="block mt-1 text-[10.5px] font-normal" style={{ color: 'var(--text-faint)' }}>
              Its own clock starts here, not when the first bill was paid.
            </span>
          </label>

          <label className={label} style={labelStyle}>From then on it is
            <select value={kind} onChange={e => setKind(e.target.value as FoldKind)} className={field} style={fieldStyle}>
              <option value="flat">worth what it cost</option>
              <option value="depreciate">losing value each year</option>
              <option value="appreciate">gaining value each year</option>
            </select>
          </label>

          {kind !== 'flat' && (
            <label className={label} style={labelStyle}>Rate (%/yr)
              <input value={ratePct} onChange={e => setRatePct(e.target.value)} inputMode="decimal" placeholder="5"
                className={field} style={fieldStyle} />
            </label>
          )}

          {problem && <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{problem}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="px-3.5 py-2 rounded-xl text-[13px] font-bold"
            style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Cancel</button>
          <button onClick={fold} disabled={busy || !!problem}
            className="px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {busy ? 'Folding…' : 'Fold it'}
          </button>
        </div>
      </div>
    </div>
  )
}
