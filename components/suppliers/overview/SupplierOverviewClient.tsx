'use client'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  Clock, TrendingUp, Package, Plus,
  ArrowRight, CheckCircle2, FileWarning,
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
  const { mask } = useBalanceVisibility()
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

  const dueThisWeek = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const wk = new Date(today); wk.setDate(wk.getDate() + 7)
    let amt = 0, count = 0
    for (const i of enriched) {
      if (i.is_paid || i.computedStatus === 'cancelled' || !i.due_date) continue
      const d = new Date(i.due_date)
      if (d >= today && d <= wk) { amt += Number(i.amount ?? 0); count++ }
    }
    return { amt, count }
  }, [enriched])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Suppliers</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/suppliers/directory" className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl shrink-0" style={{ background: 'var(--brand)', boxShadow: 'var(--shadow)' }}>
          <Plus className="w-4 h-4" /> Add supplier
        </Link>
      </div>

      {/* Band tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="TO PAY" value={mask(`₹${fmtAmt(stats.totalOutstanding)}`)} sub="outstanding" color="var(--expense)" />
        <Tile label="DUE THIS WEEK" value={mask(`₹${fmtAmt(dueThisWeek.amt)}`)} sub={`${dueThisWeek.count} bill${dueThisWeek.count !== 1 ? 's' : ''}`} color="var(--amber)" />
        <Tile label="OVERDUE" value={mask(`₹${fmtAmt(stats.overdueAmount)}`)} sub={`${stats.overdueCount} invoice${stats.overdueCount !== 1 ? 's' : ''}`} color="var(--expense)" />
        <Tile label="ACTIVE" value={`${suppliers.length}`} sub="suppliers" color="var(--text)" />
      </div>

      {/* Payables table + pending-billing rail */}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Payables by supplier</p>
            <Link href="/suppliers/directory" className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--brand)' }}>Directory <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-5 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-2)' }}>
            <span>Supplier</span><span className="text-right">Overdue</span><span className="text-right">Outstanding</span>
          </div>
          {topSuppliers.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No outstanding invoices</div>
          ) : topSuppliers.map(s => (
            <div key={s.name} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-5 py-3" style={{ borderTop: '1px solid var(--border-2)' }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>{s.name.slice(0, 2).toUpperCase()}</span>
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{s.name}</p>
              </div>
              <span className="text-[13px] font-semibold text-right tabular-nums" style={{ color: s.overdue > 0 ? 'var(--expense)' : 'var(--text-faint)' }}>{s.overdue > 0 ? `₹${fmtAmt(s.overdue)}` : '—'}</span>
              <span className="text-[13px] font-bold text-right tabular-nums" style={{ color: 'var(--text)' }}>{mask(`₹${fmtAmt(s.outstanding)}`)}</span>
            </div>
          ))}
        </div>

        {/* Pending billing rail */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Pending billing</p>
            <Link href="/suppliers/recoverables" className="text-xs font-medium" style={{ color: 'var(--brand)' }}>All</Link>
          </div>
          {pendingByCustomer.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nothing to bill</p>
          ) : (
            <div className="space-y-2.5">
              {pendingByCustomer.map(c => (
                <div key={c.customer} className="flex items-center justify-between text-[13px]">
                  <span className="min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{c.customer} <span style={{ color: 'var(--text-faint)' }}>· {c.count}</span></span>
                  <span className="font-bold tabular-nums shrink-0 ml-2" style={{ color: 'var(--amber)' }}>₹{fmtAmt(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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

function Tile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-[22px] font-extrabold tracking-tight mt-1" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}</p>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, highlight }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; highlight?: boolean
}) {
  const colors: Record<string, { bg: string; icon: string; text: string }> = {
    blue:  { bg: 'rgba(42,122,80,0.08)',  icon: 'var(--brand)', text: 'var(--brand)' },
    red:   { bg: 'color-mix(in srgb, var(--expense) 8%, transparent)',   icon: 'var(--expense)', text: 'var(--expense)' },
    amber: { bg: 'color-mix(in srgb, var(--amber) 8%, transparent)',  icon: 'var(--amber)', text: 'var(--amber)' },
    green: { bg: 'color-mix(in srgb, var(--income) 8%, transparent)',   icon: 'var(--income)', text: 'var(--income)' },
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
