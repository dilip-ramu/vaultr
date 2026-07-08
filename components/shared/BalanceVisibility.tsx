'use client'

import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'

/**
 * App-wide "hide balances" privacy state. One toggle, read everywhere.
 * Persisted in localStorage and synced across tabs/components.
 */
interface Ctx {
  hidden: boolean
  toggle: () => void
  /** Formatted amount, masked to •••••• when hidden. */
  money: (n: number) => string
  /** Mask any pre-formatted string when hidden. */
  mask: (s: string) => string
}

const KEY = 'inex-hide-balances'
const MASK = '••••••'
const BalanceContext = createContext<Ctx | null>(null)

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false)

  // Hydrate from localStorage + keep in sync if another tab flips it.
  useEffect(() => {
    setHidden(localStorage.getItem(KEY) === '1')
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setHidden(e.newValue === '1') }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback(() => {
    setHidden(prev => { const next = !prev; try { localStorage.setItem(KEY, next ? '1' : '0') } catch {} return next })
  }, [])

  const money = useCallback((n: number) => (hidden ? MASK : formatCurrency(n)), [hidden])
  const mask = useCallback((s: string) => (hidden ? MASK : s), [hidden])

  return (
    <BalanceContext.Provider value={{ hidden, toggle, money, mask }}>
      {children}
    </BalanceContext.Provider>
  )
}

/** Safe to call outside the provider (falls back to always-visible). */
export function useBalanceVisibility(): Ctx {
  const ctx = useContext(BalanceContext)
  if (ctx) return ctx
  return { hidden: false, toggle: () => {}, money: (n: number) => formatCurrency(n), mask: (s: string) => s }
}
