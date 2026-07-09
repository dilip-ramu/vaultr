'use client'

import { useRef, useState } from 'react'
import { X, Upload, Trash2, Image as ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import type { Bank, ChequeField, ChequeFieldKey } from '@/lib/cheque/types'
import { MM_TO_PX, CHEQUE_FIELD_LABELS, AC_PAYEE_TEXT, defaultChequeFields } from '@/lib/cheque/types'

interface Props {
  bank: Bank
  bgUrl?: string
  onSaved: (b: Bank) => void
  onClose: () => void
}

const SAMPLE: Record<ChequeFieldKey, string> = {
  date: '09/07/2026',
  payee: 'ABC Traders Private Limited',
  amount_figures: '12,500.00/-',
  amount_words: 'Rupees Twelve Thousand Five Hundred Only',
  ac_payee: AC_PAYEE_TEXT,
}

const PT_TO_PX = 96 / 72

export default function ChequeTemplateEditor({ bank, bgUrl: initialBg, onSaved, onClose }: Props) {
  const [width, setWidth] = useState(bank.cheque_width_mm || 200)
  const [height, setHeight] = useState(bank.cheque_height_mm || 92)
  const [fields, setFields] = useState<ChequeField[]>(
    Array.isArray(bank.cheque_fields) && bank.cheque_fields.length ? bank.cheque_fields : defaultChequeFields()
  )
  const [bgUrl, setBgUrl] = useState<string | undefined>(initialBg)
  const [bgPath, setBgPath] = useState<string | null>(bank.cheque_bg_path)
  const [bgOpacity, setBgOpacity] = useState(0.55)
  const [selected, setSelected] = useState<ChequeFieldKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ key: ChequeFieldKey; offX: number; offY: number } | null>(null)

  const sel = fields.find(f => f.key === selected) ?? null
  const patchField = (key: ChequeFieldKey, patch: Partial<ChequeField>) =>
    setFields(prev => prev.map(f => f.key === key ? { ...f, ...patch } : f))

  function onChipDown(e: React.PointerEvent, f: ChequeField) {
    e.preventDefault(); e.stopPropagation()
    setSelected(f.key)
    const rect = canvasRef.current!.getBoundingClientRect()
    drag.current = { key: f.key, offX: e.clientX - (rect.left + f.x * MM_TO_PX), offY: e.clientY - (rect.top + f.y * MM_TO_PX) }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onChipMove(e: React.PointerEvent) {
    const d = drag.current; if (!d) return
    const rect = canvasRef.current!.getBoundingClientRect()
    let xmm = (e.clientX - d.offX - rect.left) / MM_TO_PX
    let ymm = (e.clientY - d.offY - rect.top) / MM_TO_PX
    xmm = Math.max(0, Math.min(width, xmm)); ymm = Math.max(0, Math.min(height, ymm))
    patchField(d.key, { x: Math.round(xmm * 10) / 10, y: Math.round(ymm * 10) / 10 })
  }
  function onChipUp() { drag.current = null }

  async function uploadBg(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${user.id}/cheque-bg/${bank.id}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('vaultr-attachments').upload(path, file, { upsert: true, contentType: file.type })
      if (error) { notify(error.message, 'error'); return }
      const { data: { publicUrl } } = supabase.storage.from('vaultr-attachments').getPublicUrl(path)
      setBgPath(path); setBgUrl(publicUrl)
    } finally { setUploading(false) }
  }

  async function save() {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('banks').update({
        cheque_width_mm: Number(width) || null,
        cheque_height_mm: Number(height) || null,
        cheque_fields: fields,
        cheque_bg_path: bgPath,
        updated_at: new Date().toISOString(),
      }).eq('id', bank.id).select('*').single()
      if (error || !data) { notify(error?.message ?? 'Save failed', 'error'); return }
      notify('Cheque template saved', 'success')
      onSaved(data as Bank)
    } finally { setSaving(false) }
  }

  const cw = width * MM_TO_PX, ch = height * MM_TO_PX

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--surface)' }}>
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div>
          <p className="font-extrabold" style={{ color: 'var(--text)' }}>{bank.name} — cheque template</p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Drag each field onto its spot using the scanned cheque as a guide. The image is a calibration aid only — it is never printed.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ background: 'var(--brand)' }}>{saving ? 'Saving…' : 'Save template'}</button>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* controls */}
        <div className="w-[300px] shrink-0 overflow-y-auto border-r p-4 space-y-5" style={{ borderColor: 'var(--border)' }}>
          {/* dimensions */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Dimensions (mm)</p>
            <div className="flex gap-2">
              <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Width
                <input type="number" value={width} onChange={e => setWidth(parseFloat(e.target.value) || 0)} className="w-full mt-1 px-2.5 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              </label>
              <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Height
                <input type="number" value={height} onChange={e => setHeight(parseFloat(e.target.value) || 0)} className="w-full mt-1 px-2.5 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              </label>
            </div>
          </div>

          {/* background */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Calibration image</p>
            <label className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12.5px] font-semibold cursor-pointer" style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)', color: 'var(--text)' }}>
              {uploading ? 'Uploading…' : <><Upload className="w-3.5 h-3.5" /> {bgUrl ? 'Replace image' : 'Upload blank cheque'}</>}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadBg(f) }} />
            </label>
            {bgUrl && (
              <>
                <label className="block text-[11px] mt-2" style={{ color: 'var(--text-faint)' }}>Image opacity
                  <input type="range" min={0} max={1} step={0.05} value={bgOpacity} onChange={e => setBgOpacity(parseFloat(e.target.value))} className="w-full" />
                </label>
                <button onClick={() => { setBgUrl(undefined); setBgPath(null) }} className="text-[11px] font-semibold flex items-center gap-1 mt-1" style={{ color: 'var(--expense)' }}><Trash2 className="w-3 h-3" /> Remove image</button>
              </>
            )}
          </div>

          {/* fields list */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Fields</p>
            <div className="space-y-1">
              {fields.map(f => (
                <div key={f.key} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer ${selected === f.key ? 'ring-1' : ''}`}
                  style={{ background: selected === f.key ? 'color-mix(in srgb, var(--brand) 8%, var(--surface-2))' : 'var(--surface-2)' }}
                  onClick={() => setSelected(f.key)}>
                  <input type="checkbox" checked={f.enabled} onChange={e => { e.stopPropagation(); patchField(f.key, { enabled: e.target.checked }) }} onClick={e => e.stopPropagation()} />
                  <span className="text-[12.5px] font-semibold flex-1" style={{ color: 'var(--text)' }}>{CHEQUE_FIELD_LABELS[f.key]}</span>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{f.x},{f.y}</span>
                </div>
              ))}
            </div>
          </div>

          {/* selected field formatting */}
          {sel && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{CHEQUE_FIELD_LABELS[sel.key]} formatting</p>
              <div className="flex gap-2">
                <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Font (pt)
                  <input type="number" value={sel.fontSize} onChange={e => patchField(sel.key, { fontSize: parseFloat(e.target.value) || 8 })} className="w-full mt-1 px-2 py-1.5 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                </label>
                <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Colour
                  <input type="color" value={sel.color} onChange={e => patchField(sel.key, { color: e.target.value })} className="w-full mt-1 h-9 rounded-lg border p-0.5" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }} />
                </label>
              </div>
              <div className="flex gap-2 items-center">
                <label className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={sel.bold} onChange={e => patchField(sel.key, { bold: e.target.checked })} /> Bold
                </label>
                <div className="flex gap-1 ml-auto">
                  {(['left', 'center', 'right'] as const).map(a => (
                    <button key={a} onClick={() => patchField(sel.key, { align: a })} className="px-2 py-1 rounded text-[11px] font-semibold" style={{ background: sel.align === a ? 'var(--brand)' : 'var(--surface-2)', color: sel.align === a ? '#fff' : 'var(--text-muted)' }}>{a[0].toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Box width (mm, optional)
                  <input type="number" value={sel.w ?? ''} onChange={e => patchField(sel.key, { w: e.target.value ? parseFloat(e.target.value) : undefined })} className="w-full mt-1 px-2 py-1.5 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                </label>
                <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Letter spacing (pt)
                  <input type="number" value={sel.letterSpacing ?? 0} onChange={e => patchField(sel.key, { letterSpacing: parseFloat(e.target.value) || 0 })} className="w-full mt-1 px-2 py-1.5 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                </label>
              </div>
              <div className="flex gap-2">
                <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>X (mm)
                  <input type="number" value={sel.x} onChange={e => patchField(sel.key, { x: parseFloat(e.target.value) || 0 })} className="w-full mt-1 px-2 py-1.5 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                </label>
                <label className="flex-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Y (mm)
                  <input type="number" value={sel.y} onChange={e => patchField(sel.key, { y: parseFloat(e.target.value) || 0 })} className="w-full mt-1 px-2 py-1.5 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* canvas */}
        <div className="flex-1 overflow-auto p-8 flex items-start justify-center" style={{ background: 'var(--surface-2)' }}>
          <div
            ref={canvasRef}
            onPointerDown={() => setSelected(null)}
            className="relative shrink-0"
            style={{ width: cw, height: ch, background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.18)', borderRadius: 6, overflow: 'hidden' }}
          >
            {bgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none" style={{ opacity: bgOpacity }} />
            )}
            {fields.map(f => (
              <div
                key={f.key}
                onPointerDown={e => onChipDown(e, f)}
                onPointerMove={onChipMove}
                onPointerUp={onChipUp}
                className="absolute cursor-move whitespace-nowrap"
                style={{
                  left: f.x * MM_TO_PX,
                  top: f.y * MM_TO_PX,
                  width: f.w ? f.w * MM_TO_PX : undefined,
                  fontSize: f.fontSize * PT_TO_PX,
                  color: f.color,
                  fontWeight: f.bold ? 700 : 400,
                  textAlign: f.align,
                  letterSpacing: (f.letterSpacing ?? 0) * PT_TO_PX,
                  opacity: f.enabled ? 1 : 0.35,
                  outline: selected === f.key ? '1.5px solid var(--brand)' : '1px dashed rgba(0,0,0,0.25)',
                  outlineOffset: 1,
                  background: selected === f.key ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : 'transparent',
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  lineHeight: 1.1,
                }}
              >
                {SAMPLE[f.key]}
              </div>
            ))}
            {!bgUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                  <ImageIcon className="w-6 h-6" /><span className="text-[12px]">Upload a blank cheque to calibrate</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
