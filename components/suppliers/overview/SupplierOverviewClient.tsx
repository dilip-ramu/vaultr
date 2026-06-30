'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Clock, TrendingUp, Package,
  ArrowRight, CheckCircle2, FileWarning, DollarSign,
} from 'lucide-react'
import type { SupplierInvoice } from '@/lib/suppliers/types'
import { computeInvoiceStatus } from '@/lib/suppliers/types'

interface Props {
  invoices: Partial<SupplierInvoice>[]
  suppliers: { id: string; name: string; supplier_code: string | null }[]
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SupplierOverviewClient({ invoices, suppliers }: Props) {
  const enriched = useMemo(() =>
    invoices.map(inv => ({
      ...inv,
      computedStatus: computeInvoiceStatus({
        is_paid: inv.is_paid ?? false,
        due_date: inv.due_date ?? null,
        status: inv.status ?? 'pending',
      }),
    })),
    [invoices],
  )

  const stats = useMemo(() => {
    const active = enriched.filter(i => i.computedStatus !== 'cancelled')
    const unpaid = active.filter(i => !i.is_paid)
    const overdue = active.filter(i => i.computedStatus === 'overdue')
    const outstanding = unpaid.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const overdueAmt = overdue.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const pendingRec = active.filter(i => i.is_recoverable && i.recoverable_status === 'pending_billing')
    const unbilledAmt = pendingRec.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const billedRec = active.filter(i => i.is_recoverable && i.recoverable_status === 'billed')
    const billedAmt = billedRec.reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const recoveredAmt = active.filter(i => i.recoverable_status === 'recovered')
      .reduce((s, i) => s + Number(i.amount ?? 0), 0)
    const recentPaid = active
      .filter(i => i.is_paid && i.payment_date)
      .sort((a, b) => new Date(b.payment_date!).getTime() - new Date(a.payment_date!).getTime())
      .slice(0, 5)
    return {
      totalOutstanding: outstanding,
      overdueCount: overdue.length,
      overdueAmount: overdueAmt,
      pendingRecCount: pendingRec.length,
      unbilledRecAmount: unbilledAmt,
      billedRecAmount: billedAmt,
      recoveredAmount: recoveredAmt,
      recentPaid,
      activeSuppliers: suppliers.length,
    }
  }, [enriched, suppliers])

  // Top suppliers by outstanding amount
  const topSuppliers = useMemo(() => {
    const map = new Map<string, { name: string; outstanding: number; overdue: number }>()
    for (const sup of suppliers) map.set(sup.id, { name: sup.name, outstanding: 0, overdue: 0 })
    for (const inv of enriched) {
      if (!inv.supplier_id || inv.is_paid || inv.computedStatus === 'cancelled') continue
      const s = map.get(inv.supplier_id)
      if (!s) continue
      s.outstanding += Number(inv.amount ?? 0)
      if (inv.computedStatus === 'overdue') s.overdue += Number(inv.amount ?? 0)
    }
    return [...map.values()].filter(s => s.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 6)
  }, [enriched, suppliers])

  // Recoverables pending billing by customer
  const pendingByCustomer = useMemo(() => {
    const map = new Map<string, { customer: string; amount: number; count: number }>()
    for (const inv of enriched) {
      if (!inv.is_recoverable || inv.recoverable_status !== 'pending_billing') continue
      const key = inv.linked_customer_name ?? 'Unassigned'
      const existing = map.get(key) ?? { customer: key, amount: 0, count: 0 }
      existing.amount += Number(inv.amount ?? 0)
      existing.count++
      map.set(key, existing)
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
  }, [enriched])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Supplier Overview</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Operational finance visibility — outstanding payments, recoverable tracking, overdue alerts.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total Outstanding"
          value={`₹${fmtAmt(stats.totalOutstanding)}`}
          sub={`${suppliers.length} active suppliers`}
          color="blue"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Overdue Payments"
          value={`₹${fmtAmt(stats.overdueAmount)}`}
          sub={`${stats.overdueCount} invoice${stats.overdueCount !== 1 ? 's' : ''}`}
          color="red"
          highlight={stats.overdueCount > 0}
        />
        <StatCard
          icon={<FileWarning className="w-5 h-5" />}
          label="Unbilled Recoverables"
          value={`₹${fmtAmt(stats.unbilledRecAmount)}`}
          sub={`${stats.pendingRecCount} item${stats.pendingRecCount !== 1 ? 's' : ''} to bill`}
          color="amber"
          highlight={stats.pendingRecCount > 0}
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Billed Recoverables"
          value={`₹${fmtAmt(stats.billedRecAmount)}`}
          sub={`₹${fmtAmt(stats.recoveredAmount)} recovered`}
          color="green"
        />
      </div>

      {/* Main Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Top Suppliers */}
        <div className="md:col-span-2 rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Top Suppliers by Outstanding</h2>
            <Link href="/suppliers/directory" className="text-xs flex items-center gap-1" style={{ color: 'var(--brand)' }}>
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {topSuppliers.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No outstanding invoices</div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {topSuppliers.map(s => (
                <div key={s.name} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{s.name}</p>
                    {s.overdue > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--error, #ef4444)' }}>
                        ₹{fmtAmt(s.overdue)} overdue
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: s.overdue > 0 ? 'var(--error, #ef4444)' : 'var(--text)' }}>
                    ₹{fmtAmt(s.outstanding)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recoverables Pending Billing */}
        <div className="rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Pending Billing</h2>
            <Link href="/suppliers/recoverables" className="text-xs flex items-center gap-1" style={{ color: 'var(--brand)' }}>
              View <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {pendingByCustomer.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No pending recoverables</div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {pendingByCustomer.map(c => (
                <div key={c.customer} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.customer}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.count} item{c.count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--amber, #f59e0b)' }}>₹{fmtAmt(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recently Paid */}
      <div className="rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recently Paid Invoices</h2>
          <Link href="/suppliers/payments" className="text-xs flex items-center gap-1" style={{ color: 'var(--brand)' }}>
            Payment Tracking <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {stats.recentPaid.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No paid invoices yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Supplier', 'Invoice #', 'Amount', 'Paid On'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentPaid.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-5 py-3" style={{ color: 'var(--text)' }}>—</td>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{inv.invoice_number ?? '—'}</td>
                    <td className="px-5 py-3 font-semibold" style={{ color: 'var(--text)' }}>₹{fmtAmt(Number(inv.amount))}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{inv.payment_date ? fmtDate(inv.payment_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { href: '/suppliers/invoices', label: 'Supplier Invoices', icon: Package, desc: 'Record & track invoices' },
          { href: '/suppliers/recoverables', label: 'Pending Recoverables', icon: FileWarning, desc: 'Items not yet billed' },
          { href: '/suppliers/payments', label: 'Payment Tracking', icon: TrendingUp, desc: 'Bulk pay & batches' },
          { href: '/suppliers/directory', label: 'Supplier Directory', icon: Clock, desc: 'Manage suppliers' },
          { href: '/suppliers/billed', label: 'Billed Recoverables', icon: CheckCircle2, desc: 'Recovery status' },
        ].map(({ href, label, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-3 p-4 rounded-xl border transition-all hover:border-[var(--brand)]"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <span className="p-2 rounded-lg mt-0.5" style={{ backgroundColor: 'var(--brand-light)' }}>
              <Icon className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            </span>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, highlight }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; highlight?: boolean
}) {
  const colors: Record<string, { bg: string; icon: string; text: string }> = {
    blue:  { bg: 'rgba(42,122,80,0.08)',  icon: 'var(--brand)', text: 'var(--brand)' },
    red:   { bg: 'rgba(239,68,68,0.08)',   icon: '#ef4444', text: '#ef4444' },
    amber: { bg: 'rgba(245,158,11,0.08)',  icon: '#f59e0b', text: '#f59e0b' },
    green: { bg: 'rgba(34,197,94,0.08)',   icon: '#22c55e', text: '#22c55e' },
  }
  const c = colors[color] ?? colors.blue
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: highlight ? c.icon : 'var(--border)',
        borderWidth: highlight ? 2 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: c.bg }}>
          <span style={{ color: c.icon }}>{icon}</span>
        </span>
      </div>
      <p className="text-xl font-bold" style={{ color: c.text }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-faint, var(--text-muted))' }}>{sub}</p>
    </div>
  )
}
