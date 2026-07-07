'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

// Module-level bridge so any code can call `await confirmDialog(...)` without a
// hook. The mounted ConfirmProvider registers its open() here.
let _open: ((opts: ConfirmOptions) => Promise<boolean>) | null = null

/** Promise-based confirm. Usage: if (!(await confirmDialog({ message, danger:true }))) return
 *  Falls back to the native browser dialog if the provider isn't mounted. */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts
  if (_open) return _open(o)
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(o.message) : false)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions>({ message: '' })
  const resolver = useRef<((v: boolean) => void) | null>(null)

  useEffect(() => {
    _open = (o: ConfirmOptions) => {
      setOpts(o)
      setOpen(true)
      return new Promise<boolean>(resolve => { resolver.current = resolve })
    }
    return () => { _open = null }
  }, [])

  const close = (result: boolean) => {
    setOpen(false)
    resolver.current?.(result)
    resolver.current = null
  }

  return (
    <>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-[20px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-[13px]">
                {opts.danger && (
                  <div
                    className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)' }}
                  >
                    <AlertTriangle className="w-[18px] h-[18px]" style={{ color: 'var(--expense)' }} />
                  </div>
                )}
                <div className="min-w-0">
                  {opts.title && (
                    <h3 className="text-[15px] font-extrabold mb-[3px]" style={{ color: 'var(--text)' }}>{opts.title}</h3>
                  )}
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{opts.message}</p>
                </div>
              </div>
            </div>
            <div
              className="flex items-center justify-end gap-2 px-5 py-[14px]"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}
            >
              <button
                onClick={() => close(false)}
                className="px-[15px] py-[9px] rounded-[10px] text-[12.5px] font-bold"
                style={{ color: 'var(--text-muted)' }}
              >
                {opts.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                className="px-4 py-[9px] rounded-[10px] text-[12.5px] font-bold text-white"
                style={{ background: opts.danger ? 'var(--expense)' : 'var(--brand)' }}
              >
                {opts.confirmLabel ?? (opts.danger ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
