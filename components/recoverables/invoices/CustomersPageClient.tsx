'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, UploadCloud } from 'lucide-react'
import type { RecoverableInvoice, ImportBatch, RecoverableAllocation } from '@/lib/recoverables/types'
import InvoiceListClient from './InvoiceListClient'
import ImportPageClient from '../import/ImportPageClient'
import BatchList from '../dashboard/BatchList'

interface Props {
  invoices: RecoverableInvoice[]
  batches: ImportBatch[]
  pendingAllocations: RecoverableAllocation[]
}

type Tab = 'invoices' | 'recoverables'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function CustomersPageClient({ invoices, batches, pendingAllocations }: Props) {
  const [tab, setTab] = useState<Tab>('invoices')
  const router = useRouter()

  const pendingTotal = pendingAllocations.reduce((s, a) => s + Number(a.recoverable_amount), 0)

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      key: 'invoices',
      label: 'Invoices',
      icon: <FileText className="w-4 h-4" />,
      badge: invoices.length > 0 ? String(invoices.length) : undefined,
    },
    {
      key: 'recoverables',
      label: 'Recoverables',
      icon: <UploadCloud className="w-4 h-4" />,
      badge: pendingTotal > 0 ? fmt(pendingTotal) : undefined,
    },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">

      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl mb-5"
        style={{ background: 'var(--surface-2)' }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
            style={
              tab === t.key
                ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
                : { color: 'var(--text-muted)' }
            }
          >
            {t.icon}
            {t.label}
            {t.badge && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: tab === t.key ? 'var(--brand)' : 'var(--border)',
                  color: tab === t.key ? '#fff' : 'var(--text-muted)',
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Invoices tab */}
      {tab === 'invoices' && (
        <InvoiceListClient invoices={invoices} />
      )}

      {/* Recoverables tab — CSV import + recent batches */}
      {tab === 'recoverables' && (
        <div className="space-y-6">

          {/* Summary strip */}
          {pendingTotal > 0 && (
            <div
              className="rounded-2xl p-4 flex items-center justify-between"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Pending Recovery
                </p>
                <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--brand)' }}>
                  {fmt(pendingTotal)}
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {pendingAllocations.length} allocation{pendingAllocations.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Import CSV */}
          <div>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Import CSV</p>
            <ImportPageClient onImported={() => router.refresh()} />
          </div>

          {/* Recent batches */}
          {batches.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Recent Imports</p>
              <BatchList batches={batches} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
