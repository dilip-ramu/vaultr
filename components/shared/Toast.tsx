'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  exiting?: boolean
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  info:    Info,
}

const COLORS: Record<ToastType, { bg: string; color: string; icon: string }> = {
  success: { bg: 'var(--status-paid-bg)',       color: 'var(--status-paid-text)',       icon: 'var(--income)' },
  error:   { bg: 'var(--status-cancelled-bg)',   color: 'var(--status-cancelled-text)',  icon: 'var(--expense)' },
  info:    { bg: 'var(--status-partial-bg)',      color: 'var(--status-partial-text)',    icon: 'var(--transfer)' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 220)
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev.slice(-2), { id, type, message }])
    const timer = setTimeout(() => dismiss(id), 3000)
    timerMap.current.set(id, timer)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] left-1/2 z-[9999] flex flex-col gap-2 w-[calc(100%-32px)] max-w-sm pointer-events-none"
          style={{ transform: 'translateX(-50%)' }}
        >
          {toasts.map(toast => {
            const Icon = ICONS[toast.type]
            const colors = COLORS[toast.type]
            return (
              <div
                key={toast.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg pointer-events-auto ${toast.exiting ? 'toast-exit' : 'toast-enter'}`}
                style={{ backgroundColor: colors.bg, color: colors.color }}
              >
                <Icon className="w-4 h-4 shrink-0" style={{ color: colors.icon }} />
                <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full opacity-60 hover:opacity-100"
                  style={{ color: colors.color }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
