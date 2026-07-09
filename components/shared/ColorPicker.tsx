'use client'

import { Check } from 'lucide-react'
import { ACCOUNT_COLORS } from '@/lib/types'

/**
 * The swatch grid used by every directory form to choose a card accent.
 * Reuses the Accounts colour palette so hues stay consistent app-wide.
 */
export default function ColorPicker({
  value, onChange, label = 'Card colour', palette = ACCOUNT_COLORS,
}: {
  value: string | null
  onChange: (hex: string) => void
  label?: string
  palette?: readonly string[]
}) {
  return (
    <div>
      {label && <label className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</label>}
      <div className="flex flex-wrap gap-2 mt-1.5">
        {palette.map(hex => {
          const active = (value ?? '').toLowerCase() === hex.toLowerCase()
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-transform"
              style={{ background: hex, boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${hex}` : '0 0 0 1px var(--border)' }}
              aria-label={hex}
            >
              {active && <Check className="w-4 h-4 text-white" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
