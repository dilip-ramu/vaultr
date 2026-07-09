'use client'

import { Check } from 'lucide-react'
import { ACCOUNT_COLORS } from '@/lib/types'

/**
 * The swatch grid used by every directory form to choose a card accent.
 * Reuses the Accounts colour palette so hues stay consistent app-wide, and
 * ends with a "rainbow" swatch that opens the native colour picker for any
 * custom hex — exactly like the bank-account colour picker.
 */
export default function ColorPicker({
  value, onChange, label = 'Card colour', palette = ACCOUNT_COLORS,
}: {
  value: string | null
  onChange: (hex: string) => void
  label?: string
  palette?: readonly string[]
}) {
  const isCustom = !!value && !palette.some(p => p.toLowerCase() === value.toLowerCase())
  return (
    <div>
      {label && <label className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</label>}
      <div className="flex flex-wrap gap-2 mt-1.5 items-center">
        {palette.map(hex => {
          const active = (value ?? '').toLowerCase() === hex.toLowerCase()
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
              style={{ background: hex, boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${hex}` : '0 0 0 1px var(--border)' }}
              aria-label={hex}
            >
              {active && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
            </button>
          )
        })}

        {/* custom colour — any value, native picker */}
        <label
          className="w-8 h-8 rounded-full relative cursor-pointer flex items-center justify-center overflow-hidden hover:scale-110 transition-transform"
          style={{
            background: isCustom && value ? value : 'conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)',
            boxShadow: isCustom ? `0 0 0 2px var(--surface), 0 0 0 4px ${value}` : '0 0 0 1px var(--border)',
          }}
          title="Custom colour"
        >
          <input type="color" value={value ?? '#3B82F6'} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
          {isCustom && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
        </label>
      </div>
    </div>
  )
}
