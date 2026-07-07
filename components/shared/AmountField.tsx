'use client'

import { useState } from 'react'
import CalculatorSheet from './CalculatorSheet'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  id?: string
  title?: string
  disabled?: boolean
}

/** Drop-in replacement for an amount <input>. Shows the value, suppresses the
 *  device keyboard, and opens the in-app calculator keypad on tap. Returns the
 *  evaluated total. */
export default function AmountField({ value, onChange, placeholder, className, style, id, title = 'Amount', disabled }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="none"
        readOnly
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onFocus={e => { e.currentTarget.blur() }}
        onClick={() => { if (!disabled) setOpen(true) }}
        className={className}
        style={{ cursor: disabled ? 'default' : 'pointer', ...style }}
      />
      {open && (
        <CalculatorSheet
          initial={value}
          title={title}
          onClose={() => setOpen(false)}
          onDone={n => { onChange(n === 0 ? '' : String(n)); setOpen(false) }}
        />
      )}
    </>
  )
}
