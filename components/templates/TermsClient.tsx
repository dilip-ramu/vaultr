'use client'

import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { notify } from '@/components/shared/Toast'

export interface TermsRow {
  slug: string
  label: string
  hint: string
  terms: string
  fallback: string
}

export default function TermsClient({ initial }: { initial: TermsRow[] }) {
  const [rows, setRows] = useState<TermsRow[]>(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  const edit = (slug: string, terms: string) => {
    setRows(prev => prev.map(r => (r.slug === slug ? { ...r, terms } : r)))
    setDirty(prev => new Set(prev).add(slug))
  }

  async function save(row: TermsRow) {
    setSaving(row.slug)
    try {
      const res = await fetch('/api/document-terms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: row.slug, terms: row.terms }),
      })
      if (!res.ok) { notify((await res.json()).error ?? 'Could not save', 'error'); return }
      setDirty(prev => { const n = new Set(prev); n.delete(row.slug); return n })
      notify(`${row.label} terms saved ✓`, 'success')
    } finally { setSaving(null) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {rows.map(r => {
        const isDirty = dirty.has(r.slug)
        return (
          <div key={r.slug} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{r.label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.hint}</div>
              </div>
              <button
                onClick={() => save(r)}
                disabled={!isDirty || saving === r.slug}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-40 shrink-0"
                style={{ background: 'var(--brand)' }}
              >
                {saving === r.slug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {saving === r.slug ? 'Saving…' : 'Save'}
              </button>
            </div>

            <textarea
              value={r.terms}
              onChange={e => edit(r.slug, e.target.value)}
              rows={5}
              placeholder="Leave empty to print the suggested wording below."
              className="w-full px-3 py-2 rounded-lg border text-[13px] leading-relaxed resize-y"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />

            {!r.terms.trim() && r.fallback && (
              <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                <span className="font-bold">Currently printing: </span>{r.fallback}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
