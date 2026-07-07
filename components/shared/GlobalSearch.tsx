'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ArrowLeftRight, FileText, Truck, Building2, Users, UserSquare, Loader2, CornerDownLeft } from 'lucide-react'
import type { SearchHit } from '@/app/api/search/route'

const TYPE_ICON: Record<SearchHit['type'], React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  transaction: ArrowLeftRight,
  customer_invoice: FileText,
  supplier_invoice: Truck,
  supplier: Building2,
  customer: Users,
  employee: UserSquare,
}

// Frame 18f — results are grouped under section labels, in this order.
const TYPE_ORDER: SearchHit['type'][] = ['customer', 'customer_invoice', 'supplier', 'supplier_invoice', 'employee', 'transaction']
const TYPE_LABEL: Record<SearchHit['type'], string> = {
  customer: 'Customers',
  customer_invoice: 'Customer invoices',
  supplier: 'Suppliers',
  supplier_invoice: 'Supplier invoices',
  employee: 'Staff',
  transaction: 'Transactions',
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
    <div
      className="fixed inset-0 z-[10001] flex items-start justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.45)', paddingTop: 'max(12vh, 64px)' }}
      onClick={onClose}
    >
      {/* Centered command palette */}
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} className="shrink-0 p-1 rounded-md" style={{ color: 'var(--text-muted)' }} aria-label="Close search">
            <X className="w-4 h-4" />
          </button>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            placeholder="Search transactions, invoices, suppliers, staff…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm border-0 focus:shadow-none focus:border-0"
            style={{ color: 'var(--text)', boxShadow: 'none' }}
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--text-faint)' }} />}
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
        </div>

        {/* Results — grouped by type under section labels (18f) */}
        {(q.trim().length >= 2 || hits.length > 0) && (
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {!loading && hits.length === 0 && q.trim().length >= 2 && (
              <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                No matches for “{q}”
              </p>
            )}
            {TYPE_ORDER.filter(t => hits.some(h => h.type === t)).map(type => {
              const Icon = TYPE_ICON[type]
              return (
                <div key={type}>
                  <p className="px-[10px] pt-2 pb-[5px] text-[10px] font-extrabold tracking-[0.1em]" style={{ color: 'var(--text-faint)' }}>
                    {TYPE_LABEL[type].toUpperCase()}
                  </p>
                  {hits.filter(h => h.type === type).map((h, i) => (
                    <button
                      key={i}
                      onClick={() => go(h.href)}
                      className="group w-full flex items-center gap-[11px] px-[10px] py-[9px] rounded-[10px] text-left transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)' }}>
                        <Icon className="w-[15px] h-[15px]" style={{ color: 'var(--text-muted)' }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{h.label}</span>
                      </span>
                      {h.sub && <span className="text-[11px] shrink-0" style={{ color: 'var(--text-faint)' }}>{h.sub}</span>}
                      <CornerDownLeft className="w-[14px] h-[14px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--brand)' }} />
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
