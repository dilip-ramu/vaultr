'use client'

import { useEffect, useState } from 'react'
import type { SignatoryOption } from '@/lib/companies/signatories'

interface Props {
  companyId: string | null
  value: string | null
  onChange: (signatoryId: string | null) => void
  className?: string
  style?: React.CSSProperties
  /** When true, auto-selects the company's default signatory once loaded and
   *  nothing is chosen yet. */
  autoDefault?: boolean
}

/** Dropdown of a company's authorised signatories. Fetches on company change.
 *  Emits the chosen signatory id (or null for "None"). */
export default function SignatorySelect({ companyId, value, onChange, className, style, autoDefault = true }: Props) {
  const [opts, setOpts] = useState<SignatoryOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!companyId) { setOpts([]); return }
    setLoading(true)
    fetch(`/api/companies/${companyId}/signatories`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const list: SignatoryOption[] = (d.signatories ?? []).map((s: Record<string, unknown>) => ({
          id: String(s.id), name: String(s.name), designation: (s.designation as string | null) ?? null,
          is_default: !!s.is_default, signatureUrl: (s.signatureUrl as string | null) ?? null,
        }))
        setOpts(list)
        // Auto-pick the default when nothing selected yet.
        if (autoDefault && !value) {
          const def = list.find(s => s.is_default) ?? null
          if (def) onChange(def.id)
        }
        // If the current value no longer belongs to this company, clear it.
        if (value && !list.some(s => s.id === value)) onChange(null)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  return (
    <select
      className={className}
      style={style}
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      disabled={!companyId || loading}
    >
      <option value="">{loading ? 'Loading…' : (opts.length ? 'No signature' : 'No signatories yet')}</option>
      {opts.map(s => (
        <option key={s.id} value={s.id}>
          {s.name}{s.designation ? ` — ${s.designation}` : ''}{s.signatureUrl ? '' : ' (no sign image)'}
        </option>
      ))}
    </select>
  )
}
