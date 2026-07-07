'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2, User } from 'lucide-react'
import type { RecoverableAllocation, ImportBatch, AllocationStatus } from '@/lib/recoverables/types'
import type { Customer } from '@/lib/types'
import StatusBadge from '@/components/recoverables/shared/StatusBadge'
import { useToast } from '@/components/shared/Toast'

type FilterTab = 'all' | AllocationStatus

interface SupplierLedgerClientProps {
  supplierName: string
  allocations: RecoverableAllocation[]
  customer: Customer | null
  batches: ImportBatch[]
}

function round2(n: number) { return Math.round(n * 100) / 100 }

export default function SupplierLedgerClient({
  supplierName,
  allocations,
  customer,
  batches,
}: SupplierLedgerClientProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [localAllocations, setLocalAllocations] = useState<RecoverableAllocation[]>(allocations)
  const [billingId, setBillingId] = useState<string | null>(null)

  const batchMap = new Map(batches.map(b => [b.id, b]))

  const filtered = activeTab === 'all'
    ? localAllocations
    : localAllocations.filter(a => a.status === activeTab)

  const pendingAmount   = round2(localAllocations.filter(a => a.status === 'pending').reduce((s, a) => s + a.recoverable_amount, 0))
  const billedAmount    = round2(localAllocations.filter(a => a.status === 'billed').reduce((s, a) => s + a.recoverable_amount, 0))
  const paidAmount      = round2(localAllocations.filter(a => a.status === 'paid').reduce((s, a) => s + a.recoverable_amount, 0))

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

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'pending',   label: 'Pending' },
    { key: 'billed',    label: 'Billed' },
    { key: 'paid',      label: 'Paid' },
  ]

  return (
    <div className="page-enter w-full px-4 md:px-8 py-6 space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      {/* Header */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight truncate" style={{ color: 'var(--text)' }}>
              {supplierName}
            </h1>
            {customer && (
              <Link
                href={`/customers/${customer.id}`}
                className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
              >
                <User className="w-3 h-3" />
                {customer.name}
              </Link>
            )}
          </div>
        </div>

        {/* Balance summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending', value: pendingAmount, color: 'var(--brand)' },
            { label: 'Billed',  value: billedAmount,  color: 'var(--text)' },
            { label: 'Paid',    value: paidAmount,    color: 'var(--income, #22c55e)' },
          ].map(stat => (
            <div key={stat.label}>
              <p className="text-base font-bold" style={{ color: stat.color }}>
                ₹{stat.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--surface-2)' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              backgroundColor: activeTab === tab.key ? 'var(--surface)' : 'transparent',
              color: activeTab === tab.key ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Allocations */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-10 gap-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No {activeTab === 'all' ? '' : activeTab} allocations
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden md:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Reference', 'Batch', 'Date', 'PCS', 'Amount', 'Status', ''].map(h => (
                    <th key={h} className="py-2 px-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const batch = batchMap.get(a.batch_id)
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 px-3 font-mono text-xs" style={{ color: 'var(--text)' }}>
                        {/* Reference comes from shipment; we don't have it directly — show shipment_id short */}
                        {a.shipment_id.slice(0, 8)}…
                      </td>
                      <td className="py-3 px-3">
                        {batch ? (
                          <Link
                            href={`/recoverables/batches/${batch.id}`}
                            className="text-xs font-medium hover:underline"
                            style={{ color: 'var(--brand)' }}
                          >
                            {batch.name}
                          </Link>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {batch?.import_date
                          ? new Date(batch.import_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : '—'}
                      </td>
                      <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{a.pieces}</td>
                      <td className="py-3 px-3 text-xs font-semibold" style={{ color: 'var(--text)' }}>
                        ₹{Number(a.recoverable_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3"><StatusBadge status={a.status} /></td>
                      <td className="py-3 px-3">
                        {a.status === 'pending' && (
                          <button
                            onClick={() => handleMarkBilled(a.id)}
                            disabled={billingId !== null}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1"
                            style={{ backgroundColor: 'var(--brand)', opacity: billingId === a.id ? 0.6 : 1 }}
                          >
                            {billingId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark Billed'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden card divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
            {filtered.map(a => {
              const batch = batchMap.get(a.batch_id)
              return (
                <div key={a.id} className="py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {batch ? (
                      <Link
                        href={`/recoverables/batches/${batch.id}`}
                        className="text-sm font-medium hover:underline"
                        style={{ color: 'var(--brand)' }}
                      >
                        {batch.name}
                      </Link>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Unknown batch</span>
                    )}
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{a.pieces} PCS</span>
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>
                      ₹{Number(a.recoverable_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {a.status === 'pending' && (
                    <button
                      onClick={() => handleMarkBilled(a.id)}
                      disabled={billingId !== null}
                      className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1"
                      style={{ backgroundColor: 'var(--brand)', opacity: billingId === a.id ? 0.6 : 1 }}
                    >
                      {billingId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark Billed'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
