'use client'

import { useRouter } from 'next/navigation'
import { UploadCloud } from 'lucide-react'
import type { ImportBatch } from '@/lib/recoverables/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'

interface BatchListProps {
  batches: ImportBatch[]
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BatchList({ batches }: BatchListProps) {
  const router = useRouter()

  if (batches.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 gap-4">
        <UploadCloud className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No imports yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Upload a CSV to get started</p>
        </div>
        <button
          onClick={() => router.push('/recoverables/import')}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          Import your first CSV
        </button>
      </div>
    )
  }

  return (
    <div className="card divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
      {batches.map(batch => {
        return (
          <button
            key={batch.id}
            onClick={() => router.push(`/recoverables/batches/${batch.id}`)}
            className="w-full flex items-center gap-3 py-3.5 px-1 text-left transition-opacity hover:opacity-80 tap-scale"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {batch.name}
                </p>
                {batch.source && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                    style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
                  >
                    {batch.source}
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {relativeDate(batch.created_at)} · {batch.reference_count} refs · {batch.supplier_count} suppliers
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                ₹{batch.total_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <StatusBadge status={batch.status} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
