'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

// Module-level bridge so non-React code can fire a toast: notify('Saved', 'success')
let _show: ((message: string, type?: ToastType) => void) | null = null
export function notify(message: string, type: ToastType = 'info') {
  if (_show) _show(message, type)
  else if (typeof window !== 'undefined') window.alert(message)
}

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

// Frame 18d — each toast is a surface card tinted with its status hue.
const ACCENT: Record<ToastType, string> = {
  success: 'var(--income)',
  error:   'var(--expense)',
  info:    'var(--transfer)',
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

  // Register the module-level bridge while mounted
  useEffect(() => {
    _show = (message: string, type: ToastType = 'info') => { showToast(message, type) }
    return () => { _show = null }
  }, [showToast])

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
            const accent = ACCENT[toast.type]
            return (
              <div
                key={toast.id}
                className={`flex items-center gap-3 px-[15px] py-[13px] rounded-[14px] pointer-events-auto ${toast.exiting ? 'toast-exit' : 'toast-enter'}`}
                style={{
                  background: `color-mix(in srgb, ${accent} 12%, var(--surface))`,
                  border: `1px solid color-mix(in srgb, ${accent} 26%, transparent)`,
                  boxShadow: 'var(--shadow)',
                  color: 'var(--text)',
                }}
              >
                <Icon className="w-[17px] h-[17px] shrink-0" style={{ color: accent }} />
                <p className="flex-1 text-[13px] font-semibold leading-snug">{toast.message}</p>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full opacity-70 hover:opacity-100"
                  style={{ color: 'var(--text-faint)' }}
                >
                  <X className="w-3.5 h-3.5" />
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
