'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Clock, TrendingUp, ArrowRight,
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
  receivables: { balance_due: number; customer_id: string | null; customer_name: string | null }[]
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CustomerOverviewClient({ orders, styles, customers, receivables }: Props) {
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Customer Overview</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Incoming pipeline, overdue payments and receivables at a glance.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Pending Incoming"
          value={`₹${fmtAmt(stats.pendingAmt)}`}
          sub={`${stats.pendingCount} style${stats.pendingCount !== 1 ? 's' : ''}`}
          color="blue"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Payment Overdue"
          value={`₹${fmtAmt(stats.overdueAmt)}`}
          sub={`${stats.overdueCount} style${stats.overdueCount !== 1 ? 's' : ''} past due`}
          color="red"
          highlight={stats.overdueCount > 0}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Received This Month"
          value={`₹${fmtAmt(stats.thisMonthAmt)}`}
          sub={`₹${fmtAmt(stats.receivedAmt)} all time`}
          color="green"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Receivables"
          value={`₹${fmtAmt(stats.receivablesAmt)}`}
          sub={`${stats.receivablesCount} open invoice${stats.receivablesCount !== 1 ? 's' : ''}`}
          color="amber"
          highlight={stats.receivablesCount > 0}
        />
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top customers by pending commission */}
        <div className="lg:col-span-2 rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Top Pending Customers</h2>
            <Link href="/customers/commission" className="text-xs flex items-center gap-1" style={{ color: 'var(--brand)' }}>
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {topCustomers.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nothing pending</div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {topCustomers.map(c => (
                <div key={c.name} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {c.incoming > 0 && <span>₹{fmtAmt(c.incoming)} incoming</span>}
                      {c.incoming > 0 && c.receivable > 0 && ' · '}
                      {c.receivable > 0 && <span>₹{fmtAmt(c.receivable)} receivable</span>}
                      {c.overdue > 0 && <span style={{ color: '#ef4444' }}> · ₹{fmtAmt(c.overdue)} overdue</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: c.overdue > 0 ? '#ef4444' : 'var(--text)' }}>
                    ₹{fmtAmt(c.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently received */}
        <div className="rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recently Received</h2>
            <Link href="/customers/commission" className="text-xs flex items-center gap-1" style={{ color: 'var(--brand)' }}>
              View <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {stats.recentReceived.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nothing received yet</div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {stats.recentReceived.map(s => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{customerNameForStyle(s)}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      {s.style_ref ?? '—'} · {s.received_date ? fmtDate(s.received_date) : '—'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0 ml-2" style={{ color: '#22c55e' }}>
                    ₹{fmtAmt(Number(s.commission_inr || 0))}
                  </span>
                </div>
              ))}
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

function StatCard({ icon, label, value, sub, color, highlight }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; highlight?: boolean
}) {
  const colors: Record<string, { bg: string; icon: string; text: string }> = {
    blue:  { bg: 'rgba(42,122,80,0.08)',  icon: 'var(--brand)', text: 'var(--brand)' },
    red:   { bg: 'rgba(239,68,68,0.08)',  icon: '#ef4444', text: '#ef4444' },
    amber: { bg: 'rgba(245,158,11,0.08)', icon: '#f59e0b', text: '#f59e0b' },
    green: { bg: 'rgba(34,197,94,0.08)',  icon: '#22c55e', text: '#22c55e' },
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
