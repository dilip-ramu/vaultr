'use client'

import { Plus, Trash2, Box, AlertTriangle, Check } from 'lucide-react'
import {
  reconcilePacking, remainingByKey, suggestCartons, describePack,
  piecesPerCarton, packPieces, packKey,
  type Pack, type PackKind, type OrderedPiece,
} from '@/lib/orders/packing'

/** A style on the form. New lines have no database id yet, so packing refers
 *  to the form's own key and the ids are filled in on save. */
export interface PackLine {
  key: number
  name: string
  /** Size labels this style has, in the order they were entered. */
  sizes: string[]
  /** Quantity per size, or under '' when the style has no breakdown. */
  qtyBySize: Record<string, number>
}

export interface PackDraftContent { lineKey: number; size: string; qty: string }
export interface PackDraft {
  key: number
  packId?: string
  kind: PackKind
  contents: PackDraftContent[]
  setsPerCarton: string
  cartons: string
}

interface Props {
  lines: PackLine[]
  packs: PackDraft[]
  onChange: (packs: PackDraft[]) => void
  nextKey: () => number
}

const n = (v: string) => parseFloat(v) || 0
const iStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }
const sel = 'px-2 py-1.5 rounded-lg border text-sm'

/** The form's drafts in the shape the engine reads. Keys stand in for ids. */
const toPack = (d: PackDraft): Pack => ({
  kind: d.kind,
  setsPerCarton: n(d.setsPerCarton) || 1,
  cartons: n(d.cartons),
  contents: d.contents
    .filter(c => c.lineKey > 0)
    .map(c => ({ lineId: String(c.lineKey), size: c.size, qty: n(c.qty) })),
})

export default function PackingSection({ lines, packs, onChange, nextKey }: Props) {
  const nameOf = (lineId: string) => lines.find(l => String(l.key) === lineId)?.name || 'Untitled style'

  const ordered: OrderedPiece[] = []
  for (const l of lines) {
    const sizes = l.sizes.length ? l.sizes : ['']
    for (const size of sizes) ordered.push({ lineId: String(l.key), size, qty: l.qtyBySize[size] ?? 0 })
  }

  const asPacks = packs.map(toPack)
  const r = reconcilePacking(ordered, asPacks)
  const left = remainingByKey(ordered, asPacks)

  const set = (pk: number, patch: Partial<PackDraft>) =>
    onChange(packs.map(p => p.key === pk ? { ...p, ...patch } : p))
  const setContent = (pk: number, i: number, patch: Partial<PackDraftContent>) =>
    onChange(packs.map(p => p.key === pk
      ? { ...p, contents: p.contents.map((c, j) => j === i ? { ...c, ...patch } : c) }
      : p))

  function addPack(kind: PackKind) {
    const first = lines[0]
    onChange([...packs, {
      key: nextKey(), kind, setsPerCarton: '1', cartons: '',
      contents: [{ lineKey: first?.key ?? 0, size: first?.sizes[0] ?? '', qty: kind === 'solid' ? '' : '1' }],
    }])
  }

  if (!lines.length) {
    return (
      <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Packing</h2>
        <p className="text-[12px] mt-1" style={{ color: 'var(--text-faint)' }}>Add a style above first.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Packing</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            What goes in a carton. A solid carton holds one style in one size; an assorted carton holds a mix,
            and the mix can span two styles. Add as many as the order needs — part solid and part assorted is normal.
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => addPack('solid')} className="flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}>
            <Plus className="w-3.5 h-3.5" /> Solid
          </button>
          <button onClick={() => addPack('assort')} className="flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}>
            <Plus className="w-3.5 h-3.5" /> Assorted
          </button>
        </div>
      </div>

      {packs.length === 0 ? (
        <p className="text-[13px] py-3" style={{ color: 'var(--text-faint)' }}>
          Nothing set. The purchase order will give sizes and quantities but not say how to box them.
        </p>
      ) : (
        <div className="space-y-3">
          {packs.map((p, idx) => {
            const asPack = toPack(p)
            const per = piecesPerCarton(asPack)
            const fill = suggestCartons(asPack, left)
            return (
              <div key={p.key} className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
                    <select value={p.kind} onChange={e => set(p.key, { kind: e.target.value as PackKind })} className={sel} style={iStyle}>
                      <option value="solid">Solid carton</option>
                      <option value="assort">Assorted carton</option>
                    </select>
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>#{idx + 1}</span>
                  </div>
                  <button onClick={() => onChange(packs.filter(x => x.key !== p.key))}
                    className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Remove pack">
                    <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
                  </button>
                </div>

                {/* What is in ONE set */}
                <div className="space-y-1.5">
                  {p.contents.map((c, i) => {
                    const line = lines.find(l => l.key === c.lineKey)
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-1.5">
                        <select value={c.lineKey} className={`${sel} flex-1 min-w-[9rem]`} style={iStyle}
                          onChange={e => {
                            const lk = Number(e.target.value)
                            const nl = lines.find(l => l.key === lk)
                            setContent(p.key, i, { lineKey: lk, size: nl?.sizes[0] ?? '' })
                          }}>
                          {lines.map(l => <option key={l.key} value={l.key}>{l.name || 'Untitled style'}</option>)}
                        </select>
                        <select value={c.size} onChange={e => setContent(p.key, i, { size: e.target.value })}
                          className={`${sel} w-24`} style={iStyle} disabled={!line?.sizes.length}>
                          {line?.sizes.length
                            ? line.sizes.map(s => <option key={s} value={s}>{s}</option>)
                            : <option value="">no sizes</option>}
                        </select>
                        <input value={c.qty} onChange={e => setContent(p.key, i, { qty: e.target.value })}
                          inputMode="decimal" placeholder="pcs"
                          className={`${sel} w-20 text-right`} style={iStyle} />
                        {p.contents.length > 1 && (
                          <button onClick={() => set(p.key, { contents: p.contents.filter((_, j) => j !== i) })}
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface)' }} aria-label="Remove">
                            <Trash2 className="w-3 h-3 text-[var(--expense)]" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {p.kind === 'assort' && (
                    <button
                      onClick={() => set(p.key, { contents: [...p.contents, { lineKey: lines[0].key, size: lines[0].sizes[0] ?? '', qty: '1' }] })}
                      className="text-[12px] font-bold inline-flex items-center gap-1" style={{ color: 'var(--brand)' }}>
                      <Plus className="w-3.5 h-3.5" /> Add to this carton
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-3 pt-1">
                  {p.kind === 'assort' && (
                    <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Sets per carton
                      <input value={p.setsPerCarton} onChange={e => set(p.key, { setsPerCarton: e.target.value })}
                        inputMode="decimal" className={`${sel} block mt-1 w-24`} style={iStyle} />
                    </label>
                  )}
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Cartons
                    <input value={p.cartons} onChange={e => set(p.key, { cartons: e.target.value })}
                      inputMode="decimal" className={`${sel} block mt-1 w-24`} style={iStyle} />
                  </label>
                  {fill > 0 && String(fill) !== p.cartons && (
                    <button onClick={() => set(p.key, { cartons: String(fill) })}
                      className="text-[12px] font-bold pb-1.5" style={{ color: 'var(--brand)' }}>
                      Fill the rest ({fill})
                    </button>
                  )}
                  <span className="text-[12px] pb-1.5" style={{ color: 'var(--text-muted)' }}>
                    {per} pcs/ctn · <b style={{ color: 'var(--text)' }}>{packPieces(asPack)} pcs</b>
                  </span>
                </div>

                {/* Exactly what the supplier will read. */}
                {describePack(asPack, nameOf) && (
                  <p className="text-[11.5px] pt-1" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
                    On the purchase order: {describePack(asPack, nameOf)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Does it add up? */}
      {packs.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: r.balanced ? '#DCFCE7' : r.over.length ? '#FEE2E2' : 'var(--surface-2)' }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]"
            style={{ color: r.balanced ? '#14532D' : r.over.length ? '#991B1B' : 'var(--text-muted)' }}>
            {r.balanced
              ? <span className="font-bold inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Every piece is packed</span>
              : <span className="font-bold">{r.packedTotal} of {r.orderedTotal} pcs packed</span>}
            <span>{r.cartons} carton{r.cartons === 1 ? '' : 's'}</span>
          </div>

          {r.short.length > 0 && (
            <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Still to pack: {r.short.map(d => `${nameOf(d.lineId)}${d.size ? ` ${d.size}` : ''} ${d.difference}`).join(' · ')}
            </p>
          )}
          {r.over.length > 0 && (
            <p className="text-[12px] mt-1.5 font-semibold" style={{ color: '#991B1B' }}>
              Packed more than ordered: {r.over.map(d => `${nameOf(d.lineId)}${d.size ? ` ${d.size}` : ''} +${-d.difference}`).join(' · ')}
            </p>
          )}
          {r.problems.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {r.problems.map((x, i) => (
                <p key={i} className="text-[12px] inline-flex items-center gap-1.5" style={{ color: '#92400E' }}>
                  <AlertTriangle className="w-3.5 h-3.5" /> {x}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Keys back to database ids, once the lines have been saved. */
export function packsForSave(
  packs: PackDraft[], idByKey: Map<number, string>,
): { packId?: string; kind: PackKind; contents: { line_id: string; size: string; qty: number }[]; sets_per_carton: number; cartons: number }[] {
  return packs.map(p => ({
    packId: p.packId,
    kind: p.kind,
    sets_per_carton: n(p.setsPerCarton) || 1,
    cartons: n(p.cartons),
    // A content row whose line was deleted is dropped rather than saved
    // pointing at nothing.
    contents: p.contents
      .map(c => ({ line_id: idByKey.get(c.lineKey) ?? '', size: c.size, qty: n(c.qty) }))
      .filter(c => c.line_id && c.qty > 0),
  })).filter(p => p.contents.length > 0)
}
