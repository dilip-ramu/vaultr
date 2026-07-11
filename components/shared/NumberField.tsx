'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A number input you can actually type into.
 *
 * The naive `<input type="number" value={f(x)} onChange={e => set(g(e.target.value))} />`
 * is unusable whenever f and g aren't exact inverses — which is always, once
 * units or rounding are involved (mm → px → mm). Every keystroke round-trips
 * through the conversion and rewrites what you just typed: "12." collapses to
 * "12", clearing the box gives you 0, and a half-typed decimal snaps away.
 *
 * So: while the field has focus it owns its own text. Values are committed as
 * you type when they parse, but the text you see is never rewritten under your
 * cursor. On blur it re-syncs to the canonical value (and reverts if you left
 * it empty or nonsense).
 */
export default function NumberField({
  value, onCommit, step = 1, min, max, className, style, placeholder, disabled,
}: {
  /** Canonical value, in whatever unit is being displayed. */
  value: number
  onCommit: (n: number) => void
  step?: number
  min?: number
  max?: number
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<string>(String(value))
  const focused = useRef(false)

  // Track the outside world, but never while the user is mid-edit.
  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])

  const clamp = (n: number) => {
    if (min !== undefined && n < min) return min
    if (max !== undefined && n > max) return max
    return n
  }

  const commitIfValid = (raw: string) => {
    // "", "-", "1." and "-." are all legitimate things to be in the middle of
    // typing. Keep them on screen; just don't commit them.
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.' || raw.endsWith('.')) return
    const n = Number(raw)
    if (Number.isFinite(n)) onCommit(clamp(n))
  }

  const nudge = (dir: 1 | -1) => {
    const base = Number(draft)
    const n = clamp((Number.isFinite(base) ? base : value) + dir * step)
    const rounded = Math.round(n * 1000) / 1000
    setDraft(String(rounded))
    onCommit(rounded)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={e => { focused.current = true; e.target.select() }}
      onChange={e => {
        const raw = e.target.value
        if (!/^-?\d*\.?\d*$/.test(raw)) return   // reject letters, keep everything else
        setDraft(raw)
        commitIfValid(raw)
      }}
      onKeyDown={e => {
        if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1) }
        if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1) }
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      onBlur={() => {
        focused.current = false
        const n = Number(draft)
        if (draft === '' || !Number.isFinite(n)) { setDraft(String(value)); return }  // revert
        const c = clamp(n)
        setDraft(String(c))
        onCommit(c)
      }}
      className={className}
      style={style}
    />
  )
}
