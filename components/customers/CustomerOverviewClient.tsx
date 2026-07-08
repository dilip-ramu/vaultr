'use client'

import { useMemo } from 'react'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'
import Link from 'next/link'
import {
  ArrowRight, Plus,
  DollarSign, FileText, Receipt, BookOpen,
} from 'lucide-react'

interface OrderRow {
  id: string
  customer_id: string | null
  order_number: string | null
  currency: string
  order_date: string
}

interface StyleRow {
  id: string
  order_id: string
  style_ref: string | null
  commission_inr: number
  order_status: string
  received_date: string | null
  expected_payment_date: string | null
}

interface Props {
  orders: OrderRow[]
  styles: StyleRow[]
  customers: { id: string; name: string; pays_commission: boolean }[]
  receivables: { balance_due: number; customer_id: string | null; customer_name: string | null; due_date?: string | null }[]
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CustomerOverviewClient({ orders, styles, customers, receivables }: Props) {
  const { mask } = useBalanceVisibility()
  const orderById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders])
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers])

  const customerNameForStyle = (s: StyleRow) => {
    const order = orderById.get(s.order_id)
    return (order?.customer_id && customerById.get(order.customer_id)) || 'Unassigned'
  }

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const active = styles.filter(s => s.order_status !== 'cancelled')
    const pending = active.filter(s => s.order_status !== 'received')
    const pendingAmt = pending.reduce((s, r) => s + Number(r.commission_inr || 0), 0)
    const overdue = active.filter(s =>
      s.order_status === 'shipped' && s.expected_payment_date && s.expected_payment_date <= todayStr
    )
    const overdueAmt = overdue.reduce((s, r) => s + Number(r.commission_inr || 0), 0)
    const received = active.filter(s => s.order_status === 'received')
    const receivedAmt = received.reduce((s, r) => s + Number(r.commission_inr || 0), 0)
    const now = new Date()
    const thisMonthAmt = received
      .filter(s => {
        if (!s.received_date) return false
        const d = new Date(s.received_date)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })
      .reduce((s, r) => s + Number(r.commission_inr || 0), 0)
    const receivablesAmt = receivables.reduce((s, r) => s + Number(r.balance_due || 0), 0)
    const recentReceived = received
      .filter(s => s.received_date)
      .sort((a, b) => (b.received_date! > a.received_date! ? 1 : -1))
      .slice(0, 5)
    return {
      pendingAmt, pendingCount: pending.length,
      overdueAmt, overdueCount: overdue.length,
      receivedAmt, thisMonthAmt,
      receivablesAmt, receivablesCount: receivables.length,
      recentReceived,
    }
  }, [styles, receivables])

  // Top pending customers — incoming (commission) + receivables combined
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; incoming: number; receivable: number; overdue: number }>()
    const get = (name: string) => {
      const e = map.get(name) ?? { name, incoming: 0, receivable: 0, overdue: 0 }
      map.set(name, e)
      return e
    }
    const todayStr = new Date().toISOString().split('T')[0]
    for (const s of styles) {
      if (['received', 'cancelled'].includes(s.order_status)) continue
      const e = get(customerNameForStyle(s))
      e.incoming += Number(s.commission_inr || 0)
      if (s.order_status === 'shipped' && s.expected_payment_date && s.expected_payment_date <= todayStr) {
        e.overdue += Number(s.commission_inr || 0)
      }
    }
    for (const r of receivables) {
      const name = (r.customer_id && customerById.get(r.customer_id)) || r.customer_name || 'Unassigned'
      get(name).receivable += Number(r.balance_due || 0)
    }
    return [...map.values()]
      .map(e => ({ ...e, total: e.incoming + e.receivable }))
      .filter(e => e.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, receivables, orderById, customerById])

  // Receivables ageing from invoice due dates
  const ageing = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const b = { notDue: 0, d30: 0, d60: 0, d60plus: 0 }
    for (const r of receivables) {
      const amt = Number(r.balance_due || 0)
      if (!r.due_date) { b.notDue += amt; continue }
      const days = Math.floor((today.getTime() - new Date(r.due_date).getTime()) / 86400000)
      if (days <= 0) b.notDue += amt
      else if (days <= 30) b.d30 += amt
      else if (days <= 60) b.d60 += amt
      else b.d60plus += amt
    }
    return b
  }, [receivables])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Customers</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{customers.length} customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/customers/directory" className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl shrink-0" style={{ background: 'var(--brand)', boxShadow: 'var(--shadow)' }}>
          <Plus className="w-4 h-4" /> Add customer
        </Link>
      </div>

      {/* Band tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="TO COLLECT" value={mask(`₹${fmtAmt(stats.receivablesAmt)}`)} sub={`${stats.receivablesCount} open invoice${stats.receivablesCount !== 1 ? 's' : ''}`} color="var(--income)" />
        <Tile label="OVERDUE" value={mask(`₹${fmtAmt(stats.overdueAmt)}`)} sub={`${stats.overdueCount} past due`} color="var(--expense)" />
        <Tile label="PIPELINE / UNBILLED" value={mask(`₹${fmtAmt(stats.pendingAmt)}`)} sub={`${stats.pendingCount} style${stats.pendingCount !== 1 ? 's' : ''}`} color="var(--amber)" />
        <Tile label="ACTIVE" value={`${customers.length}`} sub="customers" color="var(--text)" />
      </div>

      {/* Directory table + ageing/breakdown rail */}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Customers</p>
            <Link href="/customers/directory" className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--brand)' }}>Directory <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-5 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-2)' }}>
            <span>Customer</span><span className="text-right">Outstanding</span><span className="text-right">Overdue</span><span className="text-right">Status</span>
          </div>
          {topCustomers.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nothing pending</div>
          ) : topCustomers.map(c => {
            const status = c.overdue > 0 ? { label: 'Overdue', color: 'var(--expense)' } : c.total > 0 ? { label: 'Current', color: 'var(--text-muted)' } : { label: 'Settled', color: 'var(--income)' }
            return (
              <div key={c.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-5 py-3" style={{ borderTop: '1px solid var(--border-2)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>{c.name.slice(0, 2).toUpperCase()}</span>
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                </div>
                <span className="text-[13px] font-bold text-right tabular-nums" style={{ color: 'var(--text)' }}>{mask(`₹${fmtAmt(c.total)}`)}</span>
                <span className="text-[13px] font-semibold text-right tabular-nums" style={{ color: c.overdue > 0 ? 'var(--expense)' : 'var(--text-faint)' }}>{c.overdue > 0 ? mask(`₹${fmtAmt(c.overdue)}`) : '—'}</span>
                <span className="text-[10.5px] font-bold text-right px-2 py-0.5 rounded-full justify-self-end" style={{ color: status.color, background: `color-mix(in srgb, ${status.color} 12%, transparent)` }}>{status.label}</span>
              </div>
            )
          })}
        </div>

        {/* Rail: breakdown + top debtor */}
        <div className="space-y-4">
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Ageing</p>
            <div className="space-y-2.5">
              {([['Not due', ageing.notDue, 'var(--income)'], ['1–30 days', ageing.d30, 'var(--amber)'], ['31–60 days', ageing.d60, '#E8863B'], ['60+ days', ageing.d60plus, 'var(--expense)']] as const).map(([label, val, col]) => (
                <div key={label} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><span className="w-2 h-2 rounded-full" style={{ background: col }} />{label}</span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--text)' }}>{mask(`₹${fmtAmt(val)}`)}</span>
                </div>
              ))}
            </div>
          </div>
          {topCustomers[0] && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Top debtor</p>
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>{topCustomers[0].name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{topCustomers[0].name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>₹{fmtAmt(topCustomers[0].total)} outstanding</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/customers/commission',  label: 'Incoming',           icon: DollarSign, desc: 'Orders & styles' },
          { href: '/customers/directory',   label: 'Customer Directory', icon: BookOpen,   desc: 'Manage customers' },
          { href: '/recoverables/invoices', label: 'Invoices',           icon: FileText,   desc: 'Customer billing' },
          { href: '/recoverables/tds',      label: 'TDS',                icon: Receipt,    desc: 'Tax deducted' },
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
    red:   { bg: 'color-mix(in srgb, var(--expense) 8%, transparent)',  icon: 'var(--expense)', text: 'var(--expense)' },
    amber: { bg: 'color-mix(in srgb, var(--amber) 8%, transparent)', icon: 'var(--amber)', text: 'var(--amber)' },
    green: { bg: 'color-mix(in srgb, var(--income) 8%, transparent)',  icon: 'var(--income)', text: 'var(--income)' },
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
      <p className="text-lg sm:text-xl font-bold break-words" style={{ color: c.text }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-faint, var(--text-muted))' }}>{sub}</p>
    </div>
  )
}
