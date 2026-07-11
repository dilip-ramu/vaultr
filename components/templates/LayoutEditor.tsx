'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Type, Hash, Trash2, Save, RotateCcw, Loader2, Undo2, Redo2 } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { PAGE_W, PAGE_H, defaultLayout, fieldsForFormat, type DocLayout, type LayoutEl, type ElType } from '@/lib/documents/layout'
import type { LayoutContext } from '@/lib/documents/layoutContext'
import { ElementContent } from './LayoutRenderer'

const SCALE = 0.66
const SNAP = 6                     // snap threshold in canvas px
const MARGIN = 44                  // page margin guides
const uid = () => `el_${Math.random().toString(36).slice(2, 9)}`

const TITLES: Record<string, string> = {
  tax_invoice: 'TAX INVOICE', quotation: 'QUOTATION', proforma_gst: 'PROFORMA INVOICE', sales_order: 'SALES ORDER',
  delivery_challan: 'DELIVERY CHALLAN', credit_note: 'CREDIT NOTE', purchase_order: 'PURCHASE ORDER',
  debit_note: 'DEBIT NOTE', salary_slip: 'SALARY SLIP', reimbursable: 'INVOICE',
}

/** Snap a moving element against page guides and every other element's edges. */
function snap(el: LayoutEl, others: LayoutEl[], nx: number, ny: number) {
  const xs = [0, MARGIN, PAGE_W / 2, PAGE_W - MARGIN, PAGE_W]
  const ys = [0, MARGIN, PAGE_H / 2, PAGE_H - MARGIN, PAGE_H]
  for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h) }

  let x = nx, y = ny
  const gx: number[] = [], gy: number[] = []

  let bestX: { d: number; val: number; g: number } | null = null
  for (const e of [{ v: nx, off: 0 }, { v: nx + el.w / 2, off: el.w / 2 }, { v: nx + el.w, off: el.w }]) {
    for (const s of xs) { const d = Math.abs(e.v - s); if (d <= SNAP && (!bestX || d < bestX.d)) bestX = { d, val: s - e.off, g: s } }
  }
  if (bestX) { x = bestX.val; gx.push(bestX.g) }

  let bestY: { d: number; val: number; g: number } | null = null
  for (const e of [{ v: ny, off: 0 }, { v: ny + el.h / 2, off: el.h / 2 }, { v: ny + el.h, off: el.h }]) {
    for (const s of ys) { const d = Math.abs(e.v - s); if (d <= SNAP && (!bestY || d < bestY.d)) bestY = { d, val: s - e.off, g: s } }
  }
  if (bestY) { y = bestY.val; gy.push(bestY.g) }

  return { x, y, gx, gy }
}

/** Snap the right/bottom edge while resizing. */
function snapSize(el: LayoutEl, others: LayoutEl[], nw: number, nh: number) {
  const xs = [MARGIN, PAGE_W / 2, PAGE_W - MARGIN, PAGE_W]
  const ys = [MARGIN, PAGE_H / 2, PAGE_H - MARGIN, PAGE_H]
  for (const o of others) { xs.push(o.x, o.x + o.w); ys.push(o.y, o.y + o.h) }
  let w = nw, h = nh
  const gx: number[] = [], gy: number[] = []
  const right = el.x + nw, bottom = el.y + nh
  let bx: { d: number; g: number } | null = null
  for (const s of xs) { const d = Math.abs(right - s); if (d <= SNAP && (!bx || d < bx.d)) bx = { d, g: s } }
  if (bx) { w = bx.g - el.x; gx.push(bx.g) }
  let by: { d: number; g: number } | null = null
  for (const s of ys) { const d = Math.abs(bottom - s); if (d <= SNAP && (!by || d < by.d)) by = { d, g: s } }
  if (by) { h = by.g - el.y; gy.push(by.g) }
  return { w: Math.max(24, w), h: Math.max(14, h), gx, gy }
}

export default function LayoutEditor({ format, companyId, initial, ctx, onSaved }: { format: string; companyId: string; initial: DocLayout; ctx: LayoutContext; onSaved?: (layout: DocLayout, isCustom: boolean) => void }) {
  const [els, setEls] = useState<LayoutEl[]>(initial.elements)
  const [hist, setHist] = useState<LayoutEl[][]>([initial.elements])
  const [hIdx, setHIdx] = useState(0)
  const [selId, setSelId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [guides, setGuides] = useState<{ gx: number[]; gy: number[] }>({ gx: [], gy: [] })
  const fields = fieldsForFormat(format)
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; moved: boolean } | null>(null)
  const elsRef = useRef(els); elsRef.current = els

  useEffect(() => { setEls(initial.elements); setHist([initial.elements]); setHIdx(0); setSelId(null) }, [initial])

  /** Push a new state onto the undo history. */
  const commit = useCallback((next: LayoutEl[]) => {
    setEls(next)
    setHist(h => { const trimmed = h.slice(0, hIdx + 1); return [...trimmed, next].slice(-60) })
    setHIdx(i => Math.min(i + 1, 59))
  }, [hIdx])

  const undo = useCallback(() => { if (hIdx > 0) { setHIdx(hIdx - 1); setEls(hist[hIdx - 1]) } }, [hIdx, hist])
  const redo = useCallback(() => { if (hIdx < hist.length - 1) { setHIdx(hIdx + 1); setEls(hist[hIdx + 1]) } }, [hIdx, hist])

  const sel = els.find(e => e.id === selId) ?? null
  /** Live update (no history) — used while dragging. */
  const live = (id: string, patch: Partial<LayoutEl>) => setEls(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  /** Committed update — used by the property panel. */
  const update = (id: string, patch: Partial<LayoutEl>) => commit(elsRef.current.map(e => e.id === id ? { ...e, ...patch } : e))

  const onDown = (e: React.MouseEvent, id: string, mode: 'move' | 'resize') => {
    e.stopPropagation(); e.preventDefault()
    setSelId(id)
    const el = elsRef.current.find(x => x.id === id)!
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h, moved: false }
  }

  const onMove = useCallback((e: MouseEvent) => {
    const d = drag.current; if (!d) return
    d.moved = true
    const dx = (e.clientX - d.sx) / SCALE, dy = (e.clientY - d.sy) / SCALE
    const cur = elsRef.current.find(x => x.id === d.id); if (!cur) return
    const others = elsRef.current.filter(x => x.id !== d.id)
    if (d.mode === 'move') {
      const raw = { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) }
      const s = e.altKey ? { ...raw, gx: [], gy: [] } : snap(cur, others, raw.x, raw.y)   // hold Alt to bypass snapping
      live(d.id, { x: Math.max(0, Math.min(PAGE_W - 8, s.x)), y: Math.max(0, Math.min(PAGE_H - 8, s.y)) })
      setGuides({ gx: s.gx, gy: s.gy })
    } else {
      const raw = { w: Math.round(d.ow + dx), h: Math.round(d.oh + dy) }
      const s = e.altKey ? { w: Math.max(24, raw.w), h: Math.max(14, raw.h), gx: [], gy: [] } : snapSize(cur, others, raw.w, raw.h)
      live(d.id, { w: s.w, h: s.h })
      setGuides({ gx: s.gx, gy: s.gy })
    }
  }, [])

  const onUp = useCallback(() => {
    const d = drag.current
    drag.current = null
    setGuides({ gx: [], gy: [] })
    if (d?.moved) commit(elsRef.current)     // one history entry per gesture
  }, [commit])

  useEffect(() => {
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [onMove, onUp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).matches('input,textarea,select')
      if (typing) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
        e.preventDefault(); commit(elsRef.current.filter(x => x.id !== selId)); setSelId(null); return
      }
      // Arrow-key nudge (Shift = 10px)
      if (selId && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        commit(elsRef.current.map(x => x.id === selId ? { ...x, x: x.x + dx, y: x.y + dy } : x))
      }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [selId, undo, redo, commit])

  function addEl(type: ElType, extra: Partial<LayoutEl> = {}) {
    const isText = type === 'text' || type === 'field'
    const el: LayoutEl = { id: uid(), type, x: 60, y: 60, w: isText ? 220 : 200, h: isText ? 24 : 60, fontSize: 11, ...extra }
    commit([...elsRef.current, el]); setSelId(el.id)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/document-layouts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, format, schema: { version: 1, elements: els } as DocLayout }),
      })
      if (!res.ok) { const d = await res.json(); notify(d.error ?? 'Save failed', 'error'); return }
      notify('Template saved ✓', 'success')
      onSaved?.({ version: 1, elements: els }, true)
    } finally { setSaving(false) }
  }

  async function reset() {
    await fetch(`/api/document-layouts?company=${companyId}&format=${format}`, { method: 'DELETE' })
    const def = defaultLayout(format, TITLES[format] ?? 'DOCUMENT')
    commit(def.elements)
    setSelId(null)
    notify('Reset to the built-in design', 'success')
    onSaved?.(def, false)
  }

  const iCls = 'w-full px-2 py-1.5 rounded-lg border text-sm'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border'
  const btnStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => addEl('text', { text: 'New text', fontSize: 12 })} className={btn} style={btnStyle}><Type className="w-3.5 h-3.5" /> Text box</button>
        <details className="relative [&_summary::-webkit-details-marker]:hidden">
          <summary className={btn + ' cursor-pointer list-none'} style={btnStyle}><Hash className="w-3.5 h-3.5" /> Field</summary>
          <div className="absolute left-0 mt-1 z-30 rounded-xl border py-1 shadow-lg max-h-72 overflow-y-auto" style={{ background: 'var(--surface)', borderColor: 'var(--border)', minWidth: 230 }}>
            {fields.map(f => (
              <button key={f.key} onClick={() => addEl('field', { field: f.key, fontSize: 11 })} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)]" style={{ color: 'var(--text)' }}>{f.label}</button>
            ))}
          </div>
        </details>
        <button onClick={() => addEl('divider', { h: 12 })} className={btn} style={btnStyle}>Divider</button>

        <span className="mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
        <button onClick={undo} disabled={hIdx === 0} className={btn + ' disabled:opacity-40'} style={btnStyle} title="Undo (⌘Z)"><Undo2 className="w-3.5 h-3.5" /></button>
        <button onClick={redo} disabled={hIdx >= hist.length - 1} className={btn + ' disabled:opacity-40'} style={btnStyle} title="Redo (⇧⌘Z)"><Redo2 className="w-3.5 h-3.5" /></button>

        <div className="flex-1" />
        <button onClick={reset} className={btn} style={{ ...btnStyle, color: 'var(--text-muted)' }}><RotateCcw className="w-3.5 h-3.5" /> Reset</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60" style={{ background: 'var(--brand)' }}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save template
        </button>
      </div>

      <div className="flex gap-4 items-start">
        {/* Canvas */}
        <div className="rounded-xl overflow-auto" style={{ background: '#e5e7eb', padding: 16 }}>
          <div style={{ width: PAGE_W * SCALE, height: PAGE_H * SCALE, position: 'relative' }} onMouseDown={() => setSelId(null)}>
            <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${SCALE})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, background: '#fff' }}>
              {els.map(el => (
                <div key={el.id}
                  onMouseDown={e => onDown(e, el.id, 'move')}
                  style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, cursor: 'move', outline: selId === el.id ? '2px solid var(--brand)' : '1px dashed rgba(0,0,0,.12)' }}>
                  <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}><ElementContent el={el} ctx={ctx} /></div>
                  {selId === el.id && (
                    <div onMouseDown={e => onDown(e, el.id, 'resize')} style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, background: 'var(--brand)', borderRadius: 3, cursor: 'nwse-resize' }} />
                  )}
                </div>
              ))}

              {/* Alignment guides */}
              {guides.gx.map((x, i) => <div key={'gx' + i} style={{ position: 'absolute', left: x, top: 0, width: 1, height: PAGE_H, background: '#ec4899', pointerEvents: 'none' }} />)}
              {guides.gy.map((y, i) => <div key={'gy' + i} style={{ position: 'absolute', top: y, left: 0, height: 1, width: PAGE_W, background: '#ec4899', pointerEvents: 'none' }} />)}
            </div>
          </div>
        </div>

        {/* Properties */}
        <div className="w-64 shrink-0 space-y-3">
          {!sel && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Drag any element to move it, use the corner handle to resize. Elements snap to each other and to the page —
              hold <b>Alt</b> to bypass. Arrow keys nudge (Shift = 10px). <b>⌘Z</b> undo, <b>⇧⌘Z</b> redo.
            </p>
          )}
          {sel && (
            <div className="space-y-2.5 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{sel.type}</span>
                <button onClick={() => { commit(elsRef.current.filter(x => x.id !== sel.id)); setSelId(null) }} className="text-[var(--expense)]" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>

              {sel.type === 'text' && (
                <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Text (use {'{{field}}'} tokens)
                  <textarea value={sel.text ?? ''} onChange={e => update(sel.id, { text: e.target.value })} rows={2} className={iCls + ' mt-1'} style={iStyle} />
                </label>
              )}
              {sel.type === 'field' && (
                <>
                  <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Field
                    <select value={sel.field ?? ''} onChange={e => update(sel.id, { field: e.target.value })} className={iCls + ' mt-1'} style={iStyle}>
                      {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Label (optional)
                    <input value={sel.label ?? ''} onChange={e => update(sel.id, { label: e.target.value })} className={iCls + ' mt-1'} style={iStyle} />
                  </label>
                </>
              )}

              {(sel.type === 'text' || sel.type === 'field' || sel.type === 'bank' || sel.type === 'terms') && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Font size
                      <input type="number" value={sel.fontSize ?? 11} onChange={e => update(sel.id, { fontSize: Number(e.target.value) || 11 })} className={iCls + ' mt-1'} style={iStyle} />
                    </label>
                    <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Align
                      <select value={sel.align ?? 'left'} onChange={e => update(sel.id, { align: e.target.value as LayoutEl['align'] })} className={iCls + ' mt-1'} style={iStyle}>
                        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text)' }}><input type="checkbox" checked={!!sel.bold} onChange={e => update(sel.id, { bold: e.target.checked })} /> Bold</label>
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text)' }}>
                      Colour
                      <select value={sel.color ?? '#111'} onChange={e => update(sel.id, { color: e.target.value })} className="px-2 py-1 rounded-lg border text-xs" style={iStyle}>
                        <option value="#111">Dark</option><option value="#666">Grey</option><option value="#888">Muted</option><option value="accent">Accent</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {(['x', 'y', 'w', 'h'] as const).map(k => (
                  <label key={k} className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-faint)' }}>{k}
                    <input type="number" value={Math.round(sel[k])} onChange={e => update(sel.id, { [k]: Number(e.target.value) || 0 })} className="w-full px-1.5 py-1 rounded-lg border text-xs mt-0.5" style={iStyle} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
