'use client'

import { useEffect, useState, useCallback } from 'react'
import { Upload, Trash2, Loader2, ImagePlus } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { mmToPx, mm1 } from '@/lib/documents/layout'

export interface TemplateAsset {
  id: string
  name: string
  url: string
  width_px: number
  height_px: number
  opacity: number
  fit: 'contain' | 'cover'
  rotate: number
}

/** Reusable image library. Set each image's size (mm), opacity and fit once —
 *  then drop it into any template with those settings already applied. */
export default function AssetsClient() {
  const [assets, setAssets] = useState<TemplateAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/template-assets')
      const d = await res.json()
      if (res.ok) setAssets(d.assets ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/template-assets', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { notify(d.error ?? 'Upload failed', 'error'); return }
      setAssets(prev => [d.asset as TemplateAsset, ...prev])
      notify('Image added to assets', 'success')
    } finally { setUploading(false) }
  }

  async function patch(id: string, body: Partial<TemplateAsset>) {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...body } as TemplateAsset : a))
    setBusyId(id)
    try {
      const res = await fetch(`/api/template-assets/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); notify(d.error ?? 'Save failed', 'error') }
    } finally { setBusyId(null) }
  }

  async function remove(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/template-assets/${id}`, { method: 'DELETE' })
      if (!res.ok) { notify('Could not delete', 'error'); return }
      setAssets(prev => prev.filter(a => a.id !== id))
    } finally { setBusyId(null) }
  }

  const iCls = 'w-full px-2 py-1.5 rounded-lg border text-sm'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="space-y-5">
      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white cursor-pointer" style={{ background: 'var(--brand)' }}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? 'Uploading…' : 'Upload image'}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      </label>

      {loading ? (
        <div className="flex items-center gap-2 text-sm py-10" style={{ color: 'var(--text-muted)' }}><Loader2 className="w-4 h-4 animate-spin" /> Loading assets…</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <ImagePlus className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No images yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Upload a letterhead, watermark or stamp — set its size once and reuse it in any template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {assets.map(a => (
            <div key={a.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-start gap-4">
                <div className="w-32 h-24 rounded-xl shrink-0 flex items-center justify-center overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <img src={a.url} alt={a.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: a.fit, opacity: a.opacity, transform: `rotate(${a.rotate}deg)` }} />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={a.name} onChange={e => setAssets(prev => prev.map(x => x.id === a.id ? { ...x, name: e.target.value } : x))}
                      onBlur={e => patch(a.id, { name: e.target.value.trim() || 'Untitled' })}
                      className={iCls} style={iStyle} />
                    {busyId === a.id && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
                    <button onClick={() => remove(a.id)} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)' }}>
                      <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-faint)' }}>W (mm)
                      <input type="number" step={0.5} value={mm1(a.width_px)} onChange={e => patch(a.id, { width_px: Math.round(mmToPx(Number(e.target.value) || 0)) })} className="w-full px-1.5 py-1 rounded-lg border text-xs mt-0.5" style={iStyle} />
                    </label>
                    <label className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-faint)' }}>H (mm)
                      <input type="number" step={0.5} value={mm1(a.height_px)} onChange={e => patch(a.id, { height_px: Math.round(mmToPx(Number(e.target.value) || 0)) })} className="w-full px-1.5 py-1 rounded-lg border text-xs mt-0.5" style={iStyle} />
                    </label>
                    <label className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-faint)' }}>Fit
                      <select value={a.fit} onChange={e => patch(a.id, { fit: e.target.value as 'contain' | 'cover' })} className="w-full px-1.5 py-1 rounded-lg border text-xs mt-0.5" style={iStyle}>
                        <option value="contain">Contain</option><option value="cover">Cover</option>
                      </select>
                    </label>
                  </div>

                  <label className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-faint)' }}>
                    Opacity — {Math.round((a.opacity ?? 1) * 100)}%
                    <input type="range" min={5} max={100} step={5} value={Math.round((a.opacity ?? 1) * 100)}
                      onChange={e => patch(a.id, { opacity: Number(e.target.value) / 100 })}
                      className="w-full mt-1" />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
