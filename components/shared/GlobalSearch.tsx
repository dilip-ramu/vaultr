'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ArrowLeftRight, FileText, Truck, Building2, Users, UserSquare, Loader2 } from 'lucide-react'
import type { SearchHit } from '@/app/api/search/route'

const TYPE_ICON: Record<SearchHit['type'], React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  transaction: ArrowLeftRight,
  customer_invoice: FileText,
  supplier_invoice: Truck,
  supplier: Building2,
  customer: Users,
  employee: UserSquare,
}

export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQ(''); setHits([]); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const data = await res.json()
        setHits(data.hits ?? [])
      } catch { /* aborted */ }
      finally { setLoading(false) }
    }, 220)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  const go = useCallback((href: string) => { onClose(); router.push(href) }, [onClose, router])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[10001]" onClick={onClose}>
      {/* Top bar — sits exactly where the header is, expands full width */}
      <div
        className="absolute inset-x-0 top-0 shadow-md"
        style={{ background: 'var(--surface)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 h-12 search-grow" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            placeholder="Search transactions, invoices, suppliers, staff…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--text-faint)' }} />}
          <button onClick={onClose} className="shrink-0 p-1" style={{ color: 'var(--text-muted)' }} aria-label="Close search">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results drop straight down from the bar */}
        {(q.trim().length >= 2 || hits.length > 0) && (
          <div className="max-h-[70vh] overflow-y-auto" style={{ borderBottom: '1px solid var(--border)' }}>
            {!loading && hits.length === 0 && q.trim().length >= 2 && (
              <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                No matches for “{q}”
              </p>
            )}
            {hits.map((h, i) => {
              const Icon = TYPE_ICON[h.type]
              return (
                <button
                  key={i}
                  onClick={() => go(h.href)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                >
                  <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-faint)' }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate" style={{ color: 'var(--text)' }}>{h.label}</span>
                    {h.sub && <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{h.sub}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
