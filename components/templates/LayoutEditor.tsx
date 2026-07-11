'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Type, Hash, Trash2, Save, RotateCcw, Loader2 } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { PAGE_W, PAGE_H, defaultLayout, fieldsForFormat, type DocLayout, type LayoutEl, type ElType } from '@/lib/documents/layout'
import type { LayoutContext } from '@/lib/documents/layoutContext'
import { ElementContent } from './LayoutRenderer'

const SCALE = 0.66
const uid = () => `el_${Math.random().toString(36).slice(2, 9)}`
const TITLES: Record<string, string> = {
  tax_invoice: 'TAX INVOICE', quotation: 'QUOTATION', proforma_gst: 'PROFORMA INVOICE', sales_order: 'SALES ORDER',
  delivery_challan: 'DELIVERY CHALLAN', credit_note: 'CREDIT NOTE', purchase_order: 'PURCHASE ORDER', debit_note: 'DEBIT NOTE', salary_slip: 'SALARY SLIP',
}

export default function LayoutEditor({ format, companyId, initial, ctx }: { format: string; companyId: string; initial: DocLayout; ctx: LayoutContext }) {
  const [els, setEls] = useState<LayoutEl[]>(initial.elements)
  const [selId, setSelId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fields = fieldsForFormat(format)
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null)

  // Reload when the company changes.
  useEffect(() => { setEls(initial.elements); setSelId(null) }, [initial])

  const sel = els.find(e => e.id === selId) ?? null
  const update = (id: string, patch: Partial<LayoutEl>) => setEls(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))

  const onDown = (e: React.MouseEvent, id: string, mode: 'move' | 'resize') => {
    e.stopPropagation(); e.preventDefault()
    setSelId(id)
    const el = els.find(x => x.id === id)!
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h }
  }

  const onMove = useCallback((e: MouseEvent) => {
    const d = drag.current; if (!d) return
    const dx = (e.clientX - d.sx) / SCALE, dy = (e.clientY - d.sy) / SCALE
    if (d.mode === 'move') {
      update(d.id, { x: Math.max(0, Math.min(PAGE_W - 8, Math.round(d.ox + dx))), y: Math.max(0, Math.min(PAGE_H - 8, Math.round(d.oy + dy))) })
    } else {
      update(d.id, { w: Math.max(24, Math.round(d.ow + dx)), h: Math.max(14, Math.round(d.oh + dy)) })
    }
  }, [])
  const onUp = useCallback(() => { drag.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [onMove, onUp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && !(e.target as HTMLElement).matches('input,textarea,select')) {
        e.preventDefault(); setEls(prev => prev.filter(x => x.id !== selId)); setSelId(null)
      }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [selId])

  function addEl(type: ElType, extra: Partial<LayoutEl> = {}) {
    const el: LayoutEl = { id: uid(), type, x: 60, y: 60, w: type === 'text' || type === 'field' ? 220 : 200, h: type === 'text' || type === 'field' ? 24 : 60, fontSize: 11, ...extra }
    setEls(prev => [...prev, el]); setSelId(el.id)
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
    } finally { setSaving(false) }
  }

  async function reset() {
    await fetch(`/api/document-layouts?company=${companyId}&format=${format}`, { method: 'DELETE' })
    setEls(defaultLayout(format, TITLES[format] ?? 'DOCUMENT').elements); setSelId(null)
    notify('Reset to the built-in design', 'success')
  }

  const iCls = 'w-full px-2 py-1.5 rounded-lg border text-sm'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => addEl('text', { text: 'New text', fontSize: 12 })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}><Type className="w-3.5 h-3.5" /> Text box</button>
        <div className="relative">
          <details className="[&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer list-none" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}><Hash className="w-3.5 h-3.5" /> Field</summary>
            <div className="absolute left-0 mt-1 z-30 rounded-xl border py-1 shadow-lg max-h-72 overflow-y-auto" style={{ background: 'var(--surface)', borderColor: 'var(--border)', minWidth: 220 }}>
              {fields.map(f => (
                <button key={f.key} onClick={() => addEl('field', { field: f.key, fontSize: 11 })} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)]" style={{ color: 'var(--text)' }}>{f.label}</button>
              ))}
            </div>
          </details>
        </div>
        <button onClick={() => addEl('divider', { h: 12 })} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>Divider</button>
        <div className="flex-1" />
        <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}><RotateCcw className="w-3.5 h-3.5" /> Reset</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60" style={{ background: 'var(--brand)' }}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save template</button>
      </div>

      <div className="flex gap-4 items-start">
        {/* Canvas */}
        <div className="rounded-xl overflow-auto" style={{ background: '#e5e7eb', padding: 16 }}>
          <div style={{ width: PAGE_W * SCALE, height: PAGE_H * SCALE, position: 'relative' }} onMouseDown={() => setSelId(null)}>
            <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${SCALE})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
              {els.map(el => (
                <div key={el.id}
                  onMouseDown={e => onDown(e, el.id, 'move')}
                  style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, cursor: 'move', outline: selId === el.id ? '2px solid var(--brand)' : '1px dashed rgba(0,0,0,.12)', outlineOffset: 0 }}>
                  <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}><ElementContent el={el} ctx={ctx} /></div>
                  {selId === el.id && (
                    <div onMouseDown={e => onDown(e, el.id, 'resize')} style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, background: 'var(--brand)', borderRadius: 3, cursor: 'nwse-resize' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Properties */}
        <div className="w-64 shrink-0 space-y-3">
          {!sel && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select an element to edit it, or drag to reposition. Add text boxes and dynamic fields from the toolbar.</p>}
          {sel && (
            <div className="space-y-2.5 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{sel.type}</span>
                <button onClick={() => { setEls(prev => prev.filter(x => x.id !== sel.id)); setSelId(null) }} className="text-[var(--expense)]" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
