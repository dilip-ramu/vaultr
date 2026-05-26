'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronDown, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import type { ImportBatch, RecoverableShipment, RecoverableAllocation, AllocationStatus } from '@/lib/recoverables/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'
import { useToast } from '@/components/shared/Toast'

interface BatchDetailClientProps {
  batch: ImportBatch
  shipments: RecoverableShipment[]
  allocations: RecoverableAllocation[]
}

export default function BatchDetailClient({ batch, shipments, allocations }: BatchDetailClientProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [expandedShipments, setExpandedShipments] = useState<Set<string>>(new Set())
  const [localAllocations, setLocalAllocations] = useState<RecoverableAllocation[]>(allocations)
  const [billingId, setBillingId] = useState<string | null>(null)

  // Group allocations by customer
  const customerMap = new Map<string, RecoverableAllocation[]>()
  for (const a of localAllocations) {
    const list = customerMap.get(a.customer_name) ?? []
    list.push(a)
    customerMap.set(a.customer_name, list)
  }

  const supplierSummary = Array.from(customerMap.entries()).map(([name, allocs]) => ({
    name,
    totalPcs:         allocs.reduce((s, a) => s + a.pieces, 0),
    totalBase:        allocs.reduce((s, a) => s + a.base_cost, 0),
    totalRecoverable: allocs.reduce((s, a) => s + a.recoverable_amount, 0),
    statuses:         [...new Set(allocs.map(a => a.status))],
    pendingAllocs:    allocs.filter(a => a.status === 'pending'),
  }))

  // Group allocations by shipment
  const allocsByShipment = new Map<string, RecoverableAllocation[]>()
  for (const a of localAllocations) {
    const list = allocsByShipment.get(a.shipment_id) ?? []
    list.push(a)
    allocsByShipment.set(a.shipment_id, list)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/recoverables/batches/${batch.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      showToast('Batch deleted', 'success')
      router.push('/recoverables')
      router.refresh()
    } catch {
      showToast('Failed to delete batch. Please try again.', 'error')
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const handleMarkBilled = async (allocationId: string) => {
    setBillingId(allocationId)
    try {
      const res = await fetch(`/api/recoverables/allocations/${allocationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'billed' as AllocationStatus }),
      })
      if (!res.ok) throw new Error('Update failed')
      const updated = await res.json() as RecoverableAllocation
      setLocalAllocations(prev => prev.map(a => a.id === allocationId ? updated : a))
      showToast('Marked as billed', 'success')
    } catch {
      showToast('Failed to update status. Please try again.', 'error')
    } finally {
      setBillingId(null)
    }
  }

  const toggleShipment = (id: string) => {
    setExpandedShipments(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="page-enter max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Back */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-2)' }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold truncate" style={{ color: 'var(--text)' }}>
          {batch.name}
        </h1>
      </div>

      {/* ── Section 1: Batch header ── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {batch.source && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>
                {batch.source}
              </span>
            )}
            <StatusBadge status={batch.status} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(batch.import_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--expense, #ef4444)' }}
            title="Delete batch"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'References',  value: batch.reference_count },
            { label: 'Suppliers',   value: batch.supplier_count },
            { label: 'Total Cost',  value: `₹${batch.total_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
            { label: 'Recoverable', value: `₹${batch.total_recoverable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
          ].map(stat => (
            <div key={stat.label}>
              <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{stat.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Supplier summary ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>By Customer</h2>

        {supplierSummary.length === 0 ? (
          <div className="card py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No allocations in this batch</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="card hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Customer', 'PCS', 'Base Cost', 'Recoverable', 'Status', ''].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplierSummary.map(s => (
                    <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text)' }}>{s.name}</td>
                      <td className="py-3 px-3" style={{ color: 'var(--text-muted)' }}>{s.totalPcs}</td>
                      <td className="py-3 px-3" style={{ color: 'var(--text-muted)' }}>
                        ₹{s.totalBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 font-semibold" style={{ color: 'var(--brand)' }}>
                        ₹{s.totalRecoverable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={s.statuses.includes('pending') ? 'pending' : s.statuses[0] ?? 'pending'} />
                      </td>
                      <td className="py-3 px-3">
                        {s.pendingAllocs.length > 0 && (
                          <button
                            onClick={() => void Promise.all(s.pendingAllocs.map(a => handleMarkBilled(a.id)))}
                            disabled={billingId !== null}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity flex items-center gap-1"
                            style={{ backgroundColor: 'var(--brand)', opacity: billingId ? 0.6 : 1 }}
                          >
                            {billingId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark Billed'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden card divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {supplierSummary.map(s => (
                <div key={s.name} className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{s.name}</p>
                    <StatusBadge status={s.statuses.includes('pending') ? 'pending' : s.statuses[0] ?? 'pending'} />
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{s.totalPcs} PCS</span>
                    <span className="font-semibold" style={{ color: 'var(--brand)' }}>
                      ₹{s.totalRecoverable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {s.pendingAllocs.length > 0 && (
                    <button
                      onClick={() => void Promise.all(s.pendingAllocs.map(a => handleMarkBilled(a.id)))}
                      disabled={billingId !== null}
                      className="w-full py-2.5 rounded-lg text-xs font-semibold text-white"
                      style={{ backgroundColor: 'var(--brand)', opacity: billingId ? 0.6 : 1 }}
                    >
                      Mark Billed
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Section 3: Shipment breakdown ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Shipment Breakdown</h2>
        {shipments.length === 0 ? (
          <div className="card py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No shipments in this batch</p>
          </div>
        ) : (
          <div className="space-y-2">
            {shipments.map(s => {
              const expanded = expandedShipments.has(s.id)
              const shipAllocs = allocsByShipment.get(s.id) ?? []
              return (
                <div key={s.id} className="card">
                  <button
                    onClick={() => toggleShipment(s.id)}
                    className="w-full flex items-center justify-between gap-3 text-left min-h-[44px]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expanded
                        ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                        : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      }
                      <span className="font-mono text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {s.reference}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="hidden sm:inline">₹{Number(s.per_piece_cost).toFixed(4)}/pc</span>
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>
                        ₹{Number(s.total_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </button>

                  {expanded && shipAllocs.length > 0 && (
                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                      {shipAllocs.map(a => (
                        <div key={a.id} className="flex items-center justify-between text-xs gap-2">
                          <span style={{ color: 'var(--text-muted)' }}>{a.customer_name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{a.pieces} pcs</span>
                          <span style={{ color: 'var(--text)' }}>
                            ₹{Number(a.recoverable_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          <StatusBadge status={a.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm space-y-4">
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Delete batch?</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              This will permanently delete <strong>{batch.name}</strong> and all its shipments and allocations.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--expense, #ef4444)', opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
