'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { ACCENT_PRESETS } from '@/lib/companies/templates'

interface Row { id: string; name: string; accent: string }

/** Accent colour per company — drives every document, PDF and template. */
export default function AccentTemplatesClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function save(id: string, accent: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, accent } : r))
    setSavingId(id)
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_accent: accent }),
      })
      if (!res.ok) { const d = await res.json(); notify(d.error ?? 'Could not save', 'error'); return }
      notify('Accent updated', 'success')
    } finally { setSavingId(null) }
  }

  if (rows.length === 0) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add a company first.</p>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {rows.map(r => {
        const isPreset = ACCENT_PRESETS.some(a => a.value.toLowerCase() === r.accent.toLowerCase())
        return (
          <div key={r.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: r.accent }} />
                <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{r.name}</p>
              </div>
              {savingId === r.id && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />}
            </div>

            {/* Live preview strip — what the documents will look like */}
            <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid var(--border)' }}>
              <div style={{ height: 6, background: r.accent }} />
              <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'var(--surface-2)' }}>
                <span className="text-[11px] font-extrabold" style={{ color: r.accent }}>TAX INVOICE</span>
                <span className="text-[11px] font-extrabold" style={{ color: r.accent }}>₹2,59,600</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {ACCENT_PRESETS.map(a => {
                const active = r.accent.toLowerCase() === a.value.toLowerCase()
                return (
                  <button key={a.value} title={a.name} onClick={() => save(r.id, a.value)}
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: a.value, outline: active ? '2px solid var(--text)' : 'none', outlineOffset: '2px' }}>
                    {active && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                )
              })}
              <label className="w-7 h-7 rounded-full relative cursor-pointer flex items-center justify-center overflow-hidden shrink-0" title="Custom colour"
                style={{ background: isPreset ? 'conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)' : r.accent, boxShadow: '0 0 0 1px var(--border)' }}>
                <input type="color" value={r.accent} onChange={e => save(r.id, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                {!isPreset && <Check className="w-3.5 h-3.5 text-white" />}
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
