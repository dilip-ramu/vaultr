'use client'

/**
 * Bulk-actions bar for EmailDocumentsClient. Appears when the user has
 * one-or-more rows selected. Lifted out of the 1064-line parent so it can be
 * edited without wading through the rest of the inbox UI. Pure UI — every
 * behaviour is a callback the parent owns.
 */

import { RotateCcw, CheckCircle2, EyeOff, Trash2 } from 'lucide-react'
import type { EmailDocument } from './EmailDocumentsClient'

export interface BulkActionsBarProps {
  count:              number
  onBulkStatus:       (s: EmailDocument['status']) => void
  onBulkDelete:       () => void
  onClearSelection:   () => void
}

export default function BulkActionsBar({
  count, onBulkStatus, onBulkDelete, onClearSelection,
}: BulkActionsBarProps) {
  if (count <= 0) return null
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <span className="text-sm font-medium mr-2" style={{ color: 'var(--text)' }}>{count} selected</span>
      <button onClick={() => onBulkStatus('new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">
        <RotateCcw className="w-3 h-3" /> Mark New
      </button>
      <button onClick={() => onBulkStatus('reviewed')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
        <CheckCircle2 className="w-3 h-3" /> Mark Reviewed
      </button>
      <button onClick={() => onBulkStatus('ignored')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition-colors">
        <EyeOff className="w-3 h-3" /> Ignore
      </button>
      <button onClick={onBulkDelete} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors ml-auto">
        <Trash2 className="w-3 h-3" /> Delete {count}
      </button>
      <button onClick={onClearSelection} className="text-xs px-2 py-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors" style={{ color: 'var(--text-faint)' }}>
        Clear
      </button>
    </div>
  )
}
