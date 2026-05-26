'use client'

import Link from 'next/link'
import { Upload, Settings } from 'lucide-react'
import StatsRow from './StatsRow'
import CustomerBalances from './CustomerBalances'
import BatchList from './BatchList'
import type { DashboardStats, ImportBatch, SupplierBalance } from '@/lib/recoverables/types'

interface RecoverablesDashboardClientProps {
  stats: DashboardStats
  batches: ImportBatch[]
  balances: SupplierBalance[]
  currency: string
}

export default function RecoverablesDashboardClient({
  stats,
  batches,
  balances,
  currency,
}: RecoverablesDashboardClientProps) {
  return (
    <div className="page-enter max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Recoverables</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Track and recover operational expenses
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/recoverables/settings"
            className="flex items-center justify-center w-9 h-9 rounded-xl border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
            title="Invoice Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
          <Link
            href="/recoverables/import"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Link>
        </div>
      </div>

      {/* Stats */}
      <StatsRow stats={stats} />

      {/* Pending by customer */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Pending by Customer</h2>
          <Link
            href="/recoverables/invoices"
            className="text-xs font-semibold"
            style={{ color: 'var(--brand)' }}
          >
            View All Invoices →
          </Link>
        </div>
        <CustomerBalances balances={balances} currency={currency} />
      </section>

      {/* Recent imports */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recent Imports</h2>
        <BatchList batches={batches} />
      </section>

      {/* Mobile FAB */}
      <Link
        href="/recoverables/import"
        className="md:hidden tap-scale"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: 'var(--brand)',
          boxShadow: '0 6px 20px rgba(99,102,241,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 40,
        }}
      >
        <Upload className="w-5 h-5 text-white" />
      </Link>
    </div>
  )
}
