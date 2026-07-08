'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { evalExpr, hasOperator, prettyExpr, OP_CHARS } from '@/lib/calc'

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', 'DEL', '+']
const OPS: Record<string, string> = { '÷': '/', '×': '*', '−': '-', '+': '+' }

interface Props {
  /** Starting value (a plain number string) — shown as the first entry. */
  initial?: string
  title?: string
  onDone: (value: number) => void
  onClose: () => void
}

/** A bottom-sheet calculator keypad. Enter an expression (chaining amounts
 *  with + − × ÷); "Done" returns the evaluated total. Reusable across any
 *  amount field. Also accepts hardware-keyboard input (desktop). */
export default function CalculatorSheet({ initial, title = 'Amount', onDone, onClose }: Props) {
  const [expr, setExpr] = useState(() => (initial && Number(initial) ? String(initial) : '0'))

  const press = (key: string) => {
    navigator.vibrate?.(8)
    if (key === 'DEL') { setExpr(p => (p.length <= 1 ? '0' : p.slice(0, -1))); return }
    if (key in OPS) {
      const op = OPS[key]
      setExpr(p => (OP_CHARS.includes(p[p.length - 1]) ? p.slice(0, -1) + op : p + op))
      return
    }
    if (key === '.') {
      setExpr(p => {
        const curNum = p.split(/[+\-*/]/).pop() ?? ''
        if (curNum.includes('.')) return p
        if (p === '0') return '0.'
        return OP_CHARS.includes(p[p.length - 1]) ? p + '0.' : p + '.'
      })
      return
    }
    setExpr(p => {
      if (p === '0') return key
      const curNum = p.split(/[+\-*/]/).pop() ?? ''
      const dec = curNum.split('.')[1]
      if (dec && dec.length >= 2) return p
      return p + key
    })
  }

  const total = evalExpr(expr)
  const done = () => onDone(total)

  // Hardware keyboard (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') press(e.key)
      else if (e.key === '.') press('.')
      else if (e.key === '+') press('+')
      else if (e.key === '-') press('−')
      else if (e.key === '*') press('×')
      else if (e.key === '/') { e.preventDefault(); press('÷') }
      else if (e.key === 'Backspace') press('DEL')
      else if (e.key === 'Enter') { e.preventDefault(); done() }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, total])

  const showExpr = hasOperator(expr)
  const bigValue = showExpr ? total.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : expr

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-sm rounded-t-[24px] sm:rounded-[24px] sm:shadow-2xl"
        style={{ backgroundColor: 'var(--surface)', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{title}</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="flex items-center justify-between h-5 mb-1">
            <span className="text-sm tabular-nums truncate" style={{ color: 'var(--text-muted)' }}>{showExpr ? prettyExpr(expr) : ''}</span>
            {expr !== '0' && (
              <button onClick={() => setExpr('0')} className="text-xs font-semibold shrink-0 pl-2" style={{ color: 'var(--text-muted)' }}>Clear</button>
            )}
          </div>
          <p className="text-[44px] font-bold tabular-nums leading-none tracking-tight text-center" style={{ color: 'var(--text)' }}>₹{bigValue}</p>
        </div>

        <div className="grid grid-cols-4 gap-1.5 px-5 pb-3">
          {KEYS.map(key => {
            const isOp = key in OPS
            return (
              <button
                key={key}
                onClick={() => press(key)}
                className="h-14 rounded-2xl text-xl font-semibold flex items-center justify-center transition-all active:scale-95"
                style={{ backgroundColor: isOp ? 'var(--brand-light)' : 'var(--surface-2)', color: key === 'DEL' ? 'var(--expense)' : isOp ? 'var(--brand)' : 'var(--text)' }}
              >
                {key === 'DEL' ? '⌫' : key}
              </button>
            )
          })}
        </div>

        <div className="px-5 pb-5">
          <button onClick={done} className="w-full h-13 py-3.5 rounded-2xl text-base font-semibold text-white transition-all active:scale-[0.98]" style={{ backgroundColor: 'var(--brand)' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
