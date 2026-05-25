'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  RefreshCw, Plus, MoreHorizontal, Pencil, CheckCircle2,
  XCircle, TrendingUp, Calendar, Zap
} from 'lucide-react'
import type { Bill, Account, Category } from '@/lib/types'
import { EMOJI_MAP } from '@/lib/types'
import { formatCurrency, formatDateShort, getDaysUntil } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const BillForm = dynamic(() => import('../bills/BillForm'), { ssr: false })

interface Props {
  subscriptions: Bill[]
  dueThisWeek: Bill[]
  dueThisMonth: Bill[]
  monthlyTotal: number
  yearlyTotal: number
  spentThisYear: number
  accounts: Account[]
  categories: Category[]
}

function toMonthly(bill: Bill): number {
  switch (bill.recurrence_interval) {
    case 'weekly':  return bill.amount * (52 / 12)
    case 'yearly':  return bill.amount / 12
    default:        return bill.amount
  }
}

const INTERVAL_LABEL: Record<string, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  yearly: 'Yearly',
  daily: 'Daily',
}

export default function SubscriptionsClient({
  subscriptions: initial,
  dueThisWeek: initialDueWeek,
  dueThisMonth,
  monthlyTotal: initialMonthly,
  yearlyTotal: initialYearly,
  spentThisYear,
  accounts,
  categories,
}: Props) {
  const [subs, setSubs] = useState<Bill[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [editBill, setEditBill] = useState<Bill | null>(null)

  const monthlyTotal = subs.reduce((s, b) => s + toMonthly(b), 0)
  const yearlyTotal = monthlyTotal * 12
  const dueThisWeek = subs.filter(b => {
    const d = getDaysUntil(b.due_date)
    return d >= 0 && d <= 7
  })

  const handleSaved = (bill: Bill) => {
    setSubs(prev => {
      const idx = prev.findIndex(b => b.id === bill.id)
      if (idx >= 0) return prev.map(b => b.id === bill.id ? bill : b)
      return bill.is_recurring && bill.status === 'pending'
        ? [...prev, bill].sort((a, b) => a.due_date.localeCompare(b.due_date))
        : prev
    })
    setShowForm(false)
    setEditBill(null)
  }

  const handleMarkPaid = async (bill: Bill) => {
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase.from('bills').update({ status: 'paid', settled_at: now }).eq('id', bill.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (user && bill.direction !== 'sent') {
      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: bill.account_id,
        category_id: bill.category_id,
        type: 'expense',
        amount: bill.amount,
        date: new Date().toISOString().split('T')[0],
        notes: `Subscription paid: ${bill.name}`,
        bill_id: bill.id,
      })
    }
    setSubs(prev => prev.filter(b => b.id !== bill.id))
  }

  const handleCancel = async (bill: Bill) => {
    if (!confirm(`Cancel "${bill.name}" subscription? It will no longer recur.`)) return
    const supabase = createClient()
    await supabase.from('bills').update({ is_recurring: false }).eq('id', bill.id)
    setSubs(prev => prev.filter(b => b.id !== bill.id))
  }

  // Group by interval
  const groups: Record<string, Bill[]> = {}
  for (const b of subs) {
    const key = b.recurrence_interval ?? 'monthly'
    if (!groups[key]) groups[key] = []
    groups[key].push(b)
  }
  const intervalOrder = ['monthly', 'weekly', 'yearly', 'daily']
  const sortedGroups = intervalOrder.filter(k => groups[k]?.length)

  // Insight: most expensive normalized monthly
  const mostExpensive = subs.length > 0
    ? subs.reduce((max, b) => toMonthly(b) > toMonthly(max) ? b : max, subs[0])
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading" style={{ color: 'var(--text)' }}>Subscriptions</h1>
          <p className="text-caption">{subs.length} active recurring</p>
        </div>
        <button
          onClick={() => { setEditBill(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)', color: '#fff' }}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Summary cards — horizontal scroll on mobile */}
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <StatCard
          label="Monthly Cost"
          value={formatCurrency(monthlyTotal)}
          icon={<RefreshCw className="w-4 h-4" />}
          color="var(--brand)"
        />
        <StatCard
          label="Yearly Cost"
          value={formatCurrency(yearlyTotal)}
          icon={<TrendingUp className="w-4 h-4" />}
          color="var(--income)"
        />
        <StatCard
          label="Active"
          value={String(subs.length)}
          icon={<Zap className="w-4 h-4" />}
          color="var(--transfer)"
        />
        <StatCard
          label="Due This Week"
          value={String(dueThisWeek.length)}
          icon={<Calendar className="w-4 h-4" />}
          color={dueThisWeek.length > 0 ? 'var(--expense)' : 'var(--text-muted)'}
          highlight={dueThisWeek.length > 0}
        />
      </div>

      {/* Due Soon */}
      {dueThisWeek.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Due Soon</p>
          <div className="space-y-2">
            {dueThisWeek.map(b => (
              <SubRow
                key={b.id}
                bill={b}
                highlight
                onEdit={b => { setEditBill(b); setShowForm(true) }}
                onMarkPaid={handleMarkPaid}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {subs.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: 'var(--brand-light)' }}
          >
            <RefreshCw className="w-7 h-7" style={{ color: 'var(--brand)' }} />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No subscriptions tracked</p>
          <p className="text-caption mb-4">Add recurring bills to track your subscriptions</p>
          <button
            onClick={() => { setEditBill(null); setShowForm(true) }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--brand)', color: '#fff' }}
          >
            Add first subscription
          </button>
        </div>
      )}

      {/* Grouped list */}
      {sortedGroups.map(interval => (
        <div key={interval}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            {INTERVAL_LABEL[interval] ?? interval}
          </p>
          <div
            className="rounded-2xl overflow-hidden shadow-sm"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {groups[interval].map((b, i, arr) => (
              <SubRow
                key={b.id}
                bill={b}
                isLast={i === arr.length - 1}
                onEdit={b => { setEditBill(b); setShowForm(true) }}
                onMarkPaid={handleMarkPaid}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Insights footer */}
      {subs.length > 0 && (
        <div
          className="rounded-2xl p-4 space-y-2.5"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-label" style={{ color: 'var(--text-faint)' }}>Insights</p>
          {mostExpensive && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Most expensive:{' '}
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{mostExpensive.name}</span>
              {' '}at{' '}
              <span style={{ color: 'var(--expense)', fontWeight: 600 }}>
                {formatCurrency(toMonthly(mostExpensive))}/mo
              </span>
            </p>
          )}
          {spentThisYear > 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              You&apos;ve paid{' '}
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {formatCurrency(spentThisYear)}
              </span>
              {' '}on subscriptions this year
            </p>
          )}
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Estimated annual cost:{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>
              {formatCurrency(yearlyTotal)}
            </span>
          </p>
        </div>
      )}

      {showForm && (
        <BillForm
          bill={editBill}
          defaultDirection="received"
          accounts={accounts}
          categories={categories}
          customers={[]}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditBill(null) }}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, highlight = false,
}: {
  label: string; value: string; icon: React.ReactNode; color: string; highlight?: boolean
}) {
  return (
    <div
      className="shrink-0 rounded-2xl p-4 shadow-sm"
      style={{
        minWidth: 120,
        backgroundColor: highlight ? `${color}10` : 'var(--surface)',
        border: `1px solid ${highlight ? color + '40' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2" style={{ color }}>
        {icon}
        <p className="text-label" style={{ color: 'var(--text-faint)' }}>{label}</p>
      </div>
      <p className="text-base font-bold tabular-nums" style={{ color: highlight ? color : 'var(--text)' }}>
        {value}
      </p>
    </div>
  )
}

function SubRow({
  bill: b, highlight = false, isLast = true,
  onEdit, onMarkPaid, onCancel,
}: {
  bill: Bill
  highlight?: boolean
  isLast?: boolean
  onEdit: (b: Bill) => void
  onMarkPaid: (b: Bill) => void
  onCancel: (b: Bill) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const daysUntil = getDaysUntil(b.due_date)
  const cat = b.category as Category | undefined
  const emoji = EMOJI_MAP[cat?.icon ?? ''] ?? '🔄'
  const monthly = toMonthly(b)
  const showMonthlyNote = b.recurrence_interval === 'yearly'

  const dueBadgeColor = daysUntil < 0
    ? 'var(--expense)'
    : daysUntil <= 3
    ? '#F59E0B'
    : 'var(--text-faint)'

  const dueLabel = daysUntil < 0
    ? `${Math.abs(daysUntil)}d overdue`
    : daysUntil === 0
    ? 'Due today'
    : `in ${daysUntil}d`

  return (
    <div
      className="flex items-center gap-3 px-4"
      style={{
        minHeight: 64,
        paddingTop: 12,
        paddingBottom: 12,
        borderBottom: !isLast ? '1px solid var(--border-2)' : 'none',
        backgroundColor: highlight ? 'rgba(239,68,68,0.04)' : 'transparent',
      }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0"
        style={{ backgroundColor: cat?.color ? `${cat.color}20` : 'var(--surface-2)' }}
      >
        {emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{b.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {INTERVAL_LABEL[b.recurrence_interval ?? 'monthly']}
          </span>
          <span className="text-xs" style={{ color: dueBadgeColor }}>
            · {formatDateShort(b.due_date)} ({dueLabel})
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>
          {formatCurrency(b.amount)}
        </p>
        {showMonthlyNote && (
          <p className="text-[10px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
            {formatCurrency(monthly)}/mo
          </p>
        )}
      </div>

      {/* 3-dot menu */}
      <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setShowMenu(m => !m)}
          className="w-7 h-7 flex items-center justify-center rounded-lg"
          style={{ color: 'var(--text-faint)' }}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div
              className="absolute right-0 top-8 rounded-xl shadow-lg py-1 z-20 min-w-36"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => { setShowMenu(false); onEdit(b) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm"
                style={{ color: 'var(--text)' }}
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => { setShowMenu(false); onMarkPaid(b) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm"
                style={{ color: 'var(--income)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
              </button>
              <button
                onClick={() => { setShowMenu(false); onCancel(b) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm"
                style={{ color: 'var(--expense)' }}
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
