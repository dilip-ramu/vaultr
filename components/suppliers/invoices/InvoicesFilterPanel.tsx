'use client'

/**
 * Filter panel for the Supplier Invoices list. Lifted out of the
 * 1169-line SupplierInvoicesClient so future edits to filters don't have to
 * scroll past a thousand lines of unrelated code. Pure UI — state lives in
 * the parent, which passes down values + setters and nothing else.
 */

import { RefreshCw, X } from 'lucide-react'
import { REC_STATUS } from './helpers'
import type { Supplier } from '@/lib/suppliers/types'

type SupplierPick = Pick<Supplier, 'id' | 'name' | 'supplier_code' | 'payment_terms' | 'custom_terms_days' | 'currency'>

export interface InvoicesFilterPanelProps {
  suppliers:          SupplierPick[]
  filterType:         'all' | 'supplier' | 'personal'
  setFilterType:      (v: 'all' | 'supplier' | 'personal') => void
  filterSupplier:     string
  setFilterSupplier:  (v: string) => void
  filterRecoverable:  string
  setFilterRecoverable:(v: string) => void
  filterRecStatus:    string
  setFilterRecStatus: (v: string) => void
  filterRecurring:    boolean
  setFilterRecurring: (updater: (prev: boolean) => boolean) => void
  hasFilters:         boolean
  onClearAll:         () => void
}

export default function InvoicesFilterPanel(p: InvoicesFilterPanelProps) {
  return (
    <div
      className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Type filter */}
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Type</label>
        <select value={p.filterType} onChange={e => p.setFilterType(e.target.value as 'all' | 'supplier' | 'personal')}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
          <option value="all">All bills &amp; invoices</option>
          <option value="supplier">Supplier invoices only</option>
          <option value="personal">Personal bills only</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Supplier</label>
        <select value={p.filterSupplier} onChange={e => p.setFilterSupplier(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
          <option value="">All suppliers</option>
          {p.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Recoverable</label>
        <select value={p.filterRecoverable} onChange={e => p.setFilterRecoverable(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
          <option value="">All</option>
          <option value="yes">Recoverable only</option>
          <option value="no">Non-recoverable only</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Recovery Status</label>
        <select value={p.filterRecStatus} onChange={e => p.setFilterRecStatus(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
          <option value="">All statuses</option>
          {Object.entries(REC_STATUS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Recurrence</label>
        <button
          type="button"
          onClick={() => p.setFilterRecurring(r => !r)}
          className="w-full px-3 py-2 rounded-lg border text-sm text-left flex items-center gap-2"
          style={{
            background: p.filterRecurring ? 'rgba(42,122,80,0.08)' : 'var(--surface-2)',
            borderColor: p.filterRecurring ? 'var(--brand)' : 'var(--border)',
            color: p.filterRecurring ? 'var(--brand)' : 'var(--text-muted)',
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {p.filterRecurring ? 'Recurring only' : 'All types'}
        </button>
      </div>
      {p.hasFilters && (
        <div className="sm:col-span-4 flex justify-end">
          <button
            onClick={p.onClearAll}
            className="text-xs flex items-center gap-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
