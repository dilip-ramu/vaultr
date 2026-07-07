'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Target, AlertTriangle, RotateCcw, Pencil, Trash2, ChevronRight, X, ArrowLeft } from 'lucide-react'
import type { Budget, Category } from '@/lib/types'
import { getCategoryEmoji } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

const BudgetForm = dynamic(() => import('./BudgetForm'), { ssr: false })

interface Props {
  budgets: Budget[]
  expenseCategories: Category[]
  currentMonth: number
  currentYear: number
  /** Payee IDs that are linked to a customer (= reimbursable). Their
   *  transactions are excluded from per-budget spend so they don't inflate
   *  "your" spending. Kept as an array for serialisability across the
   *  server→client boundary; we deduplicate via a Set internally. */
  contrastPayeeIds?: string[]
  hideHeader?: boolean
  periodLabel?: string
}

interface BudgetTx {
  id: string
  name: string | null
  amount: number
  date: string
  notes: string | null
  type?: string
  payee?: { name: string } | null
  category?: { name: string; icon: string; color: string } | null
}

function periodRange(period: string, month: number, year: number) {
  if (period === 'monthly') {
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const to   = new Date(year, month, 0).toISOString().split('T')[0]
    return { from, to }
  }
  if (period === 'yearly') {
    // India financial year: 1 April → 31 March. If we're currently in
    // Jan/Feb/Mar, the FY started April of the previous calendar year.
    const now = new Date(year, month - 1)
    const fyStartYear = now.getMonth() < 3 ? year - 1 : year
    return {
      from: `${fyStartYear}-04-01`,
      to:   `${fyStartYear + 1}-03-31`,
    }
  }
  // weekly: current Mon–Sun
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const from = d.toISOString().split('T')[0]
  const sun = new Date(d); sun.setDate(d.getDate() + 6)
  return { from, to: sun.toISOString().split('T')[0] }
}

export default function BudgetsClient({
  budgets: initial, expenseCategories, currentMonth, currentYear, contrastPayeeIds = [], hideHeader = false, periodLabel,
}: Props) {
  const billablePayeeSet = useMemo(() => new Set(contrastPayeeIds), [contrastPayeeIds])
  const [budgets, setBudgets] = useState<Budget[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [editBudget, setEditBudget] = useState<Budget | undefined>()
  const [detailBudget, setDetailBudget] = useState<Budget | null>(null)
  const [detailTxs, setDetailTxs] = useState<BudgetTx[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const handleSaved = async (saved: Budget) => {
    const existing = budgets.find(b => b.id === saved.id)
    let spent = existing?.spent ?? 0

    if (!existing) {
      const supabase = createClient()
      const { from, to } = periodRange(saved.period, currentMonth, currentYear)

      const { data } = await supabase
        .from('transactions')
        .select('amount, payee_id, type')
        .in('type', ['expense', 'income'])
        .eq('category_id', saved.category_id)
        .gte('date', from)
        .lte('date', to)

      const rows = (data ?? []).filter(t =>
        !t.payee_id || !billablePayeeSet.has(t.payee_id)
      )
      spent = Math.max(0, rows.reduce((s, t) =>
        s + (t.type === 'income' ? -Number(t.amount) : Number(t.amount)), 0
      ))
    }

    const effective = saved.amount + (saved.rollover ? saved.rollover_amount : 0)
    const enriched = {
      ...saved,
      spent,
      remaining: effective - spent,
      percentage: effective > 0 ? (spent / effective) * 100 : 0,
    }

    setBudgets(prev => {
      const idx = prev.findIndex(b => b.id === saved.id)
      return idx >= 0
        ? prev.map((b, i) => (i === idx ? enriched : b))
        : [...prev, enriched]
    })
  }

  const handleDelete = async (id: string) => {
    if (!await confirmDialog('Delete this budget?')) return
    const supabase = createClient()
    await supabase.from('budgets').delete().eq('id', id)
    setBudgets(prev => prev.filter(b => b.id !== id))
  }

  const openDetail = async (b: Budget) => {
    setDetailBudget(b)
    setDetailTxs([])
    setDetailLoading(true)
    const supabase = createClient()
    const { from, to } = periodRange(b.period, currentMonth, currentYear)

    const { data } = await supabase
      .from('transactions')
      .select('id, name, amount, date, notes, payee_id, type, payee:payees(name), category:categories(name,icon,color)')
      .in('type', ['expense', 'income'])
      .eq('category_id', b.category_id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })

    const filtered = ((data ?? []) as unknown as (BudgetTx & { payee_id: string | null })[])
      .filter(t => !t.payee_id || !billablePayeeSet.has(t.payee_id))

    setDetailTxs(filtered)
    setDetailLoading(false)
  }

  const openEdit = (b: Budget) => {
    setEditBudget(b)
    setShowForm(true)
  }

  const overspent = budgets.filter(b => (b.percentage ?? 0) > 100)

  const healthScore = budgets.length === 0 ? 100 : Math.round(
    (budgets.reduce((sum, b) => {
      const eff = b.amount + (b.rollover ? b.rollover_amount : 0)
      return sum + Math.max(0, Math.min((b.remaining ?? eff) / eff, 1))
    }, 0) / budgets.length) * 100
  )

  const healthColor = healthScore > 70 ? 'var(--income)' : healthScore >= 40 ? 'var(--amber)' : 'var(--expense)'

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className={hideHeader ? 'space-y-5' : 'w-full px-4 md:px-8 py-6 space-y-5'}>

      {/* Header */}
      <div className="flex items-center justify-between">
        {!hideHeader ? (
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Budgets</h1>
            <p className="text-caption">{periodLabel ?? `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`}</p>
          </div>
        ) : (
          <p className="text-caption">{periodLabel ?? `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`}</p>
        )}
        <button
          onClick={() => { setEditBudget(undefined); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)', color: '#fff' }}
        >
          <Plus className="w-4 h-4" /> Add Budget
        </button>
      </div>

      {/* Overspend alert */}
      {overspent.length > 0 && (
        <div
          className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--expense)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--expense)' }}>
              Overspent in {overspent.length} {overspent.length === 1 ? 'category' : 'categories'} this month
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {overspent.map(b => b.category?.name ?? '').join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Summary band */}
      {budgets.length > 0 && (() => {
        const totalSpent = budgets.reduce((s, b) => s + (b.spent ?? 0), 0)
        const totalBudget = budgets.reduce((s, b) => s + (b.amount ?? 0), 0)
        const remaining = totalBudget - totalSpent
        const overCount = budgets.filter(b => (b.percentage ?? 0) > 100).length
        const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BTile label="SPENT OF BUDGET" value={`${inr(totalSpent)} / ${inr(totalBudget)}`} color="var(--text)" />
            <BTile label="REMAINING" value={inr(Math.max(remaining, 0))} color={remaining >= 0 ? 'var(--income)' : 'var(--expense)'} />
            <BTile label="ON TRACK" value={`${budgets.length - overCount} of ${budgets.length}`} color="var(--brand)" />
            <BTile label="OVER BUDGET" value={`${overCount} ${overCount === 1 ? 'category' : 'categories'}`} color={overCount > 0 ? 'var(--expense)' : 'var(--text-muted)'} />
          </div>
        )
      })()}

      {/* Budget cards */}
      {budgets.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'var(--brand-light)' }}>
            <Target className="w-7 h-7" style={{ color: 'var(--brand)' }} />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No budgets yet</p>
          <p className="text-caption mb-4">Set spending limits to take control of your finances</p>
          <button
            onClick={() => { setEditBudget(undefined); setShowForm(true) }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--brand)', color: '#fff' }}
          >
            Set your first budget
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => (
            <BudgetCard
              key={b.id}
              budget={b}
              onEdit={openEdit}
              onDelete={handleDelete}
              onOpen={openDetail}
            />
          ))}
        </div>
      )}

      {/* Budget detail sheet */}
      {detailBudget && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setDetailBudget(null)} />
          <div
            className="relative w-full md:max-w-lg flex flex-col"
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '28px 28px 0 0',
              maxHeight: '90dvh',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => setDetailBudget(null)} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
                  {detailBudget.category?.name ?? 'Budget'}
                </p>
                <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{detailBudget.period} transactions</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(detailBudget.spent ?? 0)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>of {formatCurrency(detailBudget.amount)}</p>
              </div>
            </div>

            {/* Mini progress bar */}
            <div className="mx-5 my-3 h-1.5 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: 'var(--surface-2)' }}>
              {(() => {
                const pct = detailBudget.percentage ?? 0
                const bar = pct < 70 ? 'var(--income)' : pct < 90 ? 'var(--amber)' : 'var(--expense)'
                return <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: bar }} />
              })()}
            </div>

            {/* Transaction list */}
            <div className="overflow-y-auto flex-1 min-h-0 px-5 pb-6">
              {detailLoading ? (
                <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
              ) : detailTxs.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No transactions yet</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Expenses in this category will appear here</p>
                </div>
              ) : (
                <div className="space-y-0 divide-y" style={{ borderColor: 'var(--border-2)' }}>
                  {detailTxs.map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                          {tx.name ?? tx.category?.name ?? 'Expense'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                            {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </span>
                          {tx.payee && (
                            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                              · {(tx.payee as unknown as { name: string }).name}
                            </span>
                          )}
                          {tx.notes && (
                            <span className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>· {tx.notes}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-semibold tabular-nums shrink-0"
                        style={{ color: tx.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <BudgetForm
          budget={editBudget}
          categories={expenseCategories}
          currentMonth={currentMonth}
          currentYear={currentYear}
          onSaved={saved => { setShowForm(false); handleSaved(saved) }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function BTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-[18px] font-extrabold tracking-tight mt-1 truncate" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}

function BudgetCard({ budget: b, onEdit, onDelete, onOpen }: {
  budget: Budget
  onEdit: (b: Budget) => void
  onDelete: (id: string) => void
  onOpen: (b: Budget) => void
}) {
  const spent = b.spent ?? 0
  const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
  const pct = b.percentage ?? 0
  const overspent = pct > 100

  const barColor = pct < 70 ? 'var(--income)' : pct < 90 ? 'var(--amber)' : 'var(--expense)'
  const emoji = getCategoryEmoji(b.category?.icon)

  return (
    <div
      className="rounded-2xl p-4 shadow-sm cursor-pointer transition-all active:scale-[0.99]"
      style={{ backgroundColor: 'var(--surface)', border: `1px solid ${overspent ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}
      onClick={() => onOpen(b)}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
            style={{ backgroundColor: b.category?.color ? `${b.category.color}20` : 'var(--surface-2)' }}
          >
            {emoji}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{b.category?.name ?? 'Unknown'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs capitalize" style={{ color: 'var(--text-faint)' }}>{b.period}</span>
              {b.rollover && (
                <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--transfer)' }}>
                  <RotateCcw className="w-2.5 h-2.5" /> Rollover
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {overspent && (
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold mr-1" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--expense)' }}>
              OVER
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onEdit(b) }}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-faint)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(b.id) }}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-faint)' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 ml-0.5" style={{ color: 'var(--text-faint)' }} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: 'var(--surface-2)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
      </div>

      {/* Amounts */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: barColor, fontWeight: 600 }}>{formatCurrency(spent)}</span>
          {' '}of {formatCurrency(effective)}
        </p>
        <p className="text-xs font-medium" style={{ color: overspent ? 'var(--expense)' : 'var(--text-faint)' }}>
          {overspent ? `${formatCurrency(Math.abs(b.remaining ?? 0))} over` : `${formatCurrency(b.remaining ?? 0)} left`}
        </p>
      </div>
    </div>
  )
}
